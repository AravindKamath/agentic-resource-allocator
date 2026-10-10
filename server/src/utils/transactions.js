import mongoose from 'mongoose';
import { httpError } from './httpError.js';

let supportCache = null;

/** Multi-document transactions need a replica set or sharded cluster (Atlas is a replica set). */
export async function supportsTransactions() {
  if (supportCache !== null) return supportCache;
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  supportCache = Boolean(hello.setName || hello.msg === 'isdbgrid');
  return supportCache;
}

/**
 * Run `fn(session)` inside a transaction. The driver retries `fn` on transient
 * errors (e.g. write conflicts between concurrent allocations), so `fn` must
 * re-read everything it depends on through the session. Errors thrown by `fn`
 * abort the transaction and are rethrown unchanged.
 */
export async function runInTransaction(fn) {
  if (!(await supportsTransactions())) {
    throw httpError(503, 'Asset allocation requires MongoDB transactions (a replica set deployment such as Atlas).');
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
