'use strict';

/**
 * Citizen Crowdsourcing Portal - secure image upload.
 *
 *   * Never trusts client-provided filenames.
 *   * Derives the stored extension from the detected MIME type only.
 *   * Validates MIME type + size before anything touches disk.
 *   * Writes only the safe reference into PostgreSQL (photo_url).
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'citizen-reports');
const PUBLIC_PREFIX = '/uploads/citizen-reports';

const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Extension comes from the MIME whitelist - originalname is ignored.
    const ext = ALLOWED_MIME.get(file.mimetype) || '.bin';
    const safe = `cr-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safe);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Photo must be an image (${[...ALLOWED_MIME.keys()].join(', ')})`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

/** Upload middleware wrapped so multer errors become clean 400 responses. */
const uploadSingleSafe = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Photo exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB size limit`
          : err.message || 'Invalid photo upload';
      return res.status(400).json({ error: message });
    }
    return next();
  });
};

/** Public URL for an uploaded file (or null). */
function photoUrlFromRequest(req) {
  return req.file ? `${PUBLIC_PREFIX}/${req.file.filename}` : null;
}

// The unique filename generator doubles as a testable pure helper.
function safeFilename(mimetype, now = Date.now()) {
  const ext = ALLOWED_MIME.get(mimetype) || '.bin';
  return `cr-${now}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

module.exports = {
  uploadSingleSafe,
  photoUrlFromRequest,
  safeFilename,
  UPLOAD_DIR,
  PUBLIC_PREFIX,
  ALLOWED_MIME,
  MAX_FILE_SIZE,
};