import express from 'express';
import fileUpload from 'express-fileupload';
import fs from 'fs';
import path from 'path';
import os from 'os';

import sequelize from '../../data/sql/sequelize.js';
import socketEvents from '../../socket/socketEvents.js';
import { IMGBB_API_KEY } from '../../core/config.js';

const router = express.Router();
const activeUploads = new Set();
const lastUploadAt = new Map();
const ipWindow = new Map();

const tmpDir = path.join(os.tmpdir(), 'pp_banners');
try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
router.use(fileUpload({
  limits: {
    fileSize: 3 * 1024 * 1024,
    fields: 10,
    files: 1,
  },
  useTempFiles: true,
  tempFileDir: tmpDir,
  abortOnLimit: true,
  uploadTimeout: 10000,
  safeFileNames: true,
}));

router.post('/', async (req, res) => {
  if (typeof req.tickRateLimiter === 'function') {
    try { req.tickRateLimiter(5000); } catch {}
  }
  const { user } = req;
  if (!user) {
    res.status(401).json({ errors: ['not authorized'] });
    return;
  }

  const ipString = req.ip?.ipString || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const nowIp = Date.now();
  const entry = ipWindow.get(ipString) || { cnt: 0, ts: nowIp };
  if (nowIp - entry.ts > 60_000) { entry.cnt = 0; entry.ts = nowIp; }
  entry.cnt += 1;
  ipWindow.set(ipString, entry);
  if (entry.cnt > 5) {
    res.status(429).json({ errors: ['too many uploads from ip, slow down'] });
    return;
  }

  const now = Date.now();
  const last = lastUploadAt.get(user.id) || 0;
  if (now - last < 10_000) {
    res.status(429).json({ errors: ['too many uploads, please wait'] });
    return;
  }
  if (activeUploads.has(user.id)) {
    res.status(429).json({ errors: ['upload in progress, try again shortly'] });
    return;
  }
  activeUploads.add(user.id);

  if (!req.files || !req.files.banner) {
    activeUploads.delete(user.id);
    res.status(400).json({ errors: ['no file provided'] });
    return;
  }
  const file = req.files.banner;
  if (file.truncated) {
    activeUploads.delete(user.id);
    try { if (file.tempFilePath) fs.unlinkSync(file.tempFilePath); } catch {}
    res.status(413).json({ errors: ['file too large'] });
    return;
  }

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
  const mimeAllowed = allowed.includes(file.mimetype);

  let buf = file.data || null;
  if (!buf && file.tempFilePath) {
    try {
      const fd = fs.openSync(file.tempFilePath, 'r');
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      fs.closeSync(fd);
      buf = header;
    } catch {
      buf = null;
    }
  }
  const isPng = buf?.[0] === 0x89 && buf?.[1] === 0x50 && buf?.[2] === 0x4e && buf?.[3] === 0x47;
  const isJpeg = buf?.[0] === 0xff && buf?.[1] === 0xd8;
  const isGif = buf?.[0] === 0x47 && buf?.[1] === 0x49 && buf?.[2] === 0x46;
  const isWebp = buf?.[0] === 0x52 && buf?.[1] === 0x49 && buf?.[2] === 0x46 && buf?.[3] === 0x46 && buf?.[8] === 0x57 && buf?.[9] === 0x45 && buf?.[10] === 0x42 && buf?.[11] === 0x50;
  const isIsoBmff = buf?.[4] === 0x66 && buf?.[5] === 0x74 && buf?.[6] === 0x79 && buf?.[7] === 0x70;
  const brand = buf ? String.fromCharCode(buf[8] || 0, buf[9] || 0, buf[10] || 0, buf[11] || 0) : '';
  const isAvif = isIsoBmff && (brand.startsWith('avif'));
  const isHeic = isIsoBmff && (brand.startsWith('heic') || brand.startsWith('heif'));
  if (!(mimeAllowed || isPng || isJpeg || isGif || isWebp || isAvif || isHeic)) {
    activeUploads.delete(user.id);
    try { if (file.tempFilePath) fs.unlinkSync(file.tempFilePath); } catch {}
    res.status(400).json({ errors: ['unsupported image type'] });
    return;
  }

  let sharp;
  try {
    const mod = await import('sharp');
    sharp = mod.default || mod;
  } catch {
    sharp = null;
  }
  if (!sharp) {
    activeUploads.delete(user.id);
    try { if (file.tempFilePath) fs.unlinkSync(file.tempFilePath); } catch {}
    res.status(503).json({ errors: ['image processing unavailable'] });
    return;
  }

  const sharpInput = file.tempFilePath || file.data || null;
  let meta = null;
  if (sharp && sharpInput) {
    try {
      meta = await sharp(sharpInput).metadata();
      const { width, height } = meta;
      if (width && height && (width * height > 40_000_000)) {
        activeUploads.delete(user.id);
        try { if (file.tempFilePath) fs.unlinkSync(file.tempFilePath); } catch {}
        res.status(413).json({ errors: ['image too large'] });
        return;
      }
      if (width && height && (width < 64 || height < 64)) {
        activeUploads.delete(user.id);
        try { if (file.tempFilePath) fs.unlinkSync(file.tempFilePath); } catch {}
        res.status(400).json({ errors: ['image too small'] });
        return;
      }
    } catch {
      meta = null;
    }
  }

  if (!IMGBB_API_KEY) {
    activeUploads.delete(user.id);
    try { if (file.tempFilePath) fs.unlinkSync(file.tempFilePath); } catch {}
    res.status(503).json({ errors: ['image hosting unavailable'] });
    return;
  }

  try {
    const targetW = 1200;
    const targetH = 360;
    let pipeline = sharp(sharpInput).rotate();
    const haveMeta = meta && meta.width && meta.height;
    if (haveMeta) {
      const sameDim = meta.width === targetW && meta.height === targetH;
      const sameAspect = Math.abs((meta.width / meta.height) - (targetW / targetH)) < 1e-3;
      if (!sameDim) {
        if (sameAspect) {
          pipeline = pipeline.resize({ width: targetW, height: targetH, fit: 'fill' });
        } else {
          pipeline = pipeline.resize({ width: targetW, height: targetH, fit: 'cover' });
        }
      }
    } else {
      pipeline = pipeline.resize({ width: targetW, height: targetH, fit: 'cover' });
    }
    const out = await pipeline.webp({ quality: 82 }).toBuffer();

    const params = new URLSearchParams();
    params.set('key', IMGBB_API_KEY);
    params.set('image', out.toString('base64'));
    params.set('name', String(user.id) + '_banner_' + Date.now());

    const upres = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: params });
    let url = null;
    try {
      const j = await upres.json();
      if (j && j.success && j.data) {
        url = (j.data.image && j.data.image.url)
          ? j.data.image.url
          : (j.data.url || j.data.display_url || null);
      }
    } catch {}
    if (!upres.ok || !url) {
      res.status(500).json({ errors: ['upload failed'] });
      return;
    }

    await sequelize.query('UPDATE Users SET banner = ? WHERE id = ?', {
      replacements: [url, user.id],
    });
    try {
      if (req.user && req.user.data) {
        req.user.data.banner = url;
      }
      socketEvents.reloadUser(user.id, false);
    } catch {}
    res.status(200).json({ status: 'ok', banner: url, version: Date.now(), message: 'banner updated' });
  } catch (e) {
    res.status(500).json({ errors: ['could not save banner'] });
  } finally {
    activeUploads.delete(user.id);
    lastUploadAt.set(user.id, Date.now());
    try { if (file.tempFilePath) fs.unlinkSync(file.tempFilePath); } catch {}
  }
});

export default router;
