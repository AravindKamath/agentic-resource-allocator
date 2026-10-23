import { Router } from 'express';
import mongoose from 'mongoose';

export const health = Router();

health.get('/healthz', (req, res) => res.json({ ok: true }));
health.get('/readyz', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ ready });
});
