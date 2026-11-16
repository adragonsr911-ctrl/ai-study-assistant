// 火山方舟文本向量化（Embedding）API封装
// 用于RAG语义检索

const dns = require('dns');
// 与其他火山方舟调用一致：优先 IPv4，规避云环境 IPv6 出站不通的问题
dns.setDefaultResultOrder('ipv4first');

const API_KEY = process.env.DOUBAO_API_KEY;

// 向量接口地址。
// 新版多模态向量模型（如 doubao-embedding-vision-251215）必须走
// /api/v3/embeddings/multimodal 接口，标准 /embeddings 接口会报
// "does not support this api"。可通过 EMBEDDING_BASE_URL 覆盖（例如指向中转代理）。
const EMBEDDING_URL = process.env.EMBEDDING_BASE_URL
  || 'https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal';

// 默认使用当前可用的多模态向量模型
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'doubao-embedding-vision-251215';

// 服务可用性缓存：
// 一旦检测到「模型不存在 / 无权限 / 不支持该接口」这类永久性错误，就记住该状态，
// 后续调用直接快速失败，避免每条数据都发起一次必然失败的请求、
// 也避免把日志刷满红色报错。
let permanentFailure = null;

/**
 * 判断错误是否为永久性失败（重试也不会成功）
 */
function isPermanentFailure(message) {
  return /404|NotFound|does not exist|no access|InvalidEndpointOrModel|not support this api|InvalidParameter|ModelNotOpen/i.test(message || '');
}

/**
 * 向量服务是否已确认不可用
 */
function isUnavailable() {
  return permanentFailure !== null;
}

/**
 * 获取当前不可用原因（供上层记录日志）
 */
function getUnavailableReason() {
  return permanentFailure;
}

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

  // 已知服务不可用，直接快速失败，不再发起请求
  if (permanentFailure) {
    throw new Error('向量服务不可用（已缓存状态）: ' + permanentFailure);
  }

  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      // 多模态向量接口要求 input 为内容数组，文本用 { type: 'text', text } 形式
      input: [{ type: 'text', text: String(text).substring(0, 8000) }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const message = `Embedding API请求失败: ${response.status} - ${errorText}`;
    if (isPermanentFailure(message)) {
      permanentFailure = `模型 ${EMBEDDING_MODEL} 不可用（${response.status}）`;
      console.warn('⚠ ' + permanentFailure + '，RAG 语义检索将降级为关键词匹配（后续不再重试）');
    }
    throw new Error(message);
  }

  const data = await response.json();

  // 多模态接口返回 { data: { embedding: [...] } }；
  // 标准接口返回 { data: [ { embedding: [...] } ] }。两种都兼容。
  if (data && data.data) {
    if (Array.isArray(data.data)) {
      if (data.data[0] && data.data[0].embedding) return data.data[0].embedding;
    } else if (data.data.embedding) {
      return data.data.embedding;
    }
  }

  throw new Error('Embedding API返回格式异常');
}

/**
 * 批量获取文本向量
 *
 * 注意：多模态向量接口会把多个输入融合成一个向量，无法用于逐条检索。
 * 因此这里改为逐条调用，确保每条数据得到独立向量。
 * @param {string[]} texts - 待向量化的文本数组
 * @returns {Promise<number[][]>} - 向量数组
 */
async function getEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const results = [];
  for (const t of texts) {
    if (!t || !t.trim()) {
      results.push([]);
      continue;
    }
    try {
      results.push(await getEmbedding(t));
    } catch (e) {
      // 服务已确认不可用则停止后续尝试
      if (permanentFailure) throw e;
      results.push([]);
    }
  }
  return results;
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
  cosineSimilarity,
  isUnavailable,
  getUnavailableReason,
};
