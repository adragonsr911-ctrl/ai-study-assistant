// 数据迁移脚本：SQLite -> PostgreSQL（Supabase）
// 用法：
//   node scripts/migrate-data.js
//
// 前置条件：
//   1. .env 里配置好 DATABASE_URL（指向 Supabase）
//   2. 已运行 npm run init-db 在目标库建好表
//
// 说明：
//   - 从本地 db/study.db 读取全部数据
//   - 逐表写入 PostgreSQL，保留原有 id
//   - 写完后重置自增序列，避免后续插入主键冲突

require('dotenv').config();

const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const SQLITE_PATH = process.env.SQLITE_SOURCE || path.join(__dirname, '..', 'db', 'study.db');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('错误：未配置 DATABASE_URL 环境变量');
  process.exit(1);
}

// 按依赖顺序排列（被引用的表在前）
const TABLES = [
  'users',
  'conversations',
  'messages',
  'knowledge_points',
  'study_plans',
  'mistakes',
  'study_records',
  'diagnosis_reports',
  'quiz_sets',
  'knowledge_embeddings',
];

async function main() {
  console.log('数据迁移：SQLite -> PostgreSQL');
  console.log('源数据库: ' + SQLITE_PATH);
  console.log('目标: ' + DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
  console.log('');

  if (!require('fs').existsSync(SQLITE_PATH)) {
    console.error('错误：源数据库文件不存在: ' + SQLITE_PATH);
    process.exit(1);
  }

  const src = new Database(SQLITE_PATH, { readonly: true });
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  try {
    // 先清空目标库的表（倒序删除，避免外键冲突）
    console.log('清空目标库现有数据...');
    for (const table of [...TABLES].reverse()) {
      try {
        await pool.query(`DELETE FROM ${table}`);
      } catch (e) {
        console.log('  跳过 ' + table + ': ' + e.message);
      }
    }

    // 逐表迁移
    let totalRows = 0;
    for (const table of TABLES) {
      let rows;
      try {
        rows = src.prepare(`SELECT * FROM ${table}`).all();
      } catch (e) {
        console.log('  跳过 ' + table + '（源表不存在）');
        continue;
      }

      if (rows.length === 0) {
        console.log('  ' + table.padEnd(24) + '0 行（跳过）');
        continue;
      }

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => '$' + (i + 1)).join(', ');
      const colList = columns.map(c => `"${c}"`).join(', ');
      const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`;

      let inserted = 0;
      for (const row of rows) {
        const values = columns.map(c => row[c]);
        try {
          await pool.query(sql, values);
          inserted++;
        } catch (e) {
          console.error('    插入失败 (' + table + '): ' + e.message);
        }
      }

      console.log('  ' + table.padEnd(24) + inserted + ' / ' + rows.length + ' 行');
      totalRows += inserted;
    }

    // 重置自增序列
    console.log('');
    console.log('重置自增序列...');
    for (const table of TABLES) {
      try {
        await pool.query(`
          SELECT setval(
            pg_get_serial_sequence('${table}', 'id'),
            COALESCE((SELECT MAX(id) FROM ${table}), 1)
          )
        `);
      } catch (e) {
        // 表可能没有 id 列或序列，忽略
      }
    }
    console.log('  完成');

    console.log('');
    console.log('========================================');
    console.log('  迁移完成，共 ' + totalRows + ' 行数据');
    console.log('========================================');
  } finally {
    src.close();
    await pool.end();
  }
}

main().catch(err => {
  console.error('迁移失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
