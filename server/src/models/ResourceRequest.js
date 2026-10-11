import mongoose from 'mongoose';
import {
  CATEGORY_KEYS,
  URGENCY_KEYS,
  REQUEST_STATUS,
  REQUEST_STATUS_VALUES
} from '../domain/resourceCatalog.js';
import { isValidSpecs } from '../domain/specValidation.js';

const specsField = {
  type: mongoose.Schema.Types.Mixed,
  default: () => ({}),
  validate: { validator: isValidSpecs, message: 'Invalid specifications' }
};

// Append-only record of status changes, comments and allocation events.
// Embedded so a status change and its history entry are written atomically.
const historySchema = new mongoose.Schema({
  type: { type: String, enum: ['created', 'status_change', 'updated', 'clarification_response', 'assignment'], required: true },
  from: { type: String, enum: [...REQUEST_STATUS_VALUES, null], default: null },
  to: { type: String, enum: [...REQUEST_STATUS_VALUES, null], default: null },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorRole: { type: String, enum: ['admin', 'agent', 'user', 'system'], required: true },
  message: { type: String, maxlength: 5000 },
  meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  at: { type: Date, default: () => new Date() }
}, { _id: true });

const requirementFields = {
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  category: { type: String, enum: CATEGORY_KEYS, required: true },
  purpose: { type: String, required: true, trim: true, maxlength: 2000 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  specifications: specsField,
  quantity: { type: Number, required: true, min: 1, max: 50, validate: Number.isInteger },
  urgency: { type: String, enum: URGENCY_KEYS, default: 'normal' },
  neededBy: { type: Date, default: null }
};

const schema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  department: { type: String, trim: true, maxlength: 200 },

  ...requirementFields,

  // Snapshot of the submission as originally received; never modified.
  original: {
    type: new mongoose.Schema({
      title: String,
      category: String,
      purpose: String,
      description: String,
      specifications: mongoose.Schema.Types.Mixed,
      quantity: Number,
      urgency: String,
      neededBy: Date
    }, { _id: false }),
    immutable: true,
    required: true
  },

  status: { type: String, enum: REQUEST_STATUS_VALUES, default: REQUEST_STATUS.RECEIVED, required: true },

  // Denormalised counts of current assignments, maintained inside the same
  // transaction as the Assignment documents (which remain the source of truth).
  allocation: {
    active: { type: Number, default: 0, min: 0 },
    proposed: { type: Number, default: 0, min: 0 }
  },

  rejection: {
    reason: String,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date
  },
  pendingClarification: {
    message: String,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: Date
  },
  closure: {
    reason: String,
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: Date
  },

  automation: {
    status: { type: String, enum: ['not_processed', 'processing', 'allocated', 'escalated', 'failed'], default: 'not_processed' },
    outcomeCode: { type: String, enum: ['NONE', 'MISSING_REQUIREMENTS', 'UNCLASSIFIED_REQUEST', 'INVALID_EXTRACTION', 'NO_COMPATIBLE_ASSET', 'INSUFFICIENT_QUANTITY', 'ALLOCATION_CONFLICT', 'EXTRACTION_UNAVAILABLE'] },
    reason: { type: String, maxlength: 2000 },
    sourceHash: { type: String, maxlength: 128 },
    extraction: { type: mongoose.Schema.Types.Mixed, default: undefined },
    processedAt: Date
  },

  history: { type: [historySchema], default: [] }
}, { timestamps: true });

schema.index({ requester: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ category: 1, status: 1 });
schema.index({ urgency: 1, status: 1 });

export const ResourceRequest = mongoose.model('ResourceRequest', schema);
