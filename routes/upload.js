const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const storage = require('../utils/storage');

// 使用内存存储，再由存储层决定落盘还是上传云端
// 这样本地开发和线上部署走同一套逻辑
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('只支持图片文件（JPG/PNG/GIF/WEBP）'));
  }
});

// 上传错题图片
router.post('/mistake-image', (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: '未收到图片文件' });
    }

    try {
      const result = await storage.uploadFile(req.file.buffer, req.file.originalname);
      res.json({
        success: true,
        filename: result.filename,
        url: result.url,
        size: req.file.size,
        storage: storage.storageType,
      });
    } catch (uploadError) {
      console.error('图片上传失败:', uploadError);
      res.status(500).json({ error: '图片上传失败：' + uploadError.message });
    }
  });
});

// 清理孤儿图片（数据库中没有引用的测试图/临时图）
// 仅用于维护，需要提供维护口令
router.post('/cleanup-orphans', async (req, res) => {
  try {
    const { token, filenames } = req.body;

    const expected = process.env.MAINTENANCE_TOKEN;
    if (!expected) {
      return res.status(503).json({ error: '未配置维护口令，接口不可用' });
    }
    if (token !== expected) {
      return res.status(403).json({ error: '维护口令不正确' });
    }
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ error: '请提供要删除的文件名列表' });
    }

    const results = [];
    for (const f of filenames) {
      try {
        const found = await storage.exists(f);
        if (!found) {
          results.push({ filename: f, status: '不存在，跳过' });
          continue;
        }
        await storage.deleteFile(f);
        results.push({ filename: f, status: '已删除' });
      } catch (e) {
        results.push({ filename: f, status: '失败：' + e.message });
      }
    }

    res.json({ success: true, storage: storage.storageType, results });
  } catch (error) {
    console.error('清理孤儿图片失败:', error);
    res.status(500).json({ error: '清理失败：' + error.message });
  }
});

module.exports = router;
