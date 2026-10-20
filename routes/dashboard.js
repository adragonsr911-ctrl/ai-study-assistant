// 学习数据看板路由
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * 获取学习数据概览
 * GET /api/dashboard/summary
 */
router.get('/summary', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    // 总对话次数
    const totalChats = db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.role = 'user'
    `).get(userId).count;

    // 知识点总数
    const totalKnowledge = db.prepare(
      'SELECT COUNT(*) as count FROM knowledge_points WHERE user_id = ?'
    ).get(userId).count;

    // 错题总数
    const totalMistakes = db.prepare(
      'SELECT COUNT(*) as count FROM mistakes WHERE user_id = ?'
    ).get(userId).count;

    // 已掌握错题数
    const masteredMistakes = db.prepare(
      'SELECT COUNT(*) as count FROM mistakes WHERE user_id = ? AND mastery_level = 2'
    ).get(userId).count;

    // 学习计划数
    const totalPlans = db.prepare(
      'SELECT COUNT(*) as count FROM study_plans WHERE user_id = ?'
    ).get(userId).count;

    // 连续学习天数
    const studyDays = db.prepare(`
      SELECT COUNT(DISTINCT record_date) as days
      FROM study_records
      WHERE user_id = ?
    `).get(userId).days;

    res.json({
      summary: {
        total_chats: totalChats,
        total_knowledge: totalKnowledge,
        total_mistakes: totalMistakes,
        mastered_mistakes: masteredMistakes,
        mastery_rate: totalMistakes > 0 ? Math.round((masteredMistakes / totalMistakes) * 100) : 0,
        total_plans: totalPlans,
        study_days: studyDays,
      },
    });
  } catch (error) {
    console.error('获取数据概览错误:', error);
    res.status(500).json({ error: '获取数据概览失败' });
  }
});

/**
 * 获取最近7天学习趋势
 * GET /api/dashboard/trend
 */
router.get('/trend', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    // 获取最近7天的日期
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }

    // 查询这些天的学习记录
    const placeholders = days.map(() => '?').join(',');
    const records = db.prepare(`
      SELECT record_date, chat_count, knowledge_count, mistake_count, study_minutes
      FROM study_records
      WHERE user_id = ? AND record_date IN (${placeholders})
      ORDER BY record_date ASC
    `).all(userId, ...days);

    // 构建完整的7天数据（没有记录的天补0）
    const recordMap = {};
    records.forEach(r => { recordMap[r.record_date] = r; });

    const trend = days.map(date => {
      const record = recordMap[date];
      return {
        date,
        label: date.substring(5), // MM-DD格式
        chat_count: record ? record.chat_count : 0,
        knowledge_count: record ? record.knowledge_count : 0,
        mistake_count: record ? record.mistake_count : 0,
        study_minutes: record ? record.study_minutes : 0,
      };
    });

    res.json({ trend });
  } catch (error) {
    console.error('获取学习趋势错误:', error);
    res.status(500).json({ error: '获取学习趋势失败' });
  }
});

/**
 * 获取科目错题分布
 * GET /api/dashboard/subject-distribution
 */
router.get('/subject-distribution', authMiddleware, (req, res) => {
  try {
    const distribution = db.prepare(`
      SELECT subject, COUNT(*) as count
      FROM mistakes
      WHERE user_id = ?
      GROUP BY subject
      ORDER BY count DESC
    `).all(req.user.id);

    res.json({ distribution });
  } catch (error) {
    console.error('获取科目分布错误:', error);
    res.status(500).json({ error: '获取科目分布失败' });
  }
});

module.exports = router;
