'use strict';

// Backwards-compatible re-export. Canonical implementation lives in
// ./authMiddleware so there is a single source of truth for JWT guards.
module.exports = require('./authMiddleware');