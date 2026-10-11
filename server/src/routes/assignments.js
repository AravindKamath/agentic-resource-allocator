import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { listAssignmentsSchema, endAssignmentSchema } from './resourceSchemas.js';
import {
  listAssignments,
  approveAssignment,
  rejectAssignment,
  releaseAssignment
} from '../services/allocationService.js';

export const assignments = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

assignments.use(requireAuth, requireRole('admin'));

assignments.get('/', validate(listAssignmentsSchema), wrap(async (req, res) => {
  res.json(await listAssignments(req.query));
}));

assignments.post('/:id/approve', validate(endAssignmentSchema), wrap(async (req, res) => {
  res.json(await approveAssignment({ assignmentId: req.params.id, actor: req.user }));
}));

assignments.post('/:id/reject', validate(endAssignmentSchema), wrap(async (req, res) => {
  res.json(await rejectAssignment({ assignmentId: req.params.id, actor: req.user, reason: req.body.reason }));
}));

assignments.post('/:id/release', validate(endAssignmentSchema), wrap(async (req, res) => {
  res.json(await releaseAssignment({ assignmentId: req.params.id, actor: req.user, reason: req.body.reason }));
}));
