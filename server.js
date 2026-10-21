// 加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// 导入路由
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const knowledgeRoutes = require('./routes/knowledge');
const planRoutes = require('./routes/plan');
const mistakeRoutes = require('./routes/mistake');
const dashboardRoutes = require('./routes/dashboard');
const diagnosisRoutes = require('./routes/diagnosis');
const quizRoutes = require('./routes/quiz');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// 数据库迁移：确保知识点表有subject字段
const db = require('./db');
try {
  db.exec(`ALTER TABLE knowledge_points ADD COLUMN subject TEXT DEFAULT ''`);
  console.log('✓ 数据库迁移：knowledge_points.subject 字段已添加');
} catch (e) {
  // 列已存在，忽略
}

// 数据库迁移：确保错题表有image_path字段
try {
  db.exec(`ALTER TABLE mistakes ADD COLUMN image_path TEXT DEFAULT ''`);
  console.log('✓ 数据库迁移：mistakes.image_path 字段已添加');
} catch (e) {
  // 列已存在，忽略
}

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, 'public')));

// 静态文件服务（上传的图片）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/mistake', mistakeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/upload', uploadRoutes);

// 根路径重定向到首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

// 启动服务器
app.listen(PORT, () => {
  console.log('========================================');
  console.log('  AI智能学习助手 已启动');
  console.log('  访问地址: http://localhost:' + PORT);
  console.log('========================================');
});
