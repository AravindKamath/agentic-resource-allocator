import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  gmailMessageId: { type: String, required: true, unique: true, index: true },
  threadId: { type: String, required: true, index: true },
  sender: { type: String, required: true, lowercase: true, trim: true },
  subject: { type: String, maxlength: 998 },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ResourceRequest', default: null, index: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  status: { type: String, enum: ['received', 'processing', 'completed', 'ignored', 'failed'], default: 'received' },
  error: { type: String, maxlength: 2000 },
  receivedAt: { type: Date, default: () => new Date() },
  processedAt: Date
}, { timestamps: true });

export const EmailMessage = mongoose.model('EmailMessage', schema);
