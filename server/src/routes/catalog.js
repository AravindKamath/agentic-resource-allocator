import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { publicCatalog } from '../domain/resourceCatalog.js';

export const catalog = Router();

catalog.get('/', requireAuth, (req, res) => res.json(publicCatalog()));
