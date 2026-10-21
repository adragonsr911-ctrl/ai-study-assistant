// 火山方舟文本向量化（Embedding）API封装
// 用于RAG语义检索

const API_KEY = process.env.DOUBAO_API_KEY;
const EMBEDDING_URL = 'https://ark.cn-beijing.volces.com/api/v3/embeddings';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'doubao-embedding';

/**
 * 获取单条文本的向量
 * @param {string} text - 待向量化的文本
 * @returns {Promise<number[]>} - 向量数组
 */
async function getEmbedding(text) {
  if (!text || !text.trim()) {
    throw new Error('文本不能为空');
  }

  if (!API_KEY) {
    throw new Error('未配置API密钥');
  }

  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.substring(0, 8000)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API请求失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data && data.data && data.data[0]) {
    return data.data[0].embedding;
  }

  throw new Error('Embedding API返回格式异常');
}

/**
 * 批量获取文本向量
 * @param {string[]} texts - 待向量化的文本数组
 * @returns {Promise<number[][]>} - 向量数组
 */
async function getEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  // 过滤空文本
  const validTexts = texts.map(t => (t || '').substring(0, 8000)).filter(t => t.trim());
  if (validTexts.length === 0) {
    return texts.map(() => []);
  }

  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: validTexts
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API请求失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data && data.data) {
    return data.data.map(item => item.embedding);
  }

  throw new Error('Embedding API返回格式异常');
}

/**
 * 计算两个向量的余弦相似度
 * @param {number[]} vec1
 * @param {number[]} vec2
 * @returns {number} - 相似度（0-1，越大越相似）
 */
function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length === 0 || vec2.length === 0) {
    return 0;
  }

  const len = Math.min(vec1.length, vec2.length);
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

module.exports = {
  getEmbedding,
  getEmbeddings,
  cosineSimilarity
};
