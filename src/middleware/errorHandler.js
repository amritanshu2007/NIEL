'use strict';

/**
 * Central error handler. Must be registered last in the middleware chain.
 */
function errorHandler(err, _req, res, _next) {
  console.error(err.stack);

  const status = err.status || 500;
  const message = err.isPublic ? err.message : 'Internal Server Error';

  res.status(status).json({ error: message });
}

module.exports = errorHandler;