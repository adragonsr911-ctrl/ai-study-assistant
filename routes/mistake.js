// 错题本路由
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { callDoubao, SYSTEM_PROMPTS } = require('../utils/doubao');
const { updateStudyRecord } = require('../utils/studyRecord');

const router = express.Router();

// 艾宾浩斯遗忘曲线复习间隔（天）：完成当天首次复习后，依次在第1/2/4/7/15/30天复习
const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];

// 取本地时区的 YYYY-MM-DD（避免 toISOString 用UTC在凌晨跨日少算一天）
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return localDateStr(new Date());
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/**
 * 获取今日待复习错题
 * GET /api/mistake/reviews/due
 */
router.get('/reviews/due', authMiddleware, (req, res) => {
  try {
    const today = todayStr();
    const due = db.prepare(`
      SELECT * FROM mistakes
      WHERE user_id = ? AND next_review_at IS NOT NULL AND next_review_at <= ?
      ORDER BY next_review_at ASC, created_at ASC
    `).all(req.user.id, today);

    res.json({ due, count: due.length, today });
  } catch (error) {
    console.error('获取待复习错题错误:', error);
    res.status(500).json({ error: '获取待复习错题失败' });
  }
});

/**
 * 获取错题列表
 * GET /api/mistake
 * Query: subject (可选，按科目筛选)
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const { subject } = req.query;
    const today = todayStr();
    let mistakes;

    if (subject) {
      mistakes = db.prepare(`
        SELECT id, subject, question, mastery_level, review_count, next_review_at, last_reviewed_at, created_at
        FROM mistakes
        WHERE user_id = ? AND subject = ?
        ORDER BY created_at DESC
      `).all(req.user.id, subject);
    } else {
      mistakes = db.prepare(`
        SELECT id, subject, question, mastery_level, review_count, next_review_at, last_reviewed_at, created_at
        FROM mistakes
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(req.user.id);
    }

    // 附加复习状态标记
    mistakes = mistakes.map(m => ({
      ...m,
      is_due: m.next_review_at != null && m.next_review_at <= today,
      review_completed: m.next_review_at == null,
    }));

    res.json({ mistakes });
  } catch (error) {
    console.error('获取错题列表错误:', error);
    res.status(500).json({ error: '获取错题列表失败' });
  }
});

/**
 * 获取单道错题详情
 * GET /api/mistake/:id
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const mistake = db.prepare(
      'SELECT * FROM mistakes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!mistake) {
      return res.status(404).json({ error: '错题不存在' });
    }

    res.json({ mistake });
  } catch (error) {
    console.error('获取错题详情错误:', error);
    res.status(500).json({ error: '获取错题详情失败' });
  }
});

/**
 * 添加错题并生成AI分析
 * POST /api/mistake/add
 * Body: { subject, question, your_answer, correct_answer }
 */
router.post('/add', authMiddleware, async (req, res) => {
  try {
    const { subject, question, your_answer, correct_answer } = req.body;

    if (!subject || !question) {
      return res.status(400).json({ error: '科目和题目内容不能为空' });
    }

    // 调用豆包API生成错题分析
    const userPrompt = `请分析这道错题：
- 科目：${subject}
- 题目：${question}
- 我的答案：${your_answer || '（未填写）'}
- 正确答案：${correct_answer || '（未填写）'}`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.mistake },
      { role: 'user', content: userPrompt },
    ];

    let aiAnalysis = '';
    let similarQuestions = '';

    try {
      const aiResult = await callDoubao(messages, { temperature: 0.6, max_tokens: 8000 });
      // 尝试分离分析和类似题（如果AI按格式输出了）
      const parts = aiResult.split('## 【类似练习题】');
      aiAnalysis = parts[0].trim();
      similarQuestions = parts.length > 1 ? '## 【类似练习题】' + parts[1].trim() : '';
    } catch (apiError) {
      // AI分析失败不影响保存错题
      aiAnalysis = `AI分析暂时不可用：${apiError.message}`;
    }

    // 新错题当天即进入待复习
    const today = todayStr();

    // 保存到数据库
    const result = db.prepare(`
      INSERT INTO mistakes (user_id, subject, question, your_answer, correct_answer, analysis, similar_questions, next_review_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      subject,
      question,
      your_answer || '',
      correct_answer || '',
      aiAnalysis,
      similarQuestions,
      today
    );

    // 更新学习记录
    updateStudyRecord(req.user.id, 'mistake_count', 1);

    res.status(201).json({
      mistake: {
        id: result.lastInsertRowid,
        subject,
        question,
        analysis: aiAnalysis,
        similar_questions: similarQuestions,
      },
    });
  } catch (error) {
    console.error('添加错题错误:', error);
    res.status(500).json({ error: '添加错题失败，请稍后重试' });
  }
});

/**
 * 提交一次复习结果（艾宾浩斯调度）
 * POST /api/mistake/:id/review
 * Body: { result }  result: 'again'(还没掌握) | 'hard'(有点印象) | 'good'(记住了)
 */
router.post('/:id/review', authMiddleware, (req, res) => {
  try {
    const { result } = req.body;
    if (!['again', 'hard', 'good'].includes(result)) {
      return res.status(400).json({ error: '复习结果必须是 again、hard 或 good' });
    }

    const mistake = db.prepare(
      'SELECT * FROM mistakes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!mistake) {
      return res.status(404).json({ error: '错题不存在' });
    }

    const today = todayStr();
    let masteryLevel = mistake.mastery_level;
    let reviewCount = mistake.review_count || 0;
    let nextReviewAt = null;
    let completed = false;

    if (result === 'again') {
      // 还没掌握：重置复习进度，明天重新开始
      masteryLevel = 0;
      reviewCount = 0;
      nextReviewAt = addDays(today, REVIEW_INTERVALS[0]);
    } else if (result === 'hard') {
      // 有点印象：不前进档位，在当前节点再巩固一轮
      masteryLevel = 1;
      const idx = Math.min(reviewCount, REVIEW_INTERVALS.length - 1);
      nextReviewAt = addDays(today, REVIEW_INTERVALS[idx]);
    } else {
      // 记住了：前进到下一个复习节点
      masteryLevel = 2;
      const idx = reviewCount;
      if (idx >= REVIEW_INTERVALS.length) {
        // 已走完所有间隔（30天节点仍记住），形成长期记忆，毕业
        nextReviewAt = null;
        completed = true;
      } else {
        nextReviewAt = addDays(today, REVIEW_INTERVALS[idx]);
        reviewCount = idx + 1;
      }
    }

    db.prepare(`
      UPDATE mistakes
      SET mastery_level = ?, review_count = ?, next_review_at = ?, last_reviewed_at = ?
      WHERE id = ? AND user_id = ?
    `).run(masteryLevel, reviewCount, nextReviewAt, today, mistake.id, req.user.id);

    res.json({
      message: '复习已记录',
      result,
      mastery_level: masteryLevel,
      review_count: reviewCount,
      next_review_at: nextReviewAt,
      completed,
    });
  } catch (error) {
    console.error('提交复习结果错误:', error);
    res.status(500).json({ error: '复习记录失败' });
  }
});

/**
 * 更新错题掌握程度
 * PUT /api/mistake/:id/mastery
 * Body: { level }  level: 0=未掌握, 1=部分掌握, 2=已掌握
 */
router.put('/:id/mastery', authMiddleware, (req, res) => {
  try {
    const { level } = req.body;
    const masteryLevel = parseInt(level);

    if (isNaN(masteryLevel) || masteryLevel < 0 || masteryLevel > 2) {
      return res.status(400).json({ error: '掌握程度必须是0、1、2' });
    }

    const result = db.prepare(`
      UPDATE mistakes SET mastery_level = ? WHERE id = ? AND user_id = ?
    `).run(masteryLevel, req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '错题不存在' });
    }

    res.json({ message: '掌握程度已更新', mastery_level: masteryLevel });
  } catch (error) {
    console.error('更新掌握程度错误:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

/**
 * 删除错题
 * DELETE /api/mistake/:id
 */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM mistakes WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '错题不存在' });
    }

    res.json({ message: '错题已删除' });
  } catch (error) {
    console.error('删除错题错误:', error);
    res.status(500).json({ error: '删除错题失败' });
  }
});

module.exports = router;
