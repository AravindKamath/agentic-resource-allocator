import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import {
  createRequestSchema,
  updateRequestSchema,
  listRequestsSchema,
  transitionSchema,
  clarificationResponseSchema,
  assignSchema,
  idParams
} from './resourceSchemas.js';
import Joi from 'joi';
import {
  createRequest,
  listRequests,
  getRequestDetail,
  updateRequestByRequester,
  respondToClarification,
  transitionRequest,
  getAdminOverview
} from '../services/resourceRequestService.js';
import { assignAsset } from '../services/allocationService.js';

export const resourceRequests = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const idOnly = Joi.object({ params: idParams });

resourceRequests.use(requireAuth);

resourceRequests.get('/', validate(listRequestsSchema), wrap(async (req, res) => {
  res.json(await listRequests(req.user, req.query));
}));

resourceRequests.get('/overview', requireRole('admin'), wrap(async (req, res) => {
  res.json(await getAdminOverview());
}));

resourceRequests.post('/', validate(createRequestSchema), wrap(async (req, res) => {
  res.status(201).json({ request: await createRequest(req.user, req.body) });
}));

resourceRequests.get('/:id', validate(idOnly), wrap(async (req, res) => {
  res.json({ request: await getRequestDetail(req.params.id, req.user) });
}));

resourceRequests.get('/:id/history', validate(idOnly), wrap(async (req, res) => {
  const { history } = await getRequestDetail(req.params.id, req.user);
  res.json({ history });
}));

resourceRequests.patch('/:id', validate(updateRequestSchema), wrap(async (req, res) => {
  res.json({ request: await updateRequestByRequester(req.params.id, req.user, req.body) });
}));

resourceRequests.post('/:id/transitions', validate(transitionSchema), wrap(async (req, res) => {
  res.json({ request: await transitionRequest(req.params.id, req.user, req.body) });
}));

resourceRequests.post('/:id/clarification-response', validate(clarificationResponseSchema), wrap(async (req, res) => {
  res.json({ request: await respondToClarification(req.params.id, req.user, req.body) });
}));

resourceRequests.post('/:id/assignments', requireRole('admin'), validate(assignSchema), wrap(async (req, res) => {
  const result = await assignAsset({
    requestId: req.params.id,
    assetId: req.body.assetId,
    mode: req.body.mode,
    notes: req.body.notes,
    actor: req.user
  });
  res.status(201).json({
    assignment: result.assignment,
    request: await getRequestDetail(req.params.id, req.user)
  });
}));
