import mongoose from 'mongoose';
import { CATEGORY_KEYS, ASSET_STATUS, ASSET_STATUS_VALUES } from '../domain/resourceCatalog.js';
import { isValidSpecs } from '../domain/specValidation.js';

export const ASSET_TAG_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;

const schema = new mongoose.Schema({
  assetTag: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    match: ASSET_TAG_PATTERN,
    immutable: true
  },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  category: { type: String, enum: CATEGORY_KEYS, required: true },
  manufacturer: { type: String, trim: true, maxlength: 100 },
  model: { type: String, trim: true, maxlength: 100 },
  serialNumber: { type: String, trim: true, maxlength: 100 },
  specs: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({}),
    validate: { validator: isValidSpecs, message: 'Invalid specifications' }
  },
  operatingSystem: { type: String, trim: true, maxlength: 100 },
  software: { type: [String], default: [] },
  location: { type: String, trim: true, maxlength: 200 },
  department: { type: String, trim: true, maxlength: 200 },
  status: { type: String, enum: ASSET_STATUS_VALUES, default: ASSET_STATUS.AVAILABLE, required: true },
  // Set only by the allocation service, together with status reserved/allocated.
  currentAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
  notes: { type: String, trim: true, maxlength: 5000 }
}, { timestamps: true });

schema.index({ assetTag: 1 }, { unique: true });
schema.index({ category: 1, status: 1 });
schema.index({ status: 1, updatedAt: -1 });

export const Asset = mongoose.model('Asset', schema);
