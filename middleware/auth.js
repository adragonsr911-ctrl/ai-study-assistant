// JWT认证中间件
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'chuanzhibei_default_secret';

/**
 * 验证用户token的中间件
 * 需要登录的接口使用此中间件
 */
function authMiddleware(req, res, next) {
  try {
    // 从请求头获取token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未登录，请先登录' });
    }

    const token = authHeader.substring(7); // 去掉 "Bearer " 前缀

    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.userId,
      username: decoded.username,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    return res.status(401).json({ error: '登录验证失败，请重新登录' });
  }
}

module.exports = authMiddleware;
