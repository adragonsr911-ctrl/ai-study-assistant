// 文件存储适配层
// 支持两种模式，通过 STORAGE_TYPE 环境变量切换：
//   local    —— 存本地磁盘（默认，本地开发用）
//   supabase —— 存 Supabase Storage（生产用，重启不丢）
//
// Supabase 模式下需要的环境变量：
//   SUPABASE_URL            项目地址，如 https://xxxxx.supabase.co
//   SUPABASE_SERVICE_KEY    service_role 密钥（服务端专用，切勿暴露给前端）
//   SUPABASE_BUCKET         存储桶名称，默认 mistake-images

const fs = require('fs');
const path = require('path');

const STORAGE_TYPE = (process.env.STORAGE_TYPE || 'local').toLowerCase();
const USE_SUPABASE = STORAGE_TYPE === 'supabase';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'mistake-images';

/**
 * 推导 Supabase 项目地址。
 * 优先用 SUPABASE_URL；没配的话，从 DATABASE_URL 里解析项目标识自动拼接。
 * 这样部署时少配一个环境变量，也少一处出错可能。
 */
function resolveSupabaseUrl() {
  if (process.env.SUPABASE_URL) {
    return process.env.SUPABASE_URL.replace(/\/$/, '');
  }
  const dbUrl = process.env.DATABASE_URL || '';
  // 形如 postgresql://postgres.abcdefgh:密码@host:5432/postgres
  const m = dbUrl.match(/\/\/[^.]+\.([a-z0-9]+):[^@]*@/i);
  if (m && m[1]) {
    return `https://${m[1]}.supabase.co`;
  }
  return '';
}

const SUPABASE_URL = resolveSupabaseUrl();

// 本地存储目录
const LOCAL_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

/**
 * 确保本地目录存在
 */
function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_DIR)) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
  }
}

/**
 * 生成唯一文件名
 */
function makeFilename(originalName) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
  return 'mistake-' + uniqueSuffix + ext;
}

/**
 * 根据扩展名推断 MIME 类型
 */
function mimeOf(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * 构造 Supabase 请求头，同时兼容新旧两种密钥体系：
 *   旧版（JWT）：eyJ... 开头，用 Authorization: Bearer <key>
 *   新版（Secret）：sb_secret_... 开头，用 apikey: <key> 和 Authorization: Bearer <key>
 * 新版密钥同时带 apikey 头最稳妥，旧版带 apikey 也兼容。
 */
function authHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

/**
 * 上传文件
 * @param {Buffer} buffer 文件内容
 * @param {string} originalName 原始文件名（用于取扩展名）
 * @returns {Promise<{filename: string, url: string}>}
 *          filename 用于存数据库；url 供前端直接访问
 */
async function uploadFile(buffer, originalName) {
  const filename = makeFilename(originalName);

  if (USE_SUPABASE) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase 存储未配置：缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY');
    }

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`;
    const resp = await fetch(uploadUrl, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': mimeOf(filename),
        'x-upsert': 'true',
      }),
      body: buffer,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`上传到 Supabase 失败: ${resp.status} ${text}`);
    }

    return {
      filename,
      url: getPublicUrl(filename),
    };
  }

  // 本地存储
  ensureLocalDir();
  const target = path.join(LOCAL_DIR, filename);
  fs.writeFileSync(target, buffer);

  return {
    filename,
    url: '/uploads/' + filename,
  };
}

/**
 * 获取公开访问地址
 */
function getPublicUrl(filename) {
  if (USE_SUPABASE) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
  }
  return '/uploads/' + filename;
}

/**
 * 读取文件内容（用于 AI 视觉识别）
 * @param {string} filenameOrPath 文件名或旧格式路径
 * @returns {Promise<Buffer>}
 */
async function readFile(filenameOrPath) {
  // 归一化：去掉可能存在的 /uploads/ 前缀或完整 URL 前缀
  let filename = filenameOrPath;
  if (filename.includes('/uploads/')) {
    filename = filename.split('/uploads/').pop();
  } else if (filename.startsWith('http')) {
    // 完整 URL 形式（Supabase 公开地址）
    filename = filename.split('/').pop();
  }
  filename = path.basename(filename);

  if (USE_SUPABASE) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase 存储未配置');
    }
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`;
    const resp = await fetch(url, { headers: authHeaders() });
    if (!resp.ok) {
      throw new Error(`从 Supabase 读取失败: ${resp.status}`);
    }
    return Buffer.from(await resp.arrayBuffer());
  }

  // 本地存储
  const localPath = path.join(LOCAL_DIR, filename);
  if (!fs.existsSync(localPath)) {
    throw new Error('图片文件不存在');
  }
  return fs.readFileSync(localPath);
}

/**
 * 判断文件是否存在
 */
async function exists(filenameOrPath) {
  let filename = filenameOrPath;
  if (filename.includes('/uploads/')) {
    filename = filename.split('/uploads/').pop();
  } else if (filename.startsWith('http')) {
    filename = filename.split('/').pop();
  }
  filename = path.basename(filename);

  if (USE_SUPABASE) {
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`,
        { method: 'HEAD', headers: authHeaders() }
      );
      return resp.ok;
    } catch (e) {
      return false;
    }
  }

  return fs.existsSync(path.join(LOCAL_DIR, filename));
}

/**
 * 删除文件
 */
async function deleteFile(filenameOrPath) {
  let filename = filenameOrPath;
  if (filename.includes('/uploads/')) {
    filename = filename.split('/uploads/').pop();
  }
  filename = path.basename(filename);

  if (USE_SUPABASE) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return;
  }

  const localPath = path.join(LOCAL_DIR, filename);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }
}

module.exports = {
  uploadFile,
  readFile,
  exists,
  deleteFile,
  getPublicUrl,
  makeFilename,
  storageType: USE_SUPABASE ? 'supabase' : 'local',
  bucket: BUCKET,
};
