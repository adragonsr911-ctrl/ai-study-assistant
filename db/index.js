// 数据库连接模块
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库路径：优先使用环境变量DB_PATH（Railway持久化卷），否则用本地路径
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'study.db');

// 确保数据库目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 启用WAL模式，提高并发性能
db.pragma('journal_mode = WAL');

module.exports = db;
