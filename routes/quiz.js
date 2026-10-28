const express = require('express');
const router = express.Router();
const db = require('../db');
const { callDoubao } = require('../utils/doubao');
const auth = require('../middleware/auth');

// 自动建表
// 数据库适配层为异步接口，故用立即执行异步函数包裹，保证模块加载时执行建表。
(async () => {
  try {
    await db.exec(`
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
  } catch (e) {}
})();

/**
 * POST /api/quiz/generate
 * 生成AI练习题
 * body: { subject, count, based_on_mistakes }
 */
router.post('/generate', auth, async (req, res) => {
  try {
    const { subject, count = 5, based_on_mistakes = true } = req.body;
    const userId = req.user.id;

    if (!subject) {
      return res.status(400).json({ error: '请选择科目' });
    }

    const numCount = Math.min(Math.max(parseInt(count) || 5, 3), 15);

    // 如果基于错题，检索该科目的错题作为上下文
    let mistakesContext = '';
    if (based_on_mistakes) {
      const mistakes = await db.prepare(`
        SELECT question, your_answer, correct_answer, analysis, mastery_level
        FROM mistakes
        WHERE user_id = ? AND subject LIKE ?
        ORDER BY mastery_level ASC, created_at DESC
        LIMIT 8
      `).all(userId, `%${subject}%`);

      if (mistakes.length > 0) {
        mistakesContext = mistakes.map((m, i) => {
          const level = ['未掌握', '部分掌握', '已掌握'][m.mastery_level] || '未掌握';
          return `错题${i + 1}（${level}）：${m.question}\n正确答案：${m.correct_answer}\n错误分析：${m.analysis || '无'}`;
        }).join('\n\n');
      }
    }

    // 构造prompt
    const systemPrompt = `你是一位专业的${subject}老师。请生成${numCount}道单项选择题，用于学生专项练习。

${mistakesContext ? `以下是该学生的错题情况，请针对这些薄弱点出题：\n${mistakesContext}\n\n` : ''}要求：
1. 每道题包含：题干、4个选项、正确答案索引（0-3）、详细解析
2. 题目难度适中，有区分度
3. 严格输出JSON数组格式，不要输出任何其他文字、解释或markdown标记
4. JSON格式示例：
[{"question":"题干","options":["A选项","B选项","C选项","D选项"],"answer":0,"analysis":"解析"}]`;

    // 调用AI
    const aiContent = await callDoubao([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请生成${numCount}道${subject}单项选择题。` }
    ]);

    // 解析JSON
    let questions = [];
    try {
      // 尝试提取JSON（AI可能输出markdown代码块）
      let jsonStr = aiContent.trim();
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      questions = JSON.parse(jsonStr);
    } catch (e) {
      console.error('AI出题JSON解析失败:', e.message, '原始内容:', aiContent.substring(0, 200));
      return res.status(500).json({ error: 'AI生成题目格式异常，请重试' });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({ error: 'AI未生成有效题目，请重试' });
    }

    // 校验每道题格式
    questions = questions.slice(0, numCount).map((q, i) => ({
      id: i + 1,
      question: q.question || `第${i + 1}题`,
      options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ['选项A', '选项B', '选项C', '选项D'],
      answer: typeof q.answer === 'number' ? q.answer : 0,
      analysis: q.analysis || '暂无解析'
    }));

    res.json({
      success: true,
      subject,
      count: questions.length,
      questions,
      based_on_mistakes: based_on_mistakes && mistakesContext.length > 0
    });

  } catch (error) {
    console.error('生成练习题失败:', error);
    res.status(500).json({ error: '生成练习题失败', message: error.message });
  }
});

/**
 * POST /api/quiz/save
 * 保存出题记录和作答结果
 * body: { subject, title, questions, user_answers, score, total }
 */
router.post('/save', auth, async (req, res) => {
  try {
    const { subject, title, questions, user_answers, score, total } = req.body;
    const userId = req.user.id;

    if (!subject || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const result = await db.prepare(`
      INSERT INTO quiz_sets (user_id, subject, title, questions_json, user_answers_json, score, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      subject,
      title || `${subject}专项练习`,
      JSON.stringify(questions),
      user_answers ? JSON.stringify(user_answers) : null,
      score || 0,
      total || questions.length
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('保存出题记录失败:', error);
    res.status(500).json({ error: '保存失败' });
  }
});

/**
 * GET /api/quiz/list
 * 获取用户的出题记录列表
 */
router.get('/list', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const list = await db.prepare(`
      SELECT id, subject, title, score, total, created_at
      FROM quiz_sets
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(userId);

    res.json({ success: true, list });
  } catch (error) {
    console.error('获取出题记录失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

/**
 * GET /api/quiz/:id
 * 获取单条出题记录详情
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const quizId = req.params.id;

    const quiz = await db.prepare(`
      SELECT * FROM quiz_sets WHERE id = ? AND user_id = ?
    `).get(quizId, userId);

    if (!quiz) {
      return res.status(404).json({ error: '记录不存在' });
    }

    res.json({
      success: true,
      id: quiz.id,
      subject: quiz.subject,
      title: quiz.title,
      questions: JSON.parse(quiz.questions_json),
      user_answers: quiz.user_answers_json ? JSON.parse(quiz.user_answers_json) : null,
      score: quiz.score,
      total: quiz.total,
      created_at: quiz.created_at
    });
  } catch (error) {
    console.error('获取出题详情失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

module.exports = router;
