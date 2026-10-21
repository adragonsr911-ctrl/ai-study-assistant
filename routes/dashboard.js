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

/**
 * 获取学习热力图数据（最近12周）
 * GET /api/dashboard/heatmap
 */
router.get('/heatmap', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    // 生成最近84天（12周）的日期
    const days = [];
    const today = new Date();
    for (let i = 83; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }

    // 查询这些天的学习记录
    const placeholders = days.map(() => '?').join(',');
    const records = db.prepare(`
      SELECT record_date, study_minutes, chat_count, knowledge_count, mistake_count
      FROM study_records
      WHERE user_id = ? AND record_date IN (${placeholders})
    `).all(userId, ...days);

    const recordMap = {};
    records.forEach(r => { recordMap[r.record_date] = r; });

    // 计算每天的活跃度（综合学习时长和各项活动数）
    const heatmap = days.map(date => {
      const record = recordMap[date];
      let activity = 0;
      if (record) {
        activity = (record.study_minutes || 0) +
          (record.chat_count || 0) * 5 +
          (record.knowledge_count || 0) * 10 +
          (record.mistake_count || 0) * 8;
      }
      // 分5个等级：0=无，1=少，2=中，3=多，4=很多
      let level = 0;
      if (activity > 0) level = 1;
      if (activity >= 15) level = 2;
      if (activity >= 40) level = 3;
      if (activity >= 80) level = 4;

      return {
        date,
        activity: Math.round(activity),
        level,
        study_minutes: record ? record.study_minutes : 0,
      };
    });

    res.json({ heatmap });
  } catch (error) {
    console.error('获取热力图数据错误:', error);
    res.status(500).json({ error: '获取热力图数据失败' });
  }
});

/**
 * 获取知识点掌握雷达图数据
 * GET /api/dashboard/radar
 */
router.get('/radar', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    // 按科目统计错题数量和平均掌握程度
    const subjectStats = db.prepare(`
      SELECT
        subject,
        COUNT(*) as total,
        AVG(mastery_level) as avg_mastery,
        SUM(CASE WHEN mastery_level = 2 THEN 1 ELSE 0 END) as mastered_count
      FROM mistakes
      WHERE user_id = ?
      GROUP BY subject
      ORDER BY total DESC
      LIMIT 6
    `).all(userId);

    // 如果没有错题数据，返回空
    if (subjectStats.length === 0) {
      res.json({ radar: [] });
      return;
    }

    // 计算每个科目的掌握率（0-100）
    const radar = subjectStats.map(s => ({
      subject: s.subject || '未分类',
      total: s.total,
      mastered: s.mastered_count,
      mastery_rate: s.total > 0 ? Math.round((s.mastered_count / s.total) * 100) : 0,
      avg_mastery: s.avg_mastery ? Math.round(s.avg_mastery * 100) / 100 : 0,
    }));

    res.json({ radar });
  } catch (error) {
    console.error('获取雷达图数据错误:', error);
    res.status(500).json({ error: '获取雷达图数据失败' });
  }
});

/**
 * 获取学习时长趋势（支持指定天数）
 * GET /api/dashboard/trend?days=30
 */
router.get('/trend', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 7), 90);

    // 生成最近N天的日期
    const dateList = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dateList.push(date.toISOString().split('T')[0]);
    }

    // 查询这些天的学习记录
    const placeholders = dateList.map(() => '?').join(',');
    const records = db.prepare(`
      SELECT record_date, chat_count, knowledge_count, mistake_count, study_minutes
      FROM study_records
      WHERE user_id = ? AND record_date IN (${placeholders})
      ORDER BY record_date ASC
    `).all(userId, ...dateList);

    const recordMap = {};
    records.forEach(r => { recordMap[r.record_date] = r; });

    const trend = dateList.map(date => {
      const record = recordMap[date];
      return {
        date,
        label: date.substring(5),
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

module.exports = router;
