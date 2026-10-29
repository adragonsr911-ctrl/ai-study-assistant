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

module.exports = router;
