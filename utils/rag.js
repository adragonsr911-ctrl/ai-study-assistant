// RAG检索增强生成：根据用户问题检索个人学习数据，注入AI上下文
const db = require('../db');

// 学科关键词（用于匹配错题、知识点、学习计划）
const SUBJECT_KEYWORDS = [
  '数学', '英语', '语文', '物理', '化学', '生物',
  '历史', '地理', '政治', '计算机', '编程', '代码',
  '算法', '数据结构', '网络', '操作系统', '数据库',
];

/**
 * 从用户问题中提取学科关键词
 */
function extractKeywords(query) {
  const keywords = [];
  SUBJECT_KEYWORDS.forEach(kw => {
    if (query.includes(kw)) {
      keywords.push(kw);
    }
  });
  return keywords;
}

/**
 * 检索用户个人学习数据
 * @param {number} userId - 用户ID
 * @param {string} query - 用户问题
 * @returns {object} 包含mistakes/knowledge/plans/diagnosis的检索结果
 */
function retrieveContext(userId, query) {
  const keywords = extractKeywords(query);
  const context = {
    mistakes: [],
    knowledge: [],
    plans: [],
    diagnosis: [],
  };

  // 1. 检索错题本（按学科关键词匹配subject或question）
  try {
    let sql = 'SELECT subject, question, your_answer, correct_answer, analysis, mastery_level, created_at FROM mistakes WHERE user_id = ?';
    let params = [userId];
    if (keywords.length > 0) {
      const conditions = [];
      keywords.forEach(kw => {
        conditions.push('subject LIKE ?');
        conditions.push('question LIKE ?');
        params.push('%' + kw + '%', '%' + kw + '%');
      });
      sql += ' AND (' + conditions.join(' OR ') + ')';
    }
    sql += ' ORDER BY created_at DESC LIMIT 5';
    context.mistakes = db.prepare(sql).all(...params);
  } catch (e) {
    console.error('RAG检索错题本错误:', e.message);
  }

  // 2. 检索知识点拆解（按关键词匹配topic）
  try {
    let sql = 'SELECT topic, content, created_at FROM knowledge_points WHERE user_id = ?';
    let params = [userId];
    if (keywords.length > 0) {
      const conditions = [];
      keywords.forEach(kw => {
        conditions.push('topic LIKE ?');
        params.push('%' + kw + '%');
      });
      sql += ' AND (' + conditions.join(' OR ') + ')';
    }
    sql += ' ORDER BY created_at DESC LIMIT 3';
    context.knowledge = db.prepare(sql).all(...params);
  } catch (e) {
    console.error('RAG检索知识点错误:', e.message);
  }

  // 3. 检索学习计划（按关键词匹配subject）
  try {
    let sql = 'SELECT subject, exam_date, daily_hours, content, created_at FROM study_plans WHERE user_id = ?';
    let params = [userId];
    if (keywords.length > 0) {
      const conditions = [];
      keywords.forEach(kw => {
        conditions.push('subject LIKE ?');
        params.push('%' + kw + '%');
      });
      sql += ' AND (' + conditions.join(' OR ') + ')';
    }
    sql += ' ORDER BY created_at DESC LIMIT 2';
    context.plans = db.prepare(sql).all(...params);
  } catch (e) {
    console.error('RAG检索学习计划错误:', e.message);
  }

  // 4. 检索最近的AI诊断报告（全局，不需要关键词，取最新1份）
  try {
    context.diagnosis = db.prepare(
      'SELECT title, content, created_at FROM diagnosis_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).all(userId);
  } catch (e) {
    console.error('RAG检索诊断报告错误:', e.message);
  }

  return context;
}

/**
 * 将检索结果格式化为AI可理解的上下文文本
 * @param {object} context - retrieveContext的返回值
 * @returns {string|null} 格式化后的上下文，无数据时返回null
 */
function formatContext(context) {
  const parts = [];

  if (context.mistakes && context.mistakes.length > 0) {
    parts.push('【我的错题本记录】');
    context.mistakes.forEach((m, i) => {
      parts.push(`${i + 1}. [${m.subject || '未分类'}] 题目：${m.question || '无'}`);
      if (m.correct_answer) parts.push(`   正确答案：${m.correct_answer}`);
      if (m.analysis) parts.push(`   解析：${m.analysis}`);
      parts.push(`   掌握程度：${m.mastery_level}/3`);
    });
  }

  if (context.knowledge && context.knowledge.length > 0) {
    parts.push('【我的知识点拆解记录】');
    context.knowledge.forEach((k, i) => {
      parts.push(`${i + 1}. 主题：${k.topic}`);
      if (k.content) parts.push(`   内容：${k.content.substring(0, 300)}`);
    });
  }

  if (context.plans && context.plans.length > 0) {
    parts.push('【我的学习计划】');
    context.plans.forEach((p, i) => {
      parts.push(`${i + 1}. [${p.subject}] 考试日期：${p.exam_date || '未设置'}，每日学习：${p.daily_hours || '?'}小时`);
      if (p.content) parts.push(`   计划：${p.content.substring(0, 300)}`);
    });
  }

  if (context.diagnosis && context.diagnosis.length > 0) {
    parts.push('【我的AI学习诊断报告（最新）】');
    context.diagnosis.forEach((d, i) => {
      parts.push(`${i + 1}. ${d.title}`);
      if (d.content) parts.push(`   ${d.content.substring(0, 400)}`);
    });
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

module.exports = { retrieveContext, formatContext };
