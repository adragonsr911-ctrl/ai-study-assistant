// AI对话路由
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { callDoubao, SYSTEM_PROMPTS } = require('../utils/doubao');
const { updateStudyRecord } = require('../utils/studyRecord');
const { retrieveContext, formatContext } = require('../utils/rag');

const router = express.Router();

/**
 * 获取对话列表
 * GET /api/chat/conversations
 */
router.get('/conversations', authMiddleware, (req, res) => {
  try {
    const conversations = db.prepare(`
      SELECT id, title, created_at, updated_at
      FROM conversations
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(req.user.id);

    res.json({ conversations });
  } catch (error) {
    console.error('获取对话列表错误:', error);
    res.status(500).json({ error: '获取对话列表失败' });
  }
});

/**
 * 创建新对话
 * POST /api/chat/conversations
 */
router.post('/conversations', authMiddleware, (req, res) => {
  try {
    const { title } = req.body;
    const result = db.prepare(`
      INSERT INTO conversations (user_id, title)
      VALUES (?, ?)
    `).run(req.user.id, title || '新对话');

    res.status(201).json({
      conversation: {
        id: result.lastInsertRowid,
        title: title || '新对话',
      },
    });
  } catch (error) {
    console.error('创建对话错误:', error);
    res.status(500).json({ error: '创建对话失败' });
  }
});

/**
 * 获取对话历史消息
 * GET /api/chat/conversations/:id/messages
 */
router.get('/conversations/:id/messages', authMiddleware, (req, res) => {
  try {
    const conversationId = req.params.id;

    // 验证对话归属
    const conversation = db.prepare(
      'SELECT id, title FROM conversations WHERE id = ? AND user_id = ?'
    ).get(conversationId, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: '对话不存在' });
    }

    const messages = db.prepare(`
      SELECT id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);

    res.json({ conversation, messages });
  } catch (error) {
    console.error('获取消息错误:', error);
    res.status(500).json({ error: '获取消息失败' });
  }
});

/**
 * 发送消息并获取AI回复
 * POST /api/chat/send
 * Body: { conversation_id, content }
 */
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { conversation_id, content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }

    let conversationId = conversation_id;

    // 如果没有提供conversation_id，创建新对话
    if (!conversationId) {
      const title = content.length > 20 ? content.substring(0, 20) + '...' : content;
      const result = db.prepare(`
        INSERT INTO conversations (user_id, title)
        VALUES (?, ?)
      `).run(req.user.id, title);
      conversationId = result.lastInsertRowid;
    } else {
      // 验证对话归属
      const conversation = db.prepare(
        'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
      ).get(conversationId, req.user.id);

      if (!conversation) {
        return res.status(404).json({ error: '对话不存在' });
      }
    }

    // 保存用户消息
    db.prepare(`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (?, 'user', ?)
    `).run(conversationId, content);

    // 获取历史消息（最近20条，控制token）
    const historyMessages = db.prepare(`
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(conversationId).reverse();

    // RAG：检索用户个人学习数据作为上下文（语义检索，含降级）
    const ragContext = await retrieveContext(req.user.id, content);
    const formattedContext = formatContext(ragContext);
    const ragUsed = !!formattedContext;

    // 构造发送给AI的消息
    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPTS.chat },
    ];

    // 如果检索到个人学习数据，注入为system上下文
    if (formattedContext) {
      aiMessages.push({
        role: 'system',
        content: `以下是该用户的个人学习数据（来自错题本、知识点拆解、学习计划、AI诊断）。请在回答时优先参考这些数据，给出个性化、针对性的建议。如果用户的问题与这些数据无关，可以忽略。\n\n${formattedContext}`,
      });
    }

    aiMessages.push(...historyMessages);

    // 调用豆包API
    let aiReply;
    try {
      aiReply = await callDoubao(aiMessages);
    } catch (apiError) {
      // API调用失败，保存错误消息并返回
      aiReply = `抱歉，AI服务暂时不可用：${apiError.message}\n\n请检查API密钥配置后重试。`;
    }

    // 保存AI回复
    db.prepare(`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (?, 'assistant', ?)
    `).run(conversationId, aiReply);

    // 更新对话时间
    db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(conversationId);

    // 更新学习记录
    updateStudyRecord(req.user.id, 'chat_count', 1);

    res.json({
      conversation_id: conversationId,
      reply: aiReply,
      rag_used: ragUsed,
    });
  } catch (error) {
    console.error('发送消息错误:', error);
    res.status(500).json({ error: '发送消息失败，请稍后重试' });
  }
});

/**
 * 删除对话
 * DELETE /api/chat/conversations/:id
 */
router.delete('/conversations/:id', authMiddleware, (req, res) => {
  try {
    const conversationId = req.params.id;

    const result = db.prepare(
      'DELETE FROM conversations WHERE id = ? AND user_id = ?'
    ).run(conversationId, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '对话不存在' });
    }

    res.json({ message: '对话已删除' });
  } catch (error) {
    console.error('删除对话错误:', error);
    res.status(500).json({ error: '删除对话失败' });
  }
});

module.exports = router;
