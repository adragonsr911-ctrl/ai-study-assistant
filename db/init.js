// 数据库初始化脚本（兼容 SQLite 与 PostgreSQL）
// 用法：
//   npm run init-db                    使用 SQLite（默认）
//   DB_TYPE=postgres DATABASE_URL=... npm run init-db   初始化 Supabase
//
// 说明：适配层会自动转换方言，这里保持 SQLite 风格写法。

require('dotenv').config();

const path = require('path');
const db = require('./index');
const initDatabase = require('./schema');

async function main() {
  console.log('开始初始化数据库...');
  console.log('数据库类型: ' + db.dbType);

  try {
    // 健康检查
    await db.healthCheck();
    console.log('✓ 数据库连接成功');

    // 建表
    await initDatabase();
    console.log('✓ 所有表结构检查完成');

    // 统计现有数据
    const tables = [
      'users', 'conversations', 'messages', 'knowledge_points',
      'study_plans', 'mistakes', 'study_records', 'diagnosis_reports',
      'quiz_sets', 'knowledge_embeddings',
    ];

    console.log('\n当前数据量：');
    for (const table of tables) {
      try {
        const row = await db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get();
        console.log('  ' + table.padEnd(24) + (row ? Number(row.cnt) : 0));
      } catch (e) {
        console.log('  ' + table.padEnd(24) + '（表不存在或查询失败）');
      }
    }

    console.log('\n========================================');
    console.log('  数据库初始化完成！');
    console.log('========================================');
  } catch (err) {
    console.error('初始化失败:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main();
