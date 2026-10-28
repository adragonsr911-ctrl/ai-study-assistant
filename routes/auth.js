// 用户认证路由
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'chuanzhibei_default_secret';

/**
 * 用户注册
 * POST /api/auth/register
 * Body: { username, password, nickname }
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname, security_question, security_answer } = req.body;

    // 参数校验
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在3-20个字符之间' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6位' });
    }
    if (!security_question || !security_answer) {
      return res.status(400).json({ error: '请设置安全问题和答案，用于找回密码' });
    }

    // 检查用户名是否已存在
    const existingUser = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已被注册' });
    }

    // 密码加密
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 插入用户
    const result = await db.prepare(`
      INSERT INTO users (username, password, nickname, security_question, security_answer)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, hashedPassword, nickname || username, security_question, security_answer);

    // 生成token
    const token = jwt.sign(
      { userId: result.lastInsertRowid, username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: '注册成功',
      token,
      user: {
        id: result.lastInsertRowid,
        username,
        nickname: nickname || username,
      },
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // 查询用户
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 验证密码
    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
      },
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.prepare('SELECT id, username, nickname, created_at FROM users WHERE id = ?')
      .get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ user });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

/**
 * 获取用户安全问题（忘记密码第一步）
 * GET /api/auth/security-question?username=xxx
 */
router.get('/security-question', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: '请输入用户名' });
    }
    const user = await db.prepare('SELECT security_question FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (!user.security_question) {
      return res.status(400).json({ error: '该账号未设置安全问题，无法通过此方式找回密码' });
    }
    res.json({ security_question: user.security_question });
  } catch (error) {
    console.error('获取安全问题错误:', error);
    res.status(500).json({ error: '获取失败，请稍后重试' });
  }
});

/**
 * 重置密码（忘记密码第二步）
 * POST /api/auth/reset-password
 * Body: { username, security_answer, new_password }
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { username, security_answer, new_password } = req.body;
    if (!username || !security_answer || !new_password) {
      return res.status(400).json({ error: '请填写完整信息' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' });
    }
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (!user.security_answer) {
      return res.status(400).json({ error: '该账号未设置安全问题' });
    }
    if (user.security_answer.trim() !== security_answer.trim()) {
      return res.status(401).json({ error: '安全答案不正确' });
    }
    const hashedPassword = bcrypt.hashSync(new_password, 10);
    await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, user.id);
    res.json({ message: '密码重置成功，请使用新密码登录' });
  } catch (error) {
    console.error('重置密码错误:', error);
    res.status(500).json({ error: '重置失败，请稍后重试' });
  }
});

module.exports = router;
