import mongoose from 'mongoose';
import { Asset } from '../models/Asset.js';
import { Assignment } from '../models/Assignment.js';
import { compactSpecs } from '../domain/specValidation.js';
import { httpError } from '../utils/httpError.js';
import { logger } from '../logger.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const currentAssignmentPopulate = {
  path: 'currentAssignment',
  select: 'status request assignedAt',
  populate: { path: 'request', select: 'title status requester', populate: { path: 'requester', select: 'name email department' } }
};

export async function createAsset(body, actor) {
  const asset = await Asset.create({ ...body, specs: compactSpecs(body.specs) });
  logger.info({ assetId: String(asset._id), assetTag: asset.assetTag, actor: String(actor._id) }, 'Asset created');
  return asset.toObject();
}

export async function listAssets(query) {
  const filter = {};
  if (query.status?.length) filter.status = { $in: query.status };
  if (query.category) filter.category = query.category;
  if (query.q) {
    const rx = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$or = [{ assetTag: rx }, { name: rx }, { model: rx }, { manufacturer: rx }, { location: rx }];
  }
  const { page, limit } = query;
  const [items, total] = await Promise.all([
    Asset.find(filter).sort({ assetTag: 1 }).skip((page - 1) * limit).limit(limit).populate(currentAssignmentPopulate).lean(),
    Asset.countDocuments(filter)
  ]);
  return { items, total, page, limit };
}

export async function getAsset(id) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Asset not found');
  const asset = await Asset.findById(id).populate(currentAssignmentPopulate).lean();
  if (!asset) throw httpError(404, 'Asset not found');
  const history = await Assignment.find({ asset: id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('request', 'title status')
    .populate('assignedBy endedBy', 'name')
    .lean();
  return { ...asset, assignmentHistory: history };
}

/**
 * Admin edit. A manual status change (available / maintenance / unavailable /
 * retired) is only applied while the asset holds no assignment; the condition
 * is part of the update filter so it cannot race with an allocation.
 */
export async function updateAsset(id, updates, actor) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Asset not found');
  const set = { ...updates };
  if ('specs' in set) set.specs = compactSpecs(set.specs);

  const filter = { _id: id };
  if ('status' in set) filter.currentAssignment = null;

  const asset = await Asset.findOneAndUpdate(filter, { $set: set }, { new: true, runValidators: true });
  if (!asset) {
    const exists = await Asset.exists({ _id: id });
    if (!exists) throw httpError(404, 'Asset not found');
    throw httpError(409, 'Asset is currently reserved or allocated; end its assignment before changing its status');
  }
  logger.info({ assetId: id, fields: Object.keys(set), actor: String(actor._id) }, 'Asset updated');
  return getAsset(id);
}
