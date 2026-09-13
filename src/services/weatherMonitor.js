'use strict';

/**
 * Automated meteorological monitoring service.
 *
 * Polls an external weather provider (OpenWeatherMap One Call 3.0 by
 * default) every 15 minutes, correlates district-level rainfall with the
 * PostGIS road network through src/models/weatherModel.js, and applies
 * the escalation matrix:
 *
 *   30 mm/h  - 50 mm/h : OPEN   -> RISKY
 *   > 50 mm/h           : OPEN / RISKY -> BLOCKED
 *   < 30 mm/h for a sustained 2h window : RISKY/BLOCKED -> OPEN
 *
 * Behaviour is guarded so it can never break the graph or the API:
 *   - status writes are atomic with the audit trail,
 *   - an in-process debounce (sustained-clearing window) prevents flapping,
 *   - a daily call budget implements a safe rate-limit handler that falls
 *     back to deterministic mock data on timeout / quota exhaustion /
 *     missing API key, so the stack stays fully demoable offline.
 */

const weatherModel = require('../models/weatherModel');

// ---- Configuration (env overridable, safe defaults) ----
const CONFIG = {
  enabled: (process.env.WEATHER_MONITOR_ENABLED ?? 'true') !== 'false',
  pollMs: Number(process.env.WEATHER_POLL_MS) || 15 * 60 * 1000, // 15 minutes
  apiUrl: process.env.OPENWEATHER_API_URL || 'https://api.openweathermap.org/data/3.0/onecall',
  apiKey: process.env.OPENWEATHER_API_KEY || '',
  dailyBudget: Number(process.env.WEATHER_API_DAILY_BUDGET) || 900,
  requestTimeoutMs: Number(process.env.WEATHER_API_TIMEOUT_MS) || 6000,
  correlationRadiusKm: Number(process.env.WEATHER_CORRELATION_RADIUS_KM) || 120,
  thresholdRisky: Number(process.env.WEATHER_RISKY_THRESHOLD_MMH) || 30,
  thresholdBlocked: Number(process.env.WEATHER_BLOCKED_THRESHOLD_MMH) || 50,
  clearSustainedMs: Number(process.env.WEATHER_CLEAR_SUSTAINED_MS) || 2 * 60 * 60 * 1000, // 2 hours
  forecastWindowHours: Number(process.env.WEATHER_FORECAST_WINDOW_HRS) || 3,
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Runtime state (in-memory, resets on restart) ----
const state = {
  timer: null,
  bootstrapTimer: null,
  lastRunAt: null,
  lastRunDurationMs: null,
  lastError: null,
  lastSummary: null,
  // Monotonic per-day budget tracker (safe rate limiting)
  budgetDayKey: null,
  callsToday: 0,
  // Debounce: roadId -> timestamp when rainfall first dropped below thresholds
  clearingSince: new Map(),
  // Round-robin cursor so districts share the per-tick call budget fairly
  districtCursor: 0,
};

// ---------------------------------------------------------------------------
// Rate limiting + fetch
// ---------------------------------------------------------------------------

const dayKey = () => new Date().toISOString().slice(0, 10);

const refreshBudgetDay = () => {
  const key = dayKey();
  if (state.budgetDayKey !== key) {
    state.budgetDayKey = key;
    state.callsToday = 0;
  }
};

const canCallApi = () => {
  refreshBudgetDay();
  return Boolean(CONFIG.apiKey) && state.callsToday < CONFIG.dailyBudget;
};

const markCall = () => {
  refreshBudgetDay();
  state.callsToday += 1;
};

/**
 * Safe fetch with AbortController timeout. Resolves to parsed JSON or
 * `null` on any network / quota / timeout error (caller falls back).
 */
const fetchJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 429) {
      console.warn('[weatherMonitor] Provider quota exhausted (HTTP 429) - using mock fallback.');
      return null;
    }
    if (!res.ok) {
      console.warn(`[weatherMonitor] Provider HTTP ${res.status} - using mock fallback.`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[weatherMonitor] Fetch failed (${err.name === 'AbortError' ? 'timeout' : err.message}) - using mock fallback.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Deterministic 15-minute-slot PRNG helper
const hashString = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/**
 * Deterministic mock weather so the monitor is fully demonstrable even
 * without an API key / network. Values are stable within each 2-hour
 * block (so the sustained-clearing debounce can be observed), with a
 * small intra-block drift, and differ per district.
 */
const fallbackMockWeather = ({ district }) => {
  const nowMs = Date.now();
  const blockIndex = Math.floor(nowMs / (2 * 60 * 60 * 1000));
  const frac = (nowMs % (2 * 60 * 60 * 1000)) / (2 * 60 * 60 * 1000);

  const baseline = 8 + 42 * Math.abs(Math.sin(hashString(`${district}::block`) + blockIndex));
  const drift = ((hashString(`${district}::drift::${blockIndex}`) % 7)) - 3;
  const wave = Math.round(Math.sin(frac * Math.PI * 2) * 4 * 10) / 10;

  const mmh = clamp(Math.round((baseline + drift + wave) * 10) / 10, 0, 80);
  const forecastMmh = clamp(
    Math.round((baseline + 6 + hashString(`${district}::fc::${blockIndex}`) % 9) * 10) / 10,
    0,
    90
  );

  const condition =
    mmh > CONFIG.thresholdBlocked ? 'Torrential rain (storm cell)' :
    mmh >= CONFIG.thresholdRisky ? 'Heavy rainfall' :
    mmh > 10 ? 'Moderate rainfall' : 'Dry / light drizzle';

  return {
    mmh,
    currentMmh: mmh,
    forecastMmh,
    condition,
    source: 'mock',
    observedAt: new Date(nowMs).toISOString(),
  };
};

/**
 * Fetch One Call 3.0 current + forecast precipitation for a coordinate.
 * `currentMmh` comes from current.rain["1h"] / minutely.precipitation;
 * `forecastMmh` is the peak hourly rain over the configured window.
 * `mmh` (used for the escalation matrix) = current OR near-term
 * forecast peak, whichever is higher (pre-emptive safeguarding).
 */
const fetchDistrictWeather = async ({ district, lon, lat }) => {
  const url = `${CONFIG.apiUrl}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&appid=${encodeURIComponent(CONFIG.apiKey)}&units=metric`;

  // Wrap budget check + fetch so quota is never exceeded
  if (!CONFIG.apiKey) {
    console.warn(`[weatherMonitor] No OPENWEATHER_API_KEY configured - mock fallback for ${district}.`);
    return null;
  }
  if (!canCallApi()) {
    console.warn(`[weatherMonitor] Daily API budget reached - mock fallback for ${district}.`);
    return null;
  }
  markCall();

  const data = await fetchJson(url);
  if (!data) return null;

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const currentRain = toNum(data.current && data.current.rain && data.current.rain['1h']);
  const minutely = Array.isArray(data.minutely) && data.minutely.length > 0
    ? toNum(data.minutely[0].precipitation)
    : 0;
  const currentMmh = clamp(Math.round(Math.max(currentRain, minutely) * 10) / 10, 0, 200);

  const hourly = Array.isArray(data.hourly) ? data.hourly : [];
  const windowHours = Math.max(1, Math.min(24, CONFIG.forecastWindowHours));
  let forecastPeak = 0;
  for (let i = 1; i <= windowHours && i < hourly.length; i += 1) {
    forecastPeak = Math.max(forecastPeak, toNum(hourly[i] && hourly[i].rain && hourly[i].rain['1h']));
  }
  const forecastMmh = clamp(Math.round(forecastPeak * 10) / 10, 0, 200);

  const primary = data.current && data.current.weather && data.current.weather[0]
    ? data.current.weather[0].description
    : 'n/a';

  return {
    mmh: Math.max(currentMmh, forecastMmh),
    currentMmh,
    forecastMmh,
    condition: primary,
    source: 'openweathermap',
    observedAt: new Date().toISOString(),
  };
};

// ---------------------------------------------------------------------------
// Escalation matrix + debounce
// ---------------------------------------------------------------------------

/**
 * Escalation decision for a single road.
 * @param {'OPEN'|'RISKY'|'BLOCKED'} current
 * @param {number} mmh
 * @param {number} sustainedClearingHours hours the rain has been < threshold
 */
const decideStatus = (current, mmh, sustainedClearingHours) => {
  if (mmh > CONFIG.thresholdBlocked) return 'BLOCKED';
  if (mmh >= CONFIG.thresholdRisky) {
    // Only escalate upward; a BLOCKED road never steps down to RISKY
    // (it must clear for the full sustained window first).
    return current === 'BLOCKED' ? 'BLOCKED' : 'RISKY';
  }
  // Clearing path: revert only after the sustained window elapses.
  if (current !== 'OPEN' && sustainedClearingHours >= CONFIG.clearSustainedMs / 3600000) {
    return 'OPEN';
  }
  return current;
};

const clearingHours = (roadId, mmh) => {
  if (mmh >= CONFIG.thresholdRisky) {
    state.clearingSince.delete(roadId); // re-escalating: drop the timer
    return 0;
  }
  const start = state.clearingSince.get(roadId);
  if (start === undefined) {
    state.clearingSince.set(roadId, Date.now());
    return 0;
  }
  return (Date.now() - start) / 3600000;
};

// ---------------------------------------------------------------------------
// Correlation pipeline
// ---------------------------------------------------------------------------

const broadcastChange = (io, row) => {
  if (!io) return;
  const payload = {
    id: row.id,
    road_name: row.road_name,
    district: row.district,
    status: row.status,
    updated_at: row.updated_at,
    path: row.path,
  };
  // All connected dashboards...
  io.emit('road:status', payload);
  // ...plus the district-scoped room (matches controllers/sockets).
  if (row.district) {
    io.to(`district:${row.district}`).emit('road:status', payload);
  }
  if (row.status === 'BLOCKED') {
    io.emit('alert:blocked', payload);
    io.emit('alert', { type: 'blocked', road: payload });
  }
};

/**
 * Evaluate one district observation against its roads and apply changes.
 * @returns summary of applied transitions
 */
const processDistrict = async (io, district, obs) => {
  const roads = await weatherModel.findCorrelatedRoads(district, CONFIG.correlationRadiusKm);
  const changes = [];

  for (const road of roads) {
    const sustained = clearingHours(road.id, obs.mmh);
    const desired = decideStatus(road.current_status, obs.mmh, sustained);

    if (desired === road.current_status) {
      // No state change - but still keep the debounce map sane.
      if (desired === 'OPEN') state.clearingSince.delete(road.id);
      continue;
    }

    const updated = await weatherModel.applyWeatherStatusChange(road.id, desired, {
      previousStatus: road.current_status,
      reason: `Automated weather correlation: ${obs.condition} (${obs.mmh} mm/h, ${obs.source})`,
      source: obs.source === 'mock' ? 'weather-mock' : 'weather',
      rainfallMmh: obs.mmh,
      observedAt: obs.observedAt,
    });

    if (updated) {
      state.clearingSince.delete(road.id);
      broadcastChange(io, updated);
      changes.push({
        roadId: road.id,
        roadName: road.road_name,
        district,
        from: road.current_status,
        to: updated.status,
        mmh: obs.mmh,
        source: obs.source,
      });
      console.log(
        `[weatherMonitor] ${road.road_name} (${district}) ${road.current_status} -> ${updated.status} @ ${obs.mmh} mm/h (${obs.source})`
      );
    }
  }

  return changes;
};

/**
 * Full poll cycle: ensure districts exist, rotate through the budgeted
 * API calls, correlate, apply, broadcast.
 */
const pollCycle = async (io) => {
  const startedAt = Date.now();
  try {
    await weatherModel.ensureMonitoringDistricts();
    const districts = await weatherModel.listMonitoringDistricts();
    if (districts.length === 0) {
      state.lastSummary = { districts: 0, changes: 0 };
      return;
    }

    // Safe per-tick budget so we can never exceed the daily quota even if
    // every district would otherwise be called every 15 minutes.
    const ticksPerDay = Math.max(1, Math.round(DAY_MS / CONFIG.pollMs));
    const perTickBudget = Math.max(1, Math.floor(CONFIG.dailyBudget / ticksPerDay));

    // Round-robin starting offset for fair distribution
    const start = state.districtCursor % districts.length;
    let reported = 0;
    const summary = { districts: districts.length, realCalls: 0, mockCalls: 0, changes: [] };

    for (let k = 0; k < districts.length; k += 1) {
      const district = districts[(start + k) % districts.length];

      let obs = null;
      if (reported < perTickBudget) {
        obs = await fetchDistrictWeather(district);
        if (obs) {
          reported += 1;
          summary.realCalls += 1;
        }
      }
      if (!obs) {
        obs = fallbackMockWeather(district);
        summary.mockCalls += 1;
      }

      await weatherModel.recordObservation(district.district, obs);
      const changes = await processDistrict(io, district.district, obs);
      summary.changes.push(...changes);
    }

    state.districtCursor = (state.districtCursor + districts.length) % districts.length;
    state.lastRunAt = new Date().toISOString();
    state.lastRunDurationMs = Date.now() - startedAt;
    state.lastError = null;
    state.lastSummary = summary;
    console.log(
      `[weatherMonitor] Cycle complete: ${summary.districts} districts, ` +
      `${summary.realCalls} real / ${summary.mockCalls} mock observations, ${summary.changes.length} road transitions`
    );
  } catch (err) {
    state.lastError = err.message;
    console.error('[weatherMonitor] Cycle error:', err.message);
  }
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const startWeatherMonitor = (io) => {
  if (!CONFIG.enabled) {
    console.log('[weatherMonitor] Disabled via WEATHER_MONITOR_ENABLED=false');
    return;
  }
  if (state.bootstrapTimer || state.timer) return; // already running

  // First sweep shortly after boot, then steady interval.
  state.bootstrapTimer = setTimeout(() => {
    state.bootstrapTimer = null;
    pollCycle(io);
  }, 1500);

  state.timer = setInterval(() => {
    pollCycle(io);
  }, CONFIG.pollMs);
  state.timer.unref?.();

  console.log(
    `[weatherMonitor] Started (every ${Math.round(CONFIG.pollMs / 60000)} min, ` +
    (CONFIG.apiKey
      ? `provider=openweathermap, daily budget=${CONFIG.dailyBudget} calls)`
      : 'no API key - running deterministic mock fallback)')
  );
};

const stopWeatherMonitor = () => {
  if (state.bootstrapTimer) {
    clearTimeout(state.bootstrapTimer);
    state.bootstrapTimer = null;
  }
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.clearingSince.clear();
  console.log('[weatherMonitor] Stopped');
};

/**
 * Accept a single webhook-pushed observation (external ingest path) and
 * run it through the identical correlation pipeline.
 * @returns applied transitions
 */
const ingestObservation = async (io, { district, mmh, forecastMmh, condition, source, observedAt }) => {
  await weatherModel.ensureMonitoringDistricts();
  const obs = {
    mmh: Number(mmh) || 0,
    currentMmh: Number(mmh) || 0,
    forecastMmh: Number(forecastMmh) || 0,
    condition: condition || 'webhook report',
    source: source || 'webhook',
    observedAt: observedAt || new Date().toISOString(),
  };

  await weatherModel.recordObservation(district, obs);
  return processDistrict(io, district, obs);
};

const getMonitorStatus = () => ({
  enabled: CONFIG.enabled,
  pollIntervalMs: CONFIG.pollMs,
  provider: CONFIG.apiKey ? 'openweathermap' : 'mock',
  thresholds: {
    riskyMmh: CONFIG.thresholdRisky,
    blockedMmh: CONFIG.thresholdBlocked,
    clearSustainedMs: CONFIG.clearSustainedMs,
    correlationRadiusKm: CONFIG.correlationRadiusKm,
  },
  lastRunAt: state.lastRunAt,
  lastRunDurationMs: state.lastRunDurationMs,
  lastError: state.lastError,
  lastSummary: state.lastSummary,
  apiBudget: { dailyBudget: CONFIG.dailyBudget, callsToday: state.callsToday },
});

module.exports = {
  startWeatherMonitor,
  stopWeatherMonitor,
  pollCycle,
  ingestObservation,
  getMonitorStatus,
  decideStatus, // exported for unit-level verification
  CONFIG,
};