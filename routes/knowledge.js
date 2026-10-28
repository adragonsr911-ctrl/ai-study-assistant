// 知识点拆解路由
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { callDoubao, SYSTEM_PROMPTS } = require('../utils/doubao');
const { updateStudyRecord } = require('../utils/studyRecord');

const router = express.Router();

/**
 * 获取知识点列表
 * GET /api/knowledge
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const knowledgeList = await db.prepare(`
      SELECT id, topic, subject, created_at
      FROM knowledge_points
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    res.json({ knowledgeList });
  } catch (error) {
    console.error('获取知识点列表错误:', error);
    res.status(500).json({ error: '获取知识点列表失败' });
  }
});

/**
 * 获取单个知识点详情
 * GET /api/knowledge/:id
 */
router.get('/:id', authMiddleware, async (req, res, next) => {
  // graph是特殊路由，跳过交给后面的/graph处理
  if (req.params.id === 'graph') return next();
  try {
    const knowledge = await db.prepare(
      'SELECT * FROM knowledge_points WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!knowledge) {
      return res.status(404).json({ error: '知识点不存在' });
    }

    res.json({ knowledge });
  } catch (error) {
    console.error('获取知识点详情错误:', error);
    res.status(500).json({ error: '获取知识点详情失败' });
  }
});

/**
 * 生成知识点拆解
 * POST /api/knowledge/generate
 * Body: { topic, subject }
 */
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { topic, subject } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: '请输入要拆解的知识点' });
    }

    // 调用豆包API生成知识点拆解
    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.knowledge },
      { role: 'user', content: `请帮我拆解这个知识点：${topic}` },
    ];

    let content;
    try {
      content = await callDoubao(messages, { temperature: 0.6, max_tokens: 8000 });
    } catch (apiError) {
      return res.status(502).json({
        error: 'AI生成失败',
        message: apiError.message,
      });
    }

    // 保存到数据库
    const result = await db.prepare(`
      INSERT INTO knowledge_points (user_id, topic, content, subject)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, topic.trim(), content, (subject || '').trim());

    // 更新学习记录
    await updateStudyRecord(req.user.id, 'knowledge_count', 1);

    res.status(201).json({
      knowledge: {
        id: result.lastInsertRowid,
        topic: topic.trim(),
        content,
        subject: (subject || '').trim(),
      },
    });
  } catch (error) {
    console.error('生成知识点错误:', error);
    res.status(500).json({ error: '生成知识点失败，请稍后重试' });
  }
});

/**
 * 删除知识点
 * DELETE /api/knowledge/:id
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.prepare(
      'DELETE FROM knowledge_points WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '知识点不存在' });
    }

    res.json({ message: '知识点已删除' });
  } catch (error) {
    console.error('删除知识点错误:', error);
    res.status(500).json({ error: '删除知识点失败' });
  }
});

/**
 * 获取知识图谱数据
 * GET /api/knowledge/graph
 * 返回节点和边，用于前端SVG渲染知识图谱
 */
router.get('/graph', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const nodes = [];
    const edges = [];

    // 科目配色
    const subjectColors = ['#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#65a30d'];

    // 中心节点
    nodes.push({
      id: 'root',
      label: '我的知识图谱',
      type: 'root',
      color: '#1e293b',
      size: 'large',
    });

    // 从错题本提取科目
    const subjects = await db.prepare(`
      SELECT DISTINCT subject FROM mistakes WHERE user_id = ? AND subject IS NOT NULL AND subject != ''
      UNION
      SELECT DISTINCT subject FROM study_plans WHERE user_id = ? AND subject IS NOT NULL AND subject != ''
    `).all(userId, userId);

    if (subjects.length === 0) {
      // 没有科目数据时，返回空图谱
      res.json({ nodes, edges, stats: { subjects: 0, knowledge: 0, mistakes: 0 } });
      return;
    }

    // 科目节点
    subjects.forEach((s, index) => {
      const subjectId = 'subject_' + index;
      nodes.push({
        id: subjectId,
        label: s.subject,
        type: 'subject',
        color: subjectColors[index % subjectColors.length],
        size: 'medium',
      });
      edges.push({ source: 'root', target: subjectId });
    });

    // 每个科目下的错题节点
    let mistakeCount = 0;
    // 注意：原为 subjects.forEach，因循环体内有异步数据库查询，
    // 改成 for...of 以保证 await 生效（forEach 不会等待异步回调）
    for (const [index, s] of subjects.entries()) {
      const subjectId = 'subject_' + index;
      const mistakes = await db.prepare(`
        SELECT id, question, mastery_level FROM mistakes
        WHERE user_id = ? AND subject = ?
        ORDER BY created_at DESC
        LIMIT 8
      `).all(userId, s.subject);

      mistakes.forEach((m, mi) => {
        const nodeId = 'mistake_' + m.id;
        // 截断题目文字
        let label = m.question || '错题';
        if (label.length > 12) label = label.substring(0, 12) + '...';
        nodes.push({
          id: nodeId,
          label,
          type: 'mistake',
          subject: s.subject,
          color: subjectColors[index % subjectColors.length],
          mastery: m.mastery_level,
          size: 'small',
          detailId: m.id,
        });
        edges.push({ source: subjectId, target: nodeId });
        mistakeCount++;
      });
    }

    // 知识点节点（按subject字段分组到对应科目）
    let knowledgeCount = 0;
    const knowledgeList = await db.prepare(`
      SELECT id, topic, subject FROM knowledge_points
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 15
    `).all(userId);

    if (knowledgeList.length > 0) {
      // 建立科目名到subjectId的映射
      const subjectMap = {};
      subjects.forEach((s, index) => { subjectMap[s.subject] = 'subject_' + index; });

      knowledgeList.forEach((k) => {
        const nodeId = 'knowledge_' + k.id;
        let label = k.topic || '知识点';
        if (label.length > 12) label = label.substring(0, 12) + '...';

        // 确定知识点归属的科目
        let targetSubjectId = 'subject_0';
        let targetColor = subjectColors[0];
        let targetSubjectName = subjects[0] ? subjects[0].subject : '';

        if (k.subject && k.subject.trim()) {
          if (subjectMap[k.subject]) {
            // 科目已存在
            targetSubjectId = subjectMap[k.subject];
            const idx = subjects.findIndex(s => s.subject === k.subject);
            targetColor = subjectColors[idx % subjectColors.length];
            targetSubjectName = k.subject;
          } else {
            // 知识点的科目不在错题/计划科目中，添加新科目节点
            const newIdx = subjects.length;
            const newSubjectId = 'subject_' + newIdx;
            subjects.push({ subject: k.subject });
            subjectMap[k.subject] = newSubjectId;
            nodes.push({
              id: newSubjectId,
              label: k.subject,
              type: 'subject',
              color: subjectColors[newIdx % subjectColors.length],
              size: 'medium',
            });
            edges.push({ source: 'root', target: newSubjectId });
            targetSubjectId = newSubjectId;
            targetColor = subjectColors[newIdx % subjectColors.length];
            targetSubjectName = k.subject;
          }
        }

        nodes.push({
          id: nodeId,
          label,
          type: 'knowledge',
          subject: targetSubjectName,
          color: targetColor,
          size: 'small',
          detailId: k.id,
        });
        edges.push({ source: targetSubjectId, target: nodeId });
        knowledgeCount++;
      });
    }

    res.json({
      nodes,
      edges,
      stats: {
        subjects: subjects.length,
        knowledge: knowledgeCount,
        mistakes: mistakeCount,
      },
    });
  } catch (error) {
    console.error('获取知识图谱错误:', error);
    res.status(500).json({ error: '获取知识图谱失败' });
  }
});

module.exports = router;
