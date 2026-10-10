import Joi from 'joi';
import {
  CATEGORY_KEYS,
  URGENCY_KEYS,
  REQUEST_STATUS_VALUES,
  ASSET_STATUS_VALUES,
  ADMIN_SETTABLE_ASSET_STATUSES,
  ASSIGNMENT_STATUS_VALUES
} from '../domain/resourceCatalog.js';
import { specsSchema } from '../domain/specValidation.js';

export const objectId = Joi.string().hex().length(24);

export const idParams = Joi.object({ id: objectId.required() });

/** Comma-separated list restricted to `values`, converted to an array. */
const csvOf = (values) => Joi.string().custom((v, helpers) => {
  const items = v.split(',').map(s => s.trim()).filter(Boolean);
  const bad = items.find(i => !values.includes(i));
  return bad ? helpers.message(`"${bad}" is not a valid value`) : items;
});

const pagination = {
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
};

const optionalText = (max) => Joi.string().trim().max(max).allow('');

const requestFields = {
  title: Joi.string().trim().min(3).max(200),
  category: Joi.string().valid(...CATEGORY_KEYS),
  purpose: Joi.string().trim().min(3).max(2000),
  description: Joi.string().trim().min(5).max(5000),
  specifications: specsSchema,
  quantity: Joi.number().integer().min(1).max(50),
  urgency: Joi.string().valid(...URGENCY_KEYS),
  neededBy: Joi.date().iso().allow(null, '')
};

export const createRequestSchema = Joi.object({
  body: Joi.object({
    ...requestFields,
    title: requestFields.title.required(),
    category: requestFields.category.required(),
    purpose: requestFields.purpose.required(),
    description: requestFields.description.required(),
    specifications: specsSchema.default({}),
    quantity: requestFields.quantity.default(1),
    urgency: requestFields.urgency.default('normal'),
    department: optionalText(200)
  }).required()
});

export const updateRequestSchema = Joi.object({
  params: idParams,
  body: Joi.object(requestFields).min(1).required()
});

export const listRequestsSchema = Joi.object({
  query: Joi.object({
    ...pagination,
    status: csvOf(REQUEST_STATUS_VALUES),
    category: Joi.string().valid(...CATEGORY_KEYS),
    urgency: Joi.string().valid(...URGENCY_KEYS),
    q: Joi.string().trim().max(100).allow(''),
    mine: Joi.boolean().default(false),
    sort: Joi.string().valid('newest', 'oldest').default('newest')
  })
});

export const transitionSchema = Joi.object({
  params: idParams,
  body: Joi.object({
    to: Joi.string().valid(...REQUEST_STATUS_VALUES).required(),
    reason: optionalText(2000),
    message: optionalText(5000)
  }).required()
});

export const clarificationResponseSchema = Joi.object({
  params: idParams,
  body: Joi.object({
    message: Joi.string().trim().min(1).max(5000).required(),
    updates: Joi.object(requestFields).default({})
  }).required()
});

export const assignSchema = Joi.object({
  params: idParams,
  body: Joi.object({
    assetId: objectId.required(),
    mode: Joi.string().valid('assign', 'propose').default('assign'),
    notes: optionalText(2000)
  }).required()
});

const assetFields = {
  name: Joi.string().trim().min(1).max(200),
  category: Joi.string().valid(...CATEGORY_KEYS),
  manufacturer: optionalText(100),
  model: optionalText(100),
  serialNumber: optionalText(100),
  specs: specsSchema,
  operatingSystem: optionalText(100),
  software: Joi.array().items(Joi.string().trim().min(1).max(100)).max(50),
  location: optionalText(200),
  department: optionalText(200),
  status: Joi.string().valid(...ADMIN_SETTABLE_ASSET_STATUSES),
  notes: optionalText(5000)
};

export const createAssetSchema = Joi.object({
  body: Joi.object({
    ...assetFields,
    assetTag: Joi.string().trim().uppercase().pattern(/^[A-Z0-9][A-Z0-9._-]{1,39}$/).required()
      .messages({ 'string.pattern.base': 'Asset ID must be 2-40 characters: letters, digits, ".", "_" or "-"' }),
    name: assetFields.name.required(),
    category: assetFields.category.required(),
    specs: specsSchema.default({}),
    software: assetFields.software.default([])
  }).required()
});

export const updateAssetSchema = Joi.object({
  params: idParams,
  body: Joi.object(assetFields).min(1).required()
});

export const listAssetsSchema = Joi.object({
  query: Joi.object({
    ...pagination,
    status: csvOf(ASSET_STATUS_VALUES),
    category: Joi.string().valid(...CATEGORY_KEYS),
    q: Joi.string().trim().max(100).allow('')
  })
});

export const listAssignmentsSchema = Joi.object({
  query: Joi.object({
    ...pagination,
    status: csvOf(ASSIGNMENT_STATUS_VALUES),
    request: objectId,
    asset: objectId
  })
});

export const endAssignmentSchema = Joi.object({
  params: idParams,
  body: Joi.object({ reason: optionalText(2000) }).default({})
});
