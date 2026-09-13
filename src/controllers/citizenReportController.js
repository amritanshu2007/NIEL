'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const citizenReportModel = require('../models/citizenReportModel');
const wrap = require('../utils/wrap');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'citizen-reports');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `report-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

const uploadSingle = upload.single('image');

const validateCoords = (lat, lng) => {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (
    Number.isNaN(latNum) || Number.isNaN(lngNum) ||
    latNum < -90 || latNum > 90 ||
    lngNum < -180 || lngNum > 180
  ) {
    return false;
  }
  return { lat: latNum, lng: lngNum };
};

const validateCategory = (category) => {
  return citizenReportModel.REPORT_CATEGORIES.includes(category);
};

const validateStatus = (status) => {
  return citizenReportModel.REPORT_STATUSES.includes(status);
};

const createReport = wrap(async (req, res) => {
  const { location, category, description, contact_email, contact_phone } = req.body;

  let lat, lng;
  if (location) {
    try {
      const parsed = JSON.parse(location);
      ({ lat, lng } = parsed);
    } catch {
      return res.status(400).json({ error: 'location must be valid JSON { lat, lng }' });
    }
  } else {
    lat = req.body.lat;
    lng = req.body.lng;
  }

  const coords = validateCoords(lat, lng);
  if (!coords) {
    return res.status(400).json({
      error: 'lat must be in [-90, 90] and lng must be in [-180, 180]',
    });
  }

  if (!category || !validateCategory(category)) {
    return res.status(400).json({
      error: `category must be one of: ${citizenReportModel.REPORT_CATEGORIES.join(', ')}`,
    });
  }

  let imageUrl = null;
  let imageFilename = null;
  let imageMimeType = null;

  if (req.file) {
    imageFilename = req.file.filename;
    imageMimeType = req.file.mimetype;
    imageUrl = `/uploads/citizen-reports/${req.file.filename}`;
  }

  const report = await citizenReportModel.createReport({
    lng: coords.lng,
    lat: coords.lat,
    category,
    description: description || null,
    imageUrl,
    imageFilename,
    imageMimeType,
    contactEmail: contact_email || null,
    contactPhone: contact_phone || null,
  });

  return res.status(201).json(report);
});

const listReports = wrap(async (req, res) => {
  const { status, category, limit = '50', offset = '0' } = req.query;

  if (status && !validateStatus(status)) {
    return res.status(400).json({
      error: `status must be one of: ${citizenReportModel.REPORT_STATUSES.join(', ')}`,
    });
  }

  if (category && !validateCategory(category)) {
    return res.status(400).json({
      error: `category must be one of: ${citizenReportModel.REPORT_CATEGORIES.join(', ')}`,
    });
  }

  const reports = await citizenReportModel.listReports({
    status,
    category,
    limit: Math.min(parseInt(limit, 10) || 50, 200),
    offset: parseInt(offset, 10) || 0,
  });

  return res.json(reports);
});

const getReport = wrap(async (req, res) => {
  const { id } = req.params;
  const report = await citizenReportModel.getReportById(id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  return res.json(report);
});

const updateReportStatus = wrap(async (req, res) => {
  const { id } = req.params;
  const { status, review_notes } = req.body;

  if (!status || !validateStatus(status)) {
    return res.status(400).json({
      error: `status must be one of: ${citizenReportModel.REPORT_STATUSES.join(', ')}`,
    });
  }

  const report = await citizenReportModel.updateReportStatus({
    id,
    status,
    reviewedByUserId: req.user.id,
    reviewNotes: review_notes || null,
  });

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  return res.json(report);
});

const getReportStats = wrap(async (_req, res) => {
  const counts = await citizenReportModel.getReportCounts();
  return res.json(counts);
});

module.exports = {
  createReport,
  listReports,
  getReport,
  updateReportStatus,
  getReportStats,
  uploadSingle,
};