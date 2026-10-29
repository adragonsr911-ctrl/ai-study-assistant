const fs = require('fs');
const path = require('path');
const storage = require('./storage');

const ARK_API_KEY = process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY;
// 视觉识别必须使用支持图片输入的多模态模型
// 注意：DeepSeek 系列是纯文本模型，不能用于图片识别
// 推荐使用 Doubao-Seed-Evolving（多模态，支持视觉理解）
const VISION_MODEL = process.env.VISION_MODEL || process.env.DOUBAO_MODEL;
const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

// 记录启动时的视觉模型配置，便于排查
console.log('视觉识别模型: ' + (process.env.VISION_MODEL ? VISION_MODEL + '（VISION_MODEL）' : VISION_MODEL + '（回退到 DOUBAO_MODEL）'));
if (!process.env.VISION_MODEL) {
  console.warn('⚠ 未配置 VISION_MODEL，将使用 DOUBAO_MODEL。若该模型不支持图片输入，拍照识别会失败。');
}

/**
 * 识别错题图片，返回结构化信息
 * @param {string} imageRef - 图片引用（文件名 / 本地路径 / Supabase URL 均可）
 * @returns {Promise<{subject: string, question: string, your_answer: string, correct_answer: string}>}
 */
async function recognizeMistakeImage(imageRef) {
  if (!ARK_API_KEY) {
    throw new Error('未配置ARK_API_KEY');
  }

  // 通过存储层读取图片内容，兼容本地磁盘与 Supabase Storage
  const imageBuffer = await storage.readFile(imageRef);

  // 从引用里推断扩展名
  const cleanRef = String(imageRef).split('?')[0];
  let ext = path.extname(cleanRef).toLowerCase().replace('.', '');
  if (!ext) ext = 'jpg';
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const base64Image = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const prompt = `你是一个错题识别助手。请仔细识别这张错题图片，提取以下信息并以JSON格式返回：

{
  "subject": "科目名称（如：数学、英语、物理等，不确定则填'其他'）",
  "question": "完整的题目内容（包括题干和选项，如果有的话）",
  "your_answer": "学生写的错误答案（如果图片中有标注，否则填空字符串）",
  "correct_answer": "正确答案（如果图片中有标注，否则填空字符串）"
}

要求：
1. 只返回JSON，不要有其他文字
2. 题目内容要完整，包括所有条件和问题
3. 如果是选择题，把所有选项都包含在question里
4. 如果图片中没有明确的答案标注，对应字段填空字符串`;

  const response = await fetch(ARK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ARK_API_KEY}`
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`视觉模型调用失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // 解析JSON（处理可能的markdown代码块包裹）
  let result;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      result = JSON.parse(content);
    }
  } catch (e) {
    throw new Error('视觉模型返回格式解析失败: ' + content.substring(0, 200));
  }

  return {
    subject: result.subject || '其他',
    question: result.question || '',
    your_answer: result.your_answer || '',
    correct_answer: result.correct_answer || ''
  };
}

module.exports = { recognizeMistakeImage };
