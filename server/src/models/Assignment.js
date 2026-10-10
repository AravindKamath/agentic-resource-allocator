import mongoose from 'mongoose';
import { ASSIGNMENT_STATUS, ASSIGNMENT_STATUS_VALUES } from '../domain/resourceCatalog.js';

const schema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ResourceRequest', required: true, immutable: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, immutable: true },
  status: { type: String, enum: ASSIGNMENT_STATUS_VALUES, required: true },
  // true while the assignment holds the asset (proposed or active). Backs the
  // partial unique index below: an asset can have at most one current assignment.
  isCurrent: { type: Boolean, required: true },

  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  assignedAt: { type: Date, default: () => new Date(), immutable: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  endedAt: { type: Date, default: null },
  endReason: { type: String, maxlength: 2000 },
  notes: { type: String, maxlength: 2000 }
}, { timestamps: true });

schema.index(
  { asset: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true }, name: 'one_current_assignment_per_asset' }
);
schema.index({ request: 1, status: 1 });
schema.index({ asset: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

schema.pre('validate', function setIsCurrent(next) {
  this.isCurrent = [ASSIGNMENT_STATUS.PROPOSED, ASSIGNMENT_STATUS.ACTIVE].includes(this.status);
  next();
});

export const Assignment = mongoose.model('Assignment', schema);
