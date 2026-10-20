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

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, 'public')));

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/mistake', mistakeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/diagnosis', diagnosisRoutes);

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
