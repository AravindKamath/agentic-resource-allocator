import { Router } from 'express';
import Joi from 'joi';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createAssetSchema, updateAssetSchema, listAssetsSchema, idParams } from './resourceSchemas.js';
import { createAsset, listAssets, getAsset, updateAsset } from '../services/assetService.js';

export const assets = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// Inventory is administrator-only.
assets.use(requireAuth, requireRole('admin'));

assets.get('/', validate(listAssetsSchema), wrap(async (req, res) => {
  res.json(await listAssets(req.query));
}));

assets.post('/', validate(createAssetSchema), wrap(async (req, res) => {
  res.status(201).json({ asset: await createAsset(req.body, req.user) });
}));

assets.get('/:id', validate(Joi.object({ params: idParams })), wrap(async (req, res) => {
  res.json({ asset: await getAsset(req.params.id) });
}));

assets.patch('/:id', validate(updateAssetSchema), wrap(async (req, res) => {
  res.json({ asset: await updateAsset(req.params.id, req.body, req.user) });
}));
