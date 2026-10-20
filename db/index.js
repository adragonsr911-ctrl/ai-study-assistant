// 数据库连接模块
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db', 'study.db');
const db = new Database(dbPath);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 启用WAL模式，提高并发性能
db.pragma('journal_mode = WAL');

module.exports = db;
