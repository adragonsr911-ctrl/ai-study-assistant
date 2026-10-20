// 学习记录工具函数
const db = require('../db');

/**
 * 更新用户的每日学习记录
 * @param {number} userId - 用户ID
 * @param {string} field - 要增加的字段：chat_count / knowledge_count / mistake_count / study_minutes
 * @param {number} amount - 增加的数量，默认1
 */
function updateStudyRecord(userId, field, amount = 1) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 检查今天是否已有记录
    const existing = db.prepare(
      'SELECT id FROM study_records WHERE user_id = ? AND record_date = ?'
    ).get(userId, today);

    if (existing) {
      // 更新记录
      db.prepare(
        `UPDATE study_records SET ${field} = ${field} + ? WHERE id = ?`
      ).run(amount, existing.id);
    } else {
      // 创建新记录
      const insertData = {
        user_id: userId,
        record_date: today,
        chat_count: 0,
        knowledge_count: 0,
        mistake_count: 0,
        study_minutes: 0,
      };
      insertData[field] = amount;

      db.prepare(`
        INSERT INTO study_records (user_id, record_date, chat_count, knowledge_count, mistake_count, study_minutes)
        VALUES (@user_id, @record_date, @chat_count, @knowledge_count, @mistake_count, @study_minutes)
      `).run(insertData);
    }
  } catch (error) {
    console.error('更新学习记录失败:', error.message);
    // 学习记录更新失败不影响主流程
  }
}

module.exports = { updateStudyRecord };
