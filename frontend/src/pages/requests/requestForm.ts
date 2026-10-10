import type { RequestRequirements } from '../../types';

export type RequestFormValues = RequestRequirements & { department?: string };
export type RequestFormErrors = Partial<Record<keyof RequestFormValues, string>>;

export function emptyRequestForm(department = ''): RequestFormValues {
  return { title: '', category: '', purpose: '', description: '', specifications: {}, quantity: 1, urgency: 'normal', neededBy: '', department };
}

/** Client-side checks mirroring the API rules; the API remains authoritative. */
export function validateRequestForm(v: RequestFormValues): RequestFormErrors {
  const e: RequestFormErrors = {};
  if (v.title.trim().length < 3) e.title = 'Give your request a short title (at least 3 characters)';
  if (!v.category) e.category = 'Choose the kind of resource you need';
  if (v.purpose.trim().length < 3) e.purpose = 'Tell us what you will use it for';
  if (v.description.trim().length < 5) e.description = 'Describe what you need (at least 5 characters)';
  if (!Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > 50) e.quantity = 'Quantity must be between 1 and 50';
  return e;
}

/** Converts form values into the API payload shape. */
export function toRequestPayload(v: RequestFormValues) {
  return {
    title: v.title.trim(),
    category: v.category,
    purpose: v.purpose.trim(),
    description: v.description.trim(),
    specifications: v.specifications,
    quantity: v.quantity,
    urgency: v.urgency,
    neededBy: v.neededBy ? new Date(v.neededBy).toISOString() : null,
    ...(v.department !== undefined ? { department: v.department.trim() } : {}),
  };
}
