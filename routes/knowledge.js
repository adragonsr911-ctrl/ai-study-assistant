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
router.get('/', authMiddleware, (req, res) => {
  try {
    const knowledgeList = db.prepare(`
      SELECT id, topic, created_at
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
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const knowledge = db.prepare(
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
 * Body: { topic }
 */
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { topic } = req.body;

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
    const result = db.prepare(`
      INSERT INTO knowledge_points (user_id, topic, content)
      VALUES (?, ?, ?)
    `).run(req.user.id, topic.trim(), content);

    // 更新学习记录
    updateStudyRecord(req.user.id, 'knowledge_count', 1);

    res.status(201).json({
      knowledge: {
        id: result.lastInsertRowid,
        topic: topic.trim(),
        content,
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
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const result = db.prepare(
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

module.exports = router;
