// 数据库入口
// 通过适配层统一对外暴露 prepare / exec 接口。
//
// 环境变量：
//   DB_TYPE=sqlite   本地开发，使用 db/study.db（默认）
//   DB_TYPE=postgres 生产环境，使用 Supabase（需同时提供 DATABASE_URL）

const adapter = require('./adapter');

module.exports = {
  prepare: adapter.prepare,
  exec: adapter.exec,
  healthCheck: adapter.healthCheck,
  close: adapter.close,
  isPostgres: adapter.isPostgres,
  dbType: adapter.dbType,
};
