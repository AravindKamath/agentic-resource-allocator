// Change one existing user's role. Non-destructive: touches a single user,
// does not create accounts or modify passwords.
//   npm run set-role -- --email someone@college.edu --role admin
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const ROLES = ['admin', 'agent', 'user'];

if (!args.email || !ROLES.includes(args.role)) {
  console.error(`Usage: npm run set-role -- --email <email> --role <${ROLES.join('|')}>`);
  process.exit(1);
}

try {
  await connectDb();
  const user = await User.findOneAndUpdate({ email: args.email }, { $set: { role: args.role } }, { new: true });
  if (!user) {
    console.error(`No user with email ${args.email}`);
    process.exitCode = 1;
  } else {
    console.log(`Role of ${user.email} is now ${user.role}`);
  }
} finally {
  await mongoose.disconnect();
}
