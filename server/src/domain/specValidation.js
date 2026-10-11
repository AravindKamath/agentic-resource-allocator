import Joi from 'joi';
import { SPEC_FIELDS } from './resourceCatalog.js';

function joiForField(def) {
  switch (def.type) {
    case 'number': {
      let s = Joi.number().min(def.min ?? 0).max(def.max ?? Number.MAX_SAFE_INTEGER);
      if (def.integer) s = s.integer();
      return s;
    }
    case 'enum':
      return Joi.string().valid(...def.options);
    case 'boolean':
      return Joi.boolean();
    default:
      return Joi.string().trim().max(def.maxLength ?? 200);
  }
}

// Only known spec keys are accepted; unknown keys are rejected rather than
// silently stored, so the vocabulary stays consistent for later matching.
export const specsSchema = Joi.object(
  Object.fromEntries(Object.entries(SPEC_FIELDS).map(([k, def]) => [k, joiForField(def).allow(null, '')]))
).unknown(false);

/** Drop empty values so "left blank" does not get stored as a requirement. */
export function compactSpecs(specs = {}) {
  return Object.fromEntries(
    Object.entries(specs).filter(([, v]) => v !== null && v !== undefined && v !== '')
  );
}

/** Mongoose validator: same rules as the API, for writes that bypass Joi. */
export function isValidSpecs(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  return !specsSchema.validate(value).error;
}
