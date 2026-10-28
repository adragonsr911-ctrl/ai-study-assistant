// RAG检索增强生成：根据用户问题检索个人学习数据，注入AI上下文
// 支持两种检索模式：语义检索（Embedding余弦相似度）和关键词匹配（降级方案）
const db = require('../db');
const { getEmbedding, cosineSimilarity } = require('./embedding');

// 学科关键词（用于关键词匹配降级）
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
 * 从源表加载所有学习数据（用于懒加载向量化）
 */
async function loadAllSourceData(userId) {
  const allData = [];

  // 错题本
  try {
    const mistakes = await db.prepare(`
      SELECT id, subject, question, analysis, correct_answer FROM mistakes WHERE user_id = ?
    `).all(userId);
    mistakes.forEach(m => {
      allData.push({
        source_type: 'mistake',
        source_id: m.id,
        content_text: `[${m.subject}] ${m.question} ${m.analysis || ''} ${m.correct_answer || ''}`.substring(0, 500)
      });
    });
  } catch (e) { console.error('加载错题失败:', e.message); }

  // 知识点
  try {
    const knowledge = await db.prepare(`
      SELECT id, topic, content FROM knowledge_points WHERE user_id = ?
    `).all(userId);
    knowledge.forEach(k => {
      allData.push({
        source_type: 'knowledge',
        source_id: k.id,
        content_text: `[知识点] ${k.topic} ${(k.content || '').substring(0, 400)}`
      });
    });
  } catch (e) { console.error('加载知识点失败:', e.message); }

  // 学习计划
  try {
    const plans = await db.prepare(`
      SELECT id, subject, content FROM study_plans WHERE user_id = ?
    `).all(userId);
    plans.forEach(p => {
      allData.push({
        source_type: 'plan',
        source_id: p.id,
        content_text: `[学习计划-${p.subject}] ${(p.content || '').substring(0, 400)}`
      });
    });
  } catch (e) { console.error('加载学习计划失败:', e.message); }

  // 诊断报告
  try {
    const diagnosis = await db.prepare(`
      SELECT id, title, content FROM diagnosis_reports WHERE user_id = ?
    `).all(userId);
    diagnosis.forEach(d => {
      allData.push({
        source_type: 'diagnosis',
        source_id: d.id,
        content_text: `[诊断报告] ${d.title} ${(d.content || '').substring(0, 400)}`
      });
    });
  } catch (e) { console.error('加载诊断报告失败:', e.message); }

  return allData;
}

/**
 * 确保学习数据已向量化（懒加载）
 * 对于没有向量的数据，实时生成并存储
 */
async function ensureEmbeddings(userId) {
  // 统计已有向量数量
  const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM knowledge_embeddings WHERE user_id = ?').get(userId);
  const existingCount = countRow ? Number(countRow.cnt) : 0;

  // 加载所有源数据
  const allData = await loadAllSourceData(userId);

  // 找出还没有向量的数据
  const missing = [];
  for (const item of allData) {
    const exists = await db.prepare(
      'SELECT id FROM knowledge_embeddings WHERE user_id = ? AND source_type = ? AND source_id = ?'
    ).get(userId, item.source_type, item.source_id);
    if (!exists) {
      missing.push(item);
    }
  }

  if (missing.length === 0) {
    return;
  }

  console.log(`RAG语义检索：为${missing.length}条学习数据生成向量...`);

  // 逐条生成向量（避免批量请求超时）
  for (const item of missing) {
    try {
      const vector = await getEmbedding(item.content_text);
      await db.prepare(`
        INSERT OR IGNORE INTO knowledge_embeddings (user_id, source_type, source_id, content_text, vector_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, item.source_type, item.source_id, item.content_text, JSON.stringify(vector));
    } catch (e) {
      console.error(`生成向量失败 (${item.source_type}:${item.source_id}):`, e.message);
    }
  }

  console.log('RAG语义检索：向量生成完成');
}

/**
 * 语义检索：基于Embedding余弦相似度检索最相关的学习数据
 */
async function semanticRetrieval(userId, query) {
  // 1. 确保数据已向量化
  await ensureEmbeddings(userId);

  // 2. 生成问题向量
  const queryVector = await getEmbedding(query.substring(0, 500));

  // 3. 加载用户所有向量
  const embeddings = await db.prepare(`
    SELECT source_type, source_id, content_text, vector_json
    FROM knowledge_embeddings
    WHERE user_id = ? AND vector_json IS NOT NULL
  `).all(userId);

  if (embeddings.length === 0) {
    return null; // 没有向量数据，降级
  }

  // 4. 计算余弦相似度，排序
  const scored = embeddings.map(item => {
    let vector = [];
    try {
      vector = JSON.parse(item.vector_json);
    } catch (e) {
      vector = [];
    }
    const score = cosineSimilarity(queryVector, vector);
    return { ...item, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // 5. 取Top 8最相关的内容，按来源分类
  const topItems = scored.slice(0, 8);
  const context = {
    mistakes: [],
    knowledge: [],
    plans: [],
    diagnosis: [],
    _semantic: true,
  };

  for (const item of topItems) {
    if (item.score < 0.3) continue; // 相似度太低的跳过

    if (item.source_type === 'mistake') {
      const detail = await db.prepare('SELECT subject, question, your_answer, correct_answer, analysis, mastery_level FROM mistakes WHERE id = ?').get(item.source_id);
      if (detail) context.mistakes.push({ ...detail, _score: item.score });
    } else if (item.source_type === 'knowledge') {
      const detail = await db.prepare('SELECT topic, content FROM knowledge_points WHERE id = ?').get(item.source_id);
      if (detail) context.knowledge.push({ ...detail, _score: item.score });
    } else if (item.source_type === 'plan') {
      const detail = await db.prepare('SELECT subject, exam_date, daily_hours, content FROM study_plans WHERE id = ?').get(item.source_id);
      if (detail) context.plans.push({ ...detail, _score: item.score });
    } else if (item.source_type === 'diagnosis') {
      const detail = await db.prepare('SELECT title, content FROM diagnosis_reports WHERE id = ?').get(item.source_id);
      if (detail) context.diagnosis.push({ ...detail, _score: item.score });
    }
  }

  // 每类最多取一定数量
  context.mistakes = context.mistakes.slice(0, 5);
  context.knowledge = context.knowledge.slice(0, 3);
  context.plans = context.plans.slice(0, 2);
  context.diagnosis = context.diagnosis.slice(0, 1);

  const total = context.mistakes.length + context.knowledge.length + context.plans.length + context.diagnosis.length;
  return total > 0 ? context : null;
}

/**
 * 关键词匹配检索（降级方案）
 */
async function keywordRetrieval(userId, query) {
  const keywords = extractKeywords(query);
  const context = {
    mistakes: [],
    knowledge: [],
    plans: [],
    diagnosis: [],
    _semantic: false,
  };

  // 1. 检索错题本
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
    context.mistakes = await db.prepare(sql).all(...params);
  } catch (e) {
    console.error('RAG关键词检索错题本错误:', e.message);
  }

  // 2. 检索知识点
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
    context.knowledge = await db.prepare(sql).all(...params);
  } catch (e) {
    console.error('RAG关键词检索知识点错误:', e.message);
  }

  // 3. 检索学习计划
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
    context.plans = await db.prepare(sql).all(...params);
  } catch (e) {
    console.error('RAG关键词检索学习计划错误:', e.message);
  }

  // 4. 检索诊断报告（最新1份）
  try {
    context.diagnosis = await db.prepare(
      'SELECT title, content, created_at FROM diagnosis_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).all(userId);
  } catch (e) {
    console.error('RAG关键词检索诊断报告错误:', e.message);
  }

  return context;
}

/**
 * 检索用户个人学习数据（主入口）
 * 优先语义检索，失败时降级为关键词匹配
 * @param {number} userId - 用户ID
 * @param {string} query - 用户问题
 * @returns {Promise<object>} 检索结果，含_semantic标记
 */
async function retrieveContext(userId, query) {
  // 尝试语义检索
  try {
    const semanticResult = await semanticRetrieval(userId, query);
    if (semanticResult) {
      console.log('RAG检索模式：语义检索（Embedding余弦相似度）');
      return semanticResult;
    }
  } catch (e) {
    console.warn('RAG语义检索失败，降级为关键词匹配:', e.message);
  }

  // 降级为关键词匹配
  console.log('RAG检索模式：关键词匹配');
  return await keywordRetrieval(userId, query);
}

/**
 * 将检索结果格式化为AI可理解的上下文文本
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
