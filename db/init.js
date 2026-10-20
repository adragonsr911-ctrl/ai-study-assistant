// 数据库初始化脚本
// 运行命令：npm run init-db

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保db目录存在
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 连接数据库（不存在则创建）
const dbPath = path.join(dbDir, 'study.db');
const db = new Database(dbPath);

console.log('开始初始化数据库...');

// 启用外键约束
db.pragma('foreign_keys = ON');

// 用户表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    nickname TEXT,
    security_question TEXT,
    security_answer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log('✓ 用户表创建完成');

// 对话会话表
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log('✓ 对话会话表创建完成');

// 对话消息表
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);
console.log('✓ 对话消息表创建完成');

// 知识点表
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log('✓ 知识点表创建完成');

// 学习计划表
db.exec(`
  CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    daily_hours REAL NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log('✓ 学习计划表创建完成');

// 错题本表
db.exec(`
  CREATE TABLE IF NOT EXISTS mistakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    question TEXT NOT NULL,
    your_answer TEXT,
    correct_answer TEXT,
    analysis TEXT,
    similar_questions TEXT,
    mastery_level INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    next_review_at TEXT,
    last_reviewed_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log('✓ 错题本表创建完成');

// 学习记录表
db.exec(`
  CREATE TABLE IF NOT EXISTS study_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    record_date DATE NOT NULL,
    chat_count INTEGER DEFAULT 0,
    knowledge_count INTEGER DEFAULT 0,
    mistake_count INTEGER DEFAULT 0,
    study_minutes INTEGER DEFAULT 0,
    UNIQUE(user_id, record_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log('✓ 学习记录表创建完成');

// AI学习诊断报告表
db.exec(`
  CREATE TABLE IF NOT EXISTS diagnosis_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log('✓ AI诊断报告表创建完成');

// AI出题记录表
db.exec(`
  CREATE TABLE IF NOT EXISTS quiz_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    title TEXT,
    questions_json TEXT NOT NULL,
    user_answers_json TEXT,
    score INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log('✓ AI出题记录表创建完成');

// 创建索引
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_user ON knowledge_points(user_id);
  CREATE INDEX IF NOT EXISTS idx_plans_user ON study_plans(user_id);
  CREATE INDEX IF NOT EXISTS idx_mistakes_user ON mistakes(user_id);
  CREATE INDEX IF NOT EXISTS idx_records_user ON study_records(user_id);
  CREATE INDEX IF NOT EXISTS idx_diagnosis_user ON diagnosis_reports(user_id);
`);
console.log('✓ 索引创建完成');

console.log('');
console.log('========================================');
console.log('  数据库初始化完成！');
console.log('  数据库文件: ' + dbPath);
console.log('========================================');

db.close();
