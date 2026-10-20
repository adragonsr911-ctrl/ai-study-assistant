// AI学习诊断报告路由
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { callDoubao, SYSTEM_PROMPTS } = require('../utils/doubao');

const router = express.Router();

/**
 * 汇总用户的全部学习数据（供AI诊断与前端展示）
 */
function collectUserData(userId) {
  // 用户信息
  const user = db.prepare('SELECT username, nickname FROM users WHERE id = ?').get(userId);

  // 答疑：总提问数、对话数、最近的提问
  const totalChats = db.prepare(`
    SELECT COUNT(*) AS count FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.user_id = ? AND m.role = 'user'
  `).get(userId).count;

  const conversationCount = db.prepare(
    'SELECT COUNT(*) AS count FROM conversations WHERE user_id = ?'
  ).get(userId).count;

  const recentQuestions = db.prepare(`
    SELECT m.content FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.user_id = ? AND m.role = 'user'
    ORDER BY m.created_at DESC LIMIT 10
  `).all(userId).map(r => r.content);

  // 知识点：总数、最近拆解的主题
  const totalKnowledge = db.prepare(
    'SELECT COUNT(*) AS count FROM knowledge_points WHERE user_id = ?'
  ).get(userId).count;

  const recentTopics = db.prepare(
    'SELECT topic FROM knowledge_points WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).all(userId).map(r => r.topic);

  // 错题：总数、各掌握程度数量、科目分布、薄弱错题明细
  const totalMistakes = db.prepare(
    'SELECT COUNT(*) AS count FROM mistakes WHERE user_id = ?'
  ).get(userId).count;

  const masteryCount = db.prepare(
    'SELECT mastery_level, COUNT(*) AS count FROM mistakes WHERE user_id = ? GROUP BY mastery_level'
  ).all(userId);
  const masteryMap = { 0: 0, 1: 0, 2: 0 };
  masteryCount.forEach(r => { masteryMap[r.mastery_level] = r.count; });

  const subjectDistribution = db.prepare(`
    SELECT subject, COUNT(*) AS count FROM mistakes
    WHERE user_id = ? GROUP BY subject ORDER BY count DESC
  `).all(userId);

  // 薄弱错题（未掌握、部分掌握），作为诊断核心素材
  const weakMistakes = db.prepare(`
    SELECT subject, question, your_answer, correct_answer, mastery_level
    FROM mistakes WHERE user_id = ? AND mastery_level < 2
    ORDER BY created_at DESC LIMIT 15
  `).all(userId);

  // 学习计划
  const totalPlans = db.prepare(
    'SELECT COUNT(*) AS count FROM study_plans WHERE user_id = ?'
  ).get(userId).count;

  const plans = db.prepare(`
    SELECT subject, exam_date, daily_hours FROM study_plans
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
  `).all(userId);

  // 学习活跃度：学习天数、最近7天记录
  const studyDays = db.prepare(
    'SELECT COUNT(DISTINCT record_date) AS days FROM study_records WHERE user_id = ?'
  ).get(userId).days;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(date.toISOString().split('T')[0]);
  }
  const placeholders = days.map(() => '?').join(',');
  const recentRecords = db.prepare(`
    SELECT record_date, chat_count, knowledge_count, mistake_count
    FROM study_records WHERE user_id = ? AND record_date IN (${placeholders})
    ORDER BY record_date ASC
  `).all(userId, ...days);

  const masteryRate = totalMistakes > 0
    ? Math.round((masteryMap[2] / totalMistakes) * 100) : 0;

  return {
    user,
    totalChats,
    conversationCount,
    recentQuestions,
    totalKnowledge,
    recentTopics,
    totalMistakes,
    masteryMap,
    masteryRate,
    subjectDistribution,
    weakMistakes,
    totalPlans,
    plans,
    studyDays,
    recentRecords,
  };
}

/**
 * 把汇总数据组织成喂给AI的文本
 */
function buildDataPrompt(data, todayStr) {
  const lines = [];
  lines.push(`今天日期：${todayStr}`);
  lines.push(`学生昵称：${data.user.nickname || data.user.username}`);
  lines.push('');
  lines.push('【学习活跃度】');
  lines.push(`- 累计学习天数：${data.studyDays} 天`);
  lines.push(`- AI答疑提问总数：${data.totalChats} 次（共 ${data.conversationCount} 个对话）`);
  lines.push(`- 知识点拆解总数：${data.totalKnowledge} 个`);
  lines.push(`- 学习计划数：${data.totalPlans} 份`);
  lines.push('- 最近7天每日活跃（答疑/知识点/错题）：');
  if (data.recentRecords.length === 0) {
    lines.push('  最近7天无学习记录');
  } else {
    data.recentRecords.forEach(r => {
      lines.push(`  ${r.record_date}：答疑${r.chat_count}、知识点${r.knowledge_count}、错题${r.mistake_count}`);
    });
  }

  lines.push('');
  lines.push('【知识点学习】');
  if (data.recentTopics.length === 0) {
    lines.push('- 暂无知识点拆解记录');
  } else {
    lines.push(`- 最近学习的知识点：${data.recentTopics.join('；')}`);
  }

  lines.push('');
  lines.push('【AI答疑最近提问】');
  if (data.recentQuestions.length === 0) {
    lines.push('- 暂无答疑记录');
  } else {
    data.recentQuestions.slice().reverse().forEach((q, i) => {
      lines.push(`  ${i + 1}. ${q.replace(/\s+/g, ' ').slice(0, 120)}`);
    });
  }

  lines.push('');
  lines.push('【错题本情况】');
  lines.push(`- 错题总数：${data.totalMistakes}（未掌握 ${data.masteryMap[0]}、部分掌握 ${data.masteryMap[1]}、已掌握 ${data.masteryMap[2]}，掌握率 ${data.masteryRate}%）`);
  if (data.subjectDistribution.length === 0) {
    lines.push('- 暂无错题记录');
  } else {
    lines.push('- 错题科目分布：' + data.subjectDistribution.map(s => `${s.subject} ${s.count}题`).join('；'));
    lines.push('- 尚未完全掌握的错题明细：');
    if (data.weakMistakes.length === 0) {
      lines.push('  所有错题均已掌握');
    } else {
      data.weakMistakes.forEach((m, i) => {
        const levelText = m.mastery_level === 0 ? '未掌握' : '部分掌握';
        lines.push(`  ${i + 1}. [${m.subject}][${levelText}] 题目：${(m.question || '').replace(/\s+/g, ' ').slice(0, 100)}`);
        if (m.your_answer) lines.push(`      学生答案：${String(m.your_answer).slice(0, 60)}；正确答案：${String(m.correct_answer || '').slice(0, 60)}`);
      });
    }
  }

  lines.push('');
  lines.push('【学习计划】');
  if (data.plans.length === 0) {
    lines.push('- 暂无学习计划');
  } else {
    data.plans.forEach(p => {
      lines.push(`- 科目：${p.subject}，考试日期：${p.exam_date}，每日学习${p.daily_hours}小时`);
    });
  }

  lines.push('');
  lines.push('请基于以上真实数据，按系统要求的结构生成学习诊断报告。');
  return lines.join('\n');
}

/**
 * 获取诊断报告列表
 * GET /api/diagnosis
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT id, title, created_at FROM diagnosis_reports
      WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);
    res.json({ reports });
  } catch (error) {
    console.error('获取诊断报告列表错误:', error);
    res.status(500).json({ error: '获取诊断报告列表失败' });
  }
});

/**
 * 获取单个诊断报告详情
 * GET /api/diagnosis/:id
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const report = db.prepare(
      'SELECT * FROM diagnosis_reports WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!report) {
      return res.status(404).json({ error: '诊断报告不存在' });
    }

    report.summary = report.summary_json ? JSON.parse(report.summary_json) : null;
    delete report.summary_json;
    res.json({ report });
  } catch (error) {
    console.error('获取诊断报告详情错误:', error);
    res.status(500).json({ error: '获取诊断报告详情失败' });
  }
});

/**
 * 生成诊断报告
 * POST /api/diagnosis/generate
 */
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = collectUserData(userId);
    const todayStr = new Date().toISOString().split('T')[0];

    // 数据过少时给出提示，但仍允许生成（AI会说明数据不足）
    const hasEnoughData = data.totalChats + data.totalKnowledge + data.totalMistakes > 0;

    const userPrompt = buildDataPrompt(data, todayStr);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.diagnosis },
      { role: 'user', content: userPrompt },
    ];

    let content;
    try {
      content = await callDoubao(messages, { temperature: 0.4, max_tokens: 8000 });
    } catch (apiError) {
      return res.status(502).json({ error: 'AI生成失败', message: apiError.message });
    }

    const title = `AI学习诊断报告（${todayStr}）`;
    const summary = {
      study_days: data.studyDays,
      total_chats: data.totalChats,
      total_knowledge: data.totalKnowledge,
      total_mistakes: data.totalMistakes,
      mastery_rate: data.masteryRate,
      total_plans: data.totalPlans,
      generated_at: todayStr,
    };

    const result = db.prepare(`
      INSERT INTO diagnosis_reports (user_id, title, content, summary_json)
      VALUES (?, ?, ?, ?)
    `).run(userId, title, content, JSON.stringify(summary));

    res.status(201).json({
      report: {
        id: result.lastInsertRowid,
        title,
        content,
        summary,
        has_enough_data: hasEnoughData,
      },
    });
  } catch (error) {
    console.error('生成诊断报告错误:', error);
    res.status(500).json({ error: '生成诊断报告失败，请稍后重试' });
  }
});

/**
 * 删除诊断报告
 * DELETE /api/diagnosis/:id
 */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM diagnosis_reports WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '诊断报告不存在' });
    }
    res.json({ message: '诊断报告已删除' });
  } catch (error) {
    console.error('删除诊断报告错误:', error);
    res.status(500).json({ error: '删除诊断报告失败' });
  }
});

module.exports = router;
