const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const pool = require('./config/db');
const setupSockets = require('./sockets');

// ---- Routes ----
const authRoutes = require('./routes/authRoutes');
const roadRoutes = require('./routes/roadRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const routeRoutes = require('./routes/routeRoutes');
const syncRoutes = require('./routes/syncRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const { startAlertEngine } = require('./services/alertEngine');
const { startWeatherMonitor } = require('./services/weatherMonitor');
const {
  featuresRouter,
  startFeatureWorkers,
  startFeatureListeners,
} = require('../features');

// ---- Middleware ----
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// Real-time channel
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
});

// ---- Global middleware ----
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Expose io to controllers via req.app.get('io') for real-time events
app.set('io', io);

// ---- Health check + DB connectivity probe ----
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/roads', roadRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/route', routeRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/weather', weatherRoutes);

// ---- Modular feature routes (additive: citizen portal, messaging, …) ----
app.use('/api/v1/features', featuresRouter);

// ---- Citizen photo uploads (feature-provided static files) ----
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---- Frontend static hosting (built Vite/React bundle) ----
const DIST_DIR = path.join(__dirname, '..', 'dist');
const HAS_FRONTEND_BUILD = fs.existsSync(path.join(DIST_DIR, 'index.html'));

if (HAS_FRONTEND_BUILD) {
  app.use(express.static(DIST_DIR));

  // SPA fallback: index.html for any non-API GET, so React Router handles
  // client-side navigation. API/socket paths are excluded (they fall through
  // to the error handler for a proper 404) and requests carrying a file
  // extension are left untouched so missing assets never return HTML.
  app.get(/^\/(?!api\/|socket\.io\/|health)/, (req, res, next) => {
    if (req.path.length > 1 && req.path.includes('.')) {
      return next();
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });

  console.log(`[static] Serving frontend build from ${DIST_DIR}`);
} else {
  console.log(`[static] No frontend build found at ${DIST_DIR} - API-only mode`);
}

// ---- Error handling (must be last) ----
app.use(errorHandler);

// ---- Bootstrap ----
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await pool.query('SELECT NOW()');
    console.log('Connected to PostgreSQL/PostGIS');

    setupSockets(io);
    startAlertEngine(io);
    startWeatherMonitor(io);
    startFeatureWorkers(io);

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Socket.io listening on same port`);
      if (HAS_FRONTEND_BUILD) {
        console.log(`Frontend SPA served at http://localhost:${PORT}`);
      }
      startFeatureListeners();
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();