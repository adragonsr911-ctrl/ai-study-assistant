// 学习计划路由
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { callDoubao, SYSTEM_PROMPTS } = require('../utils/doubao');

const router = express.Router();

/**
 * 获取学习计划列表
 * GET /api/plan
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const plans = db.prepare(`
      SELECT id, subject, exam_date, daily_hours, created_at
      FROM study_plans
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    res.json({ plans });
  } catch (error) {
    console.error('获取学习计划列表错误:', error);
    res.status(500).json({ error: '获取学习计划列表失败' });
  }
});

/**
 * 获取单个学习计划详情
 * GET /api/plan/:id
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const plan = db.prepare(
      'SELECT * FROM study_plans WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!plan) {
      return res.status(404).json({ error: '学习计划不存在' });
    }

    res.json({ plan });
  } catch (error) {
    console.error('获取学习计划详情错误:', error);
    res.status(500).json({ error: '获取学习计划详情失败' });
  }
});

/**
 * 生成学习计划
 * POST /api/plan/generate
 * Body: { subject, exam_date, daily_hours }
 */
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { subject, exam_date, daily_hours } = req.body;

    if (!subject || !exam_date || !daily_hours) {
      return res.status(400).json({ error: '请填写完整的科目、考试日期和每日学习时长' });
    }

    const hours = parseFloat(daily_hours);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      return res.status(400).json({ error: '每日学习时长必须是0-24之间的数字' });
    }

    // 验证日期格式
    const examDate = new Date(exam_date);
    if (isNaN(examDate.getTime())) {
      return res.status(400).json({ error: '考试日期格式不正确' });
    }

    const today = new Date();
    if (examDate <= today) {
      return res.status(400).json({ error: '考试日期必须在未来' });
    }

    // 获取今天日期字符串
    const todayStr = today.toISOString().split('T')[0];

    // 调用豆包API生成学习计划
    const userPrompt = `请为我生成一份学习计划：
- 今天日期：${todayStr}
- 科目：${subject}
- 考试日期：${exam_date}
- 每天可学习时长：${daily_hours}小时

请从今天（${todayStr}）开始安排，不要从其他日期开始。`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.plan },
      { role: 'user', content: userPrompt },
    ];

    let content;
    try {
      content = await callDoubao(messages, { temperature: 0.5, max_tokens: 16000 });
    } catch (apiError) {
      return res.status(502).json({
        error: 'AI生成失败',
        message: apiError.message,
      });
    }

    // 保存到数据库
    const result = db.prepare(`
      INSERT INTO study_plans (user_id, subject, exam_date, daily_hours, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, subject, exam_date, hours, content);

    res.status(201).json({
      plan: {
        id: result.lastInsertRowid,
        subject,
        exam_date,
        daily_hours: hours,
        content,
      },
    });
  } catch (error) {
    console.error('生成学习计划错误:', error);
    res.status(500).json({ error: '生成学习计划失败，请稍后重试' });
  }
});

/**
 * 删除学习计划
 * DELETE /api/plan/:id
 */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM study_plans WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '学习计划不存在' });
    }

    res.json({ message: '学习计划已删除' });
  } catch (error) {
    console.error('删除学习计划错误:', error);
    res.status(500).json({ error: '删除学习计划失败' });
  }
});

module.exports = router;
