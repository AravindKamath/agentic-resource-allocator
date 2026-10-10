import { logger } from '../logger.js';

// Map well-known library errors to client errors instead of 500s.
function classify(err) {
  if (err.status) return { status: err.status, message: err.publicMessage };
  if (err.name === 'ValidationError') {
    const fields = Object.keys(err.errors || {}).join(', ');
    return { status: 400, message: fields ? `Invalid value for: ${fields}` : 'Invalid input' };
  }
  if (err.name === 'CastError') return { status: 400, message: `Invalid value for ${err.path}` };
  if (err.code === 11000) return { status: 409, message: 'A record with the same unique value already exists' };
  return { status: 500, message: undefined };
}

export function errorHandler(err, req, res, next) {
  const { status, message } = classify(err);

  if (status >= 500) logger.error({ err }, 'Unhandled error');

  const safe = {
    error: err.name || 'Error',
    message: message || 'Something went wrong'
  };

  res.status(status).json(safe);
}
