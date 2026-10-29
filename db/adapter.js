// 数据库适配层
// 目标：业务代码继续使用 db.prepare(sql).get()/.all()/.run() 的写法，
//      底层可切换 SQLite（本地开发）或 PostgreSQL（Supabase，生产持久化）。
//
// 设计要点：
// 1. SQL 自动转换：? 占位符 -> $1,$2；@name 具名参数 -> $n；AUTOINCREMENT -> 自增列
// 2. 返回结构兼容 better-sqlite3：.run() 返回 { changes, lastInsertRowid }
// 3. PostgreSQL 为异步，故所有方法返回 Promise

const path = require('path');
const fs = require('fs');

const DB_TYPE = (process.env.DB_TYPE || 'sqlite').toLowerCase();
const USE_PG = DB_TYPE === 'postgres' || DB_TYPE === 'postgresql';

let pgPool = null;
let sqliteDb = null;

// ---------------------------------------------------------------------------
// SQL 转换：SQLite 方言 -> PostgreSQL 方言
// ---------------------------------------------------------------------------

/**
 * 将 SQLite 风格的 SQL 转换为 PostgreSQL 风格。
 * 只做必要的、安全的替换，避免误伤字符串字面量。
 */
function convertSql(sql) {
  if (!USE_PG) return sql;

  let out = sql;

  // 1) 自增主键：INTEGER PRIMARY KEY AUTOINCREMENT -> BIGSERIAL PRIMARY KEY
  out = out.replace(
    /INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi,
    'BIGSERIAL PRIMARY KEY'
  );
  // 变体：INTEGER PRIMARY KEY (不含 AUTOINCREMENT)
  out = out.replace(
    /INTEGER\s+PRIMARY\s+KEY(?!\s*[,)])/gi,
    'BIGSERIAL PRIMARY KEY'
  );

  // 2) DATETIME/TEXT 时间类型在 PG 里用 TIMESTAMP
  out = out.replace(/\bDATETIME\b/gi, 'TIMESTAMP');

  // 3) REAL -> DOUBLE PRECISION
  out = out.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');

  // 4) INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
  out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  if (/INSERT\s+OR\s+IGNORE/i.test(sql)) {
    out = out.replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING';
  }

  // 5) 占位符 ? -> $1,$2,...（跳过字符串字面量内部）
  out = replaceQuestionMarks(out);

  return out;
}

/**
 * 把 ? 占位符替换为 $n，跳过单引号字符串内部。
 */
function replaceQuestionMarks(sql) {
  let result = '';
  let index = 1;
  let inString = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === "'") {
      // 处理转义的单引号 ''
      if (inString && sql[i + 1] === "'") {
        result += "''";
        i++;
        continue;
      }
      inString = !inString;
      result += ch;
      continue;
    }

    if (ch === '?' && !inString) {
      result += '$' + index;
      index++;
      continue;
    }

    result += ch;
  }

  return result;
}

/**
 * 把 @name 具名参数转换为 $n，并返回有序参数数组。
 * better-sqlite3 支持 .run({ name: value })，PG 需要位置参数。
 */
function convertNamedParams(sql, params) {
  if (!USE_PG) return { sql, values: params };
  if (params.length !== 1) return { sql, values: params };

  const arg = params[0];
  if (arg === null || typeof arg !== 'object' || Array.isArray(arg)) {
    return { sql, values: params };
  }

  const values = [];
  const seen = new Map();
  let inString = false;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === "'") {
      if (inString && sql[i + 1] === "'") {
        result += "''";
        i++;
        continue;
      }
      inString = !inString;
      result += ch;
      continue;
    }

    if (ch === '@' && !inString) {
      // 读取参数名
      let name = '';
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) {
        name += sql[j];
        j++;
      }
      if (name && Object.prototype.hasOwnProperty.call(arg, name)) {
        if (!seen.has(name)) {
          values.push(arg[name]);
          seen.set(name, values.length);
        }
        result += '$' + seen.get(name);
        i = j - 1;
        continue;
      }
    }

    result += ch;
  }

  return { sql: result, values };
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

function getPgPool() {
  if (pgPool) return pgPool;

  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DB_TYPE=postgres 时必须提供 DATABASE_URL 环境变量');
  }

  pgPool = new Pool({
    connectionString,
    ssl: /supabase\.com|sslmode=require/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  pgPool.on('error', (err) => {
    console.error('PostgreSQL 连接池错误:', err.message);
  });

  return pgPool;
}

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;

  const Database = require('better-sqlite3');
  const dbPath =
    process.env.DB_PATH || path.join(__dirname, '..', 'db', 'study.db');

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.pragma('journal_mode = WAL');

  return sqliteDb;
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/**
 * 归一化 PostgreSQL 返回的行数据。
 *
 * 背景：pg 驱动默认把 bigint（int8）转成字符串，以避免超出 JS 安全整数范围。
 * 但 COUNT(*)、SUM() 等聚合函数在 PostgreSQL 中返回 bigint，
 * 业务代码拿到的就是 "2" 这样的字符串，做算术会变成字符串拼接：
 *   0 + "2" + "1" + "1"  =>  "0211"
 *
 * 本项目所有计数值都远小于 2^53，因此统一转成 Number 是安全的，
 * 也让 PostgreSQL 模式与 SQLite 模式的行为保持一致。
 */
function normalizeRow(row) {
  if (!USE_PG || !row) return row;

  for (const key of Object.keys(row)) {
    row[key] = toNumber(row[key]);
  }
  return row;
}

/**
 * 把纯数字字符串转成 Number。
 * PostgreSQL 的 bigint（int8）经 pg 驱动返回时是字符串，
 * 转成 Number 后与 SQLite 模式行为一致。
 */
function toNumber(value) {
  if (typeof value === 'string' && value !== '' && /^-?\d+$/.test(value)) {
    const num = Number(value);
    if (Number.isSafeInteger(num)) {
      return num;
    }
  }
  return value;
}

/**
 * 批量归一化。
 */
function normalizeRows(rows) {
  if (!USE_PG || !Array.isArray(rows)) return rows;
  for (const row of rows) {
    normalizeRow(row);
  }
  return rows;
}

/**
 * 执行一条不返回结果的语句（建表、索引等）。
 */
async function exec(sql) {
  if (USE_PG) {
    const converted = convertSql(sql);
    // PG 的 query 支持多语句
    await getPgPool().query(converted);
    return;
  }
  getSqliteDb().exec(sql);
}

/**
 * 预处理 SQL，返回带 get/all/run 的对象（与 better-sqlite3 一致）。
 */
function prepare(sql) {
  const convertedSql = convertSql(sql);

  return {
    async get(...params) {
      const { sql: finalSql, values } = convertNamedParams(convertedSql, params);

      if (USE_PG) {
        const res = await getPgPool().query(finalSql, values);
        return normalizeRow(res.rows[0]);
      }

      return getSqliteDb().prepare(finalSql).get(...values);
    },

    async all(...params) {
      const { sql: finalSql, values } = convertNamedParams(convertedSql, params);

      if (USE_PG) {
        const res = await getPgPool().query(finalSql, values);
        return normalizeRows(res.rows);
      }

      return getSqliteDb().prepare(finalSql).all(...values);
    },

    async run(...params) {
      const { sql: finalSql, values } = convertNamedParams(convertedSql, params);

      if (USE_PG) {
        // 若为 INSERT，追加 RETURNING id 以便拿到自增主键
        let querySql = finalSql;
        const isInsert = /^\s*INSERT\s+INTO/i.test(querySql);
        const hasReturning = /\bRETURNING\b/i.test(querySql);
        if (isInsert && !hasReturning) {
          querySql = querySql.replace(/;\s*$/, '') + ' RETURNING id';
        }

        const res = await getPgPool().query(querySql, values);

        return {
          changes: res.rowCount,
          // RETURNING id 拿到的是 bigint，pg 驱动会转成字符串，
          // 这里转回 Number，与 SQLite 的 lastInsertRowid 行为保持一致
          lastInsertRowid: res.rows[0] ? toNumber(res.rows[0].id) : undefined,
        };
      }

      const info = getSqliteDb().prepare(finalSql).run(...values);
      return {
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
      };
    },
  };
}

/**
 * 健康检查：确认数据库可连接。
 */
async function healthCheck() {
  if (USE_PG) {
    const res = await getPgPool().query('SELECT 1 AS ok');
    return Number(res.rows[0].ok) === 1;
  }
  getSqliteDb().prepare('SELECT 1 AS ok').get();
  return true;
}

/**
 * 关闭连接（进程退出时用）。
 */
async function close() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}

module.exports = {
  prepare,
  exec,
  healthCheck,
  close,
  isPostgres: USE_PG,
  dbType: USE_PG ? 'postgres' : 'sqlite',
};
