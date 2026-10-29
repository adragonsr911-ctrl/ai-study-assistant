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

// 数据库连接与自动建表
const db = require('./db');
const initDatabase = require('./db/schema');

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, 'public')));

// 上传文件目录：优先使用环境变量UPLOAD_DIR（Railway持久化卷），否则用本地路径
const fs = require('fs');
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 静态文件服务（上传的图片）
app.use('/uploads', express.static(uploadDir));

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

// 存储健康检查接口（用于排查部署配置问题，不泄露密钥内容）
app.get('/api/health/storage', async (req, res) => {
  const storage = require('./utils/storage');
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  const info = {
    storageType: storage.storageType,
    bucket: storage.bucket,
    supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, '') || '(未配置，将从DATABASE_URL推导)',
    keyConfigured: !!key,
    keyLength: key.length,
    keyPrefix: key ? key.substring(0, 10) + '...' : '(空)',
    keyFormat: key.startsWith('sb_secret_') ? '新版secret密钥' : (key.startsWith('eyJ') ? '旧版JWT密钥' : '未知格式'),
    dbType: db.dbType,
  };
  res.json(info);
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
async function startServer() {
  try {
    // 数据库健康检查
    await db.healthCheck();
    console.log('✓ 数据库连接成功（' + db.dbType + '）');

    // 自动建表
    await initDatabase();
    console.log('✓ 数据库表结构检查完成');
  } catch (err) {
    console.error('✗ 数据库初始化失败:', err.message);
    console.error('  服务将继续启动，但数据库相关接口会报错');
  }

  app.listen(PORT, () => {
    console.log('========================================');
    console.log('  AI智能学习助手 已启动');
    console.log('  访问地址: http://localhost:' + PORT);
    console.log('  数据库类型: ' + db.dbType);
    console.log('========================================');
  });
}

startServer();
