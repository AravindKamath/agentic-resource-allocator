import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ResourceRequest', required: true, index: true },
  eventKey: { type: String, required: true },
  to: { type: String, required: true, lowercase: true, trim: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  htmlBody: { type: String, default: null },
  threadId: { type: String, default: null },
  inReplyTo: { type: String, default: null },
  kind: { type: String, enum: ['acknowledgement', 'result', 'clarification', 'escalation', 'admin', 'update', 'assignment', 'rejection', 'manual_review', 'admin_manual_review'], required: true },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  lastError: String,
  sentAt: Date
}, { timestamps: true });

schema.index({ request: 1, eventKey: 1 }, { unique: true });

export const EmailOutbox = mongoose.model('EmailOutbox', schema);
