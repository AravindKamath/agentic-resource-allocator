// Deterministic request-to-asset matching. Pure functions only (no database),
// so the same rules serve the advisory GET /requests/:id/matches endpoint and
// the authoritative check inside the allocation transaction.
//
// Vocabulary: a request's `specifications` hold what the requester stated. Each
// stated field becomes a hard requirement whose meaning depends on the field
// (minimum, minimum tier, exact value, capability). Fields the requester left
// blank are unspecified and impose nothing. Missing asset data is never treated
// as compatible: the requirement is "unverified" and blocks assignment until
// the asset record is completed.

import { SPEC_FIELDS, RESOURCE_CATEGORIES } from './resourceCatalog.js';

export const MATCHING_VERSION = 'fit-v1';

export const ELIGIBILITY = Object.freeze({
  COMPATIBLE: 'compatible',     // every stated requirement verified as met
  UNVERIFIED: 'unverified',     // nothing failed, but some requirement cannot be checked
  INCOMPATIBLE: 'incompatible'  // at least one requirement verifiably fails
});

const NUMERIC_MINIMUMS = ['cpuCores', 'memoryGb', 'storageGb', 'gpuCount', 'gpuMemoryGb', 'networkPorts', 'networkSpeedGbps'];
const STORAGE_TIERS = { hdd: 1, ssd: 2, nvme: 3 };
const GPU_FIELDS = ['gpuModel', 'gpuCount', 'gpuMemoryGb'];

// Ranking points (relative ordering only; not a probability or confidence).
export const SCORING = Object.freeze({
  FIT_MAX: 60,          // closeness of fit across minimum-type requirements (best fit wins)
  GPU_MODEL_MATCH: 15,  // asset GPU model contains every significant word of the requested model
  OS_EXACT: 10,         // asset OS contains every word of the requested OS (not just the same family)
  DEPARTMENT_MATCH: 10  // asset belongs to the request's department
});

// ---------------------------------------------------------------- helpers

const tokens = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const label = (field) => SPEC_FIELDS[field]?.label ?? field;
const withUnit = (field, value) => (SPEC_FIELDS[field]?.unit ? `${value} ${SPEC_FIELDS[field].unit}` : String(value));
const present = (v) => v !== undefined && v !== null && v !== '';

const LINUX_DISTROS = ['ubuntu', 'debian', 'fedora', 'centos', 'rocky', 'rhel', 'alma', 'suse', 'arch', 'mint'];
const OS_FAMILY_TOKENS = {
  windows: ['windows', 'win10', 'win11'],
  macos: ['macos', 'osx', 'mac'],
  ubuntu: ['ubuntu'], debian: ['debian'], fedora: ['fedora'], centos: ['centos'], rocky: ['rocky'],
  rhel: ['rhel', 'redhat'], alma: ['alma', 'almalinux'], suse: ['suse', 'opensuse', 'sles'], arch: ['arch'], mint: ['mint'],
  linux: ['linux']
};

export function osFamily(text) {
  const t = tokens(text).join(' ').replace(/\bred hat\b/g, 'redhat').split(' ');
  for (const [family, words] of Object.entries(OS_FAMILY_TOKENS)) {
    if (family !== 'linux' && words.some(w => t.includes(w))) return family;
  }
  return t.includes('linux') ? 'linux' : null;
}

const GENERIC_GPU_WORDS = new Set(['any', 'or', 'a', 'an', 'the', 'with', 'gpu', 'gpus', 'card', 'capable', 'compatible', 'cuda', 'cuda-capable', 'equivalent', 'similar', 'better', 'and', 'above']);
export const significantGpuWords = (text) => tokens(text).filter(w => !GENERIC_GPU_WORDS.has(w));

const assetOperatingSystem = (asset) => asset.operatingSystem || asset.specs?.operatingSystem || null;

function assetHasGpu(asset) {
  const s = asset.specs || {};
  if (present(s.gpuCount)) return s.gpuCount >= 1;
  if (present(s.gpuModel) || present(s.gpuMemoryGb)) return true;
  return null; // unknown: not recorded
}

// ----------------------------------------------------- requirement model

/**
 * Turns a request's stated specifications into typed requirements and
 * request-level warnings. Pure; used by both the endpoint and allocation.
 */
export function describeRequirements(request) {
  const specs = request.specifications || {};
  const requirements = [];
  const warnings = [];
  const categoryDef = RESOURCE_CATEGORIES.find(c => c.key === request.category);

  requirements.push({ field: 'category', label: 'Category', kind: 'exact', value: request.category, display: categoryDef?.label ?? request.category });

  for (const field of NUMERIC_MINIMUMS) {
    if (present(specs[field])) {
      requirements.push({ field, label: label(field), kind: 'minimum', value: specs[field], display: `at least ${withUnit(field, specs[field])}` });
    }
  }
  if (present(specs.storageType)) {
    requirements.push({ field: 'storageType', label: label('storageType'), kind: 'minimum_tier', value: specs.storageType, display: `${specs.storageType.toUpperCase()} or faster (HDD < SSD < NVMe)` });
  }
  if (present(specs.formFactor) && specs.formFactor !== 'any') {
    requirements.push({ field: 'formFactor', label: label('formFactor'), kind: 'exact', value: specs.formFactor, display: specs.formFactor });
  }
  if (present(specs.operatingSystem)) {
    requirements.push({ field: 'operatingSystem', label: label('operatingSystem'), kind: 'compatibility', value: specs.operatingSystem, display: specs.operatingSystem });
    if (!osFamily(specs.operatingSystem)) {
      warnings.push({ code: 'UNRECOGNISED_OS', severity: 'warning', field: 'operatingSystem',
        message: `Operating system "${specs.operatingSystem}" is not a recognised family; an asset only matches if its OS text contains the same words, otherwise it needs manual verification.` });
    }
  }
  if (GPU_FIELDS.some(f => present(specs[f]))) {
    requirements.push({ field: 'gpu', label: 'GPU', kind: 'capability', value: true, display: 'a GPU must be present' });
  }
  if (present(specs.gpuModel)) {
    requirements.push({ field: 'gpuModel', label: label('gpuModel'), kind: 'preference', value: specs.gpuModel, display: `prefers "${specs.gpuModel}"` });
    warnings.push({ code: 'FREE_TEXT_GPU_MODEL', severity: 'info', field: 'gpuModel',
      message: `GPU model "${specs.gpuModel}" is free text, so it is used for ranking only; it implies a GPU is required but the exact model is not enforced.` });
  }

  const stated = Object.keys(specs).filter(k => present(specs[k]));
  if (stated.length === 0) {
    warnings.push({ code: 'NO_STRUCTURED_REQUIREMENTS', severity: 'warning',
      message: 'The request has no structured specifications, so candidates are checked for category only. Read the description before assigning, or ask the requester for clarification.' });
  } else if (categoryDef) {
    const unspecified = categoryDef.specFields.filter(f => !present(specs[f]) && !(f === 'formFactor'));
    if (unspecified.length) {
      warnings.push({ code: 'UNSPECIFIED_FIELDS', severity: 'info', fields: unspecified,
        message: `Not specified by the requester (not checked): ${unspecified.map(label).join(', ')}.` });
    }
  }
  if (request.category === 'other') {
    warnings.push({ code: 'CATEGORY_OTHER', severity: 'warning',
      message: '"Other" is a catch-all category; only assets also categorised as Other are considered. Check the description carefully.' });
  }

  return { requirements, warnings };
}

// ------------------------------------------------------------ evaluation

function compareOs(required, actual) {
  if (!present(actual)) return { result: 'missing', message: 'Operating system not recorded on the asset' };
  const rt = tokens(required);
  const at = new Set(tokens(actual));
  if (rt.every(t => at.has(t))) return { result: 'meets', exact: true, message: `Runs ${actual}` };

  const rf = osFamily(required);
  const af = osFamily(actual);
  if (rf === 'linux' && (af === 'linux' || LINUX_DISTROS.includes(af))) {
    return { result: 'meets', exact: false, message: `Runs ${actual} (a Linux distribution)` };
  }
  if (!rf || !af) return { result: 'missing', message: `Cannot compare "${required}" with "${actual}" automatically` };
  if (rf === af) return { result: 'missing', message: `Same OS family but different version/edition ("${actual}"); confirm or re-image and update the asset record` };
  if (af === 'linux' && LINUX_DISTROS.includes(rf)) return { result: 'missing', message: `Asset records only "Linux"; cannot confirm it runs ${required}` };
  return { result: 'fails', message: `Requires ${required}; asset runs ${actual}` };
}

/**
 * Evaluates one asset against a request. Returns eligibility, the per-field
 * comparisons, and (for compatible assets) a deterministic score breakdown.
 * Availability is reported separately by the caller; it is not part of
 * specification compatibility.
 */
export function evaluateAsset(request, asset) {
  const specs = request.specifications || {};
  const a = asset.specs || {};
  const comparisons = [];
  const add = (c) => comparisons.push(c);

  // Category
  add(asset.category === request.category
    ? { field: 'category', label: 'Category', required: request.category, actual: asset.category, result: 'meets', message: 'Matching category' }
    : { field: 'category', label: 'Category', required: request.category, actual: asset.category, result: 'fails', message: `Category is ${asset.category}, request needs ${request.category}` });

  // Numeric minimums
  const fitRatios = [];
  for (const field of NUMERIC_MINIMUMS) {
    if (!present(specs[field])) continue;
    const required = specs[field];
    let actual = a[field];
    // A recorded GPU model or memory implies at least one GPU.
    if (field === 'gpuCount' && !present(actual) && required === 1 && assetHasGpu(asset) === true) actual = 1;
    if (!present(actual)) {
      add({ field, label: label(field), required, actual: null, result: 'missing', message: `${label(field)} not recorded on the asset` });
    } else if (actual < required) {
      add({ field, label: label(field), required, actual, result: 'fails', message: `${label(field)} ${withUnit(field, actual)} is below the required ${withUnit(field, required)}` });
    } else {
      fitRatios.push(required / actual);
      add({ field, label: label(field), required, actual, result: actual === required ? 'meets' : 'exceeds',
        message: actual === required ? `${label(field)} ${withUnit(field, actual)} meets the requirement` : `${label(field)} ${withUnit(field, actual)} exceeds the required ${withUnit(field, required)}` });
    }
  }

  // Storage tier
  if (present(specs.storageType)) {
    const need = STORAGE_TIERS[specs.storageType];
    const have = STORAGE_TIERS[a.storageType];
    if (!have) {
      add({ field: 'storageType', label: label('storageType'), required: specs.storageType, actual: null, result: 'missing', message: 'Storage type not recorded on the asset' });
    } else if (have < need) {
      add({ field: 'storageType', label: label('storageType'), required: specs.storageType, actual: a.storageType, result: 'fails', message: `${a.storageType.toUpperCase()} is slower than the required ${specs.storageType.toUpperCase()}` });
    } else {
      fitRatios.push(need / have);
      add({ field: 'storageType', label: label('storageType'), required: specs.storageType, actual: a.storageType, result: have === need ? 'meets' : 'exceeds',
        message: have === need ? `${a.storageType.toUpperCase()} storage as requested` : `${a.storageType.toUpperCase()} is faster than the required ${specs.storageType.toUpperCase()}` });
    }
  }

  // Form factor (exact unless 'any')
  if (present(specs.formFactor) && specs.formFactor !== 'any') {
    if (!present(a.formFactor) || a.formFactor === 'any') {
      add({ field: 'formFactor', label: label('formFactor'), required: specs.formFactor, actual: a.formFactor ?? null, result: 'missing', message: 'Form factor not recorded on the asset' });
    } else {
      add({ field: 'formFactor', label: label('formFactor'), required: specs.formFactor, actual: a.formFactor, result: a.formFactor === specs.formFactor ? 'meets' : 'fails',
        message: a.formFactor === specs.formFactor ? `Is a ${a.formFactor}` : `Is a ${a.formFactor}, request needs a ${specs.formFactor}` });
    }
  }

  // GPU presence (capability) whenever any GPU field was stated
  if (GPU_FIELDS.some(f => present(specs[f]))) {
    const hasGpu = assetHasGpu(asset);
    add(hasGpu === true
      ? { field: 'gpu', label: 'GPU', required: true, actual: true, result: 'meets', message: a.gpuModel ? `Has GPU: ${a.gpuModel}` : 'Has a GPU' }
      : hasGpu === false
        ? { field: 'gpu', label: 'GPU', required: true, actual: false, result: 'fails', message: 'Asset has no GPU (GPU count 0)' }
        : { field: 'gpu', label: 'GPU', required: true, actual: null, result: 'missing', message: 'GPU not recorded on the asset' });
  }

  // Operating system compatibility
  let osExact = false;
  if (present(specs.operatingSystem)) {
    const actualOs = assetOperatingSystem(asset);
    const r = compareOs(specs.operatingSystem, actualOs);
    osExact = r.result === 'meets' && r.exact;
    add({ field: 'operatingSystem', label: label('operatingSystem'), required: specs.operatingSystem, actual: actualOs, result: r.result, message: r.message });
  }

  const failures = comparisons.filter(c => c.result === 'fails');
  const missing = comparisons.filter(c => c.result === 'missing');
  const eligibility = failures.length ? ELIGIBILITY.INCOMPATIBLE : missing.length ? ELIGIBILITY.UNVERIFIED : ELIGIBILITY.COMPATIBLE;

  // Preferences — computed for every asset for display, but only scored for
  // compatible ones, so they can never compensate for a failed requirement.
  const preferences = [];
  if (present(specs.gpuModel)) {
    const words = significantGpuWords(specs.gpuModel);
    const have = new Set(tokens(a.gpuModel));
    if (words.length && present(a.gpuModel) && words.every(w => have.has(w))) {
      preferences.push({ rule: 'gpu_model_match', points: SCORING.GPU_MODEL_MATCH, message: `GPU model ${a.gpuModel} matches the requested "${specs.gpuModel}"` });
    }
  }
  if (osExact) {
    preferences.push({ rule: 'os_exact', points: SCORING.OS_EXACT, message: 'Operating system matches exactly (not just the family)' });
  }
  if (present(request.department) && present(asset.department) && request.department.trim().toLowerCase() === asset.department.trim().toLowerCase()) {
    preferences.push({ rule: 'department_match', points: SCORING.DEPARTMENT_MATCH, message: `Belongs to the requester's department (${asset.department})` });
  }

  let score = null;
  let scoreBreakdown = [];
  if (eligibility === ELIGIBILITY.COMPATIBLE) {
    if (fitRatios.length) {
      const fit = fitRatios.reduce((s, r) => s + r, 0) / fitRatios.length;
      scoreBreakdown.push({ rule: 'fit', points: Math.round(fit * SCORING.FIT_MAX),
        message: `Closeness of fit ${Math.round(fit * 100)}% across ${fitRatios.length} minimum requirement(s) (closer fit keeps higher-spec assets free)` });
    }
    scoreBreakdown = scoreBreakdown.concat(preferences);
    score = scoreBreakdown.reduce((s, b) => s + b.points, 0);
  }

  return {
    eligibility,
    score,
    scoreBreakdown,
    comparisons,
    matches: comparisons.filter(c => c.result === 'meets' || c.result === 'exceeds').map(c => c.message),
    failures: failures.map(c => c.message),
    unverified: missing.map(c => c.message),
    preferences: preferences.map(p => p.message)
  };
}

/** Deterministic order: higher score first, then asset tag. */
export function compareCandidates(x, y) {
  if ((y.score ?? -1) !== (x.score ?? -1)) return (y.score ?? -1) - (x.score ?? -1);
  return x.asset.assetTag.localeCompare(y.asset.assetTag);
}
