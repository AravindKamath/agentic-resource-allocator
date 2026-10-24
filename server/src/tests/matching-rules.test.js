// Unit tests for the pure matching rules (no HTTP; the shared setup still runs).
import { evaluateAsset, describeRequirements, compareCandidates, osFamily, SCORING } from '../domain/matching.js';

const req = (specifications = {}, extra = {}) => ({ category: 'standard_computer', specifications, department: 'Physics', ...extra });
const asset = (specs = {}, extra = {}) => ({ assetTag: 'A-1', category: 'standard_computer', specs, ...extra });
const rank = (request, assets) =>
  assets.map(a => ({ asset: a, ...evaluateAsset(request, a) }))
    .filter(c => c.eligibility === 'compatible')
    .sort(compareCandidates)
    .map(c => c.asset.assetTag);

describe('hard constraints', () => {
  test('exact match is compatible and every stated field is reported as met', () => {
    const r = evaluateAsset(req({ memoryGb: 16, storageGb: 512 }), asset({ memoryGb: 16, storageGb: 512 }));
    expect(r.eligibility).toBe('compatible');
    expect(r.comparisons.filter(c => c.field !== 'category').map(c => c.result)).toEqual(['meets', 'meets']);
    expect(r.failures).toEqual([]);
    expect(r.unverified).toEqual([]);
    expect(r.score).toBe(SCORING.FIT_MAX); // perfect fit, no preferences
  });

  test('exceeding a minimum is compatible but scores lower fit than an exact match', () => {
    const exact = evaluateAsset(req({ memoryGb: 16 }), asset({ memoryGb: 16 }));
    const bigger = evaluateAsset(req({ memoryGb: 16 }), asset({ memoryGb: 64 }));
    expect(bigger.eligibility).toBe('compatible');
    expect(bigger.comparisons.find(c => c.field === 'memoryGb').result).toBe('exceeds');
    expect(bigger.score).toBeLessThan(exact.score);
  });

  test('failing a mandatory hardware requirement makes the asset incompatible', () => {
    const r = evaluateAsset(req({ memoryGb: 32 }), asset({ memoryGb: 16 }));
    expect(r.eligibility).toBe('incompatible');
    expect(r.failures[0]).toMatch(/below the required 32 GB/);
    expect(r.score).toBeNull();

    const noGpu = evaluateAsset(req({ gpuMemoryGb: 8 }, { category: 'workstation' }), asset({ gpuCount: 0, gpuMemoryGb: 0 }, { category: 'workstation' }));
    expect(noGpu.eligibility).toBe('incompatible');
  });

  test('missing asset specifications are unverified, never assumed compatible', () => {
    const r = evaluateAsset(req({ memoryGb: 16, storageType: 'ssd' }), asset({ memoryGb: 32 }));
    expect(r.eligibility).toBe('unverified');
    expect(r.unverified).toEqual(['Storage type not recorded on the asset']);
    expect(r.score).toBeNull();

    const noGpuData = evaluateAsset(req({ gpuMemoryGb: 16 }, { category: 'gpu_system' }), asset({}, { category: 'gpu_system' }));
    expect(noGpuData.eligibility).toBe('unverified');
    expect(noGpuData.unverified).toEqual(expect.arrayContaining(['GPU not recorded on the asset']));
  });

  test('wrong resource category is incompatible even if specs are perfect', () => {
    const r = evaluateAsset(req({ memoryGb: 16 }), asset({ memoryGb: 16 }, { category: 'server' }));
    expect(r.eligibility).toBe('incompatible');
    expect(r.failures[0]).toMatch(/Category is server/);
  });

  test('Other category evaluates inventory by hardware requirements', () => {
    const request = req({ memoryGb: 16 }, { category: 'other' });
    const matching = evaluateAsset(request, asset({ memoryGb: 16 }, { category: 'workstation' }));
    expect(matching.eligibility).toBe('compatible');
    expect(matching.comparisons.some(c => c.field === 'category')).toBe(false);
    expect(describeRequirements(request).warnings.map(w => w.code)).toContain('CATEGORY_NOT_RESTRICTIVE');
  });

  test('storage type is a minimum tier and form factor is exact unless "any"', () => {
    expect(evaluateAsset(req({ storageType: 'ssd' }), asset({ storageType: 'nvme' })).eligibility).toBe('compatible');
    expect(evaluateAsset(req({ storageType: 'ssd' }), asset({ storageType: 'hdd' })).eligibility).toBe('incompatible');
    expect(evaluateAsset(req({ formFactor: 'laptop' }), asset({ formFactor: 'desktop' })).eligibility).toBe('incompatible');
    expect(evaluateAsset(req({ formFactor: 'any' }), asset({ formFactor: 'desktop' })).eligibility).toBe('compatible');
  });

  test('a recorded GPU model implies one GPU; more GPUs need an explicit count', () => {
    const one = evaluateAsset(req({ gpuCount: 1 }, { category: 'gpu_system' }), asset({ gpuModel: 'RTX 4090' }, { category: 'gpu_system' }));
    expect(one.eligibility).toBe('compatible');
    const two = evaluateAsset(req({ gpuCount: 2 }, { category: 'gpu_system' }), asset({ gpuModel: 'RTX 4090' }, { category: 'gpu_system' }));
    expect(two.eligibility).toBe('unverified');
  });

  test('operating system compatibility', () => {
    const os = (required, actual) => evaluateAsset(req({ operatingSystem: required }), asset({}, { operatingSystem: actual })).comparisons.find(c => c.field === 'operatingSystem').result;
    expect(os('Windows 11', 'Windows 11 Pro')).toBe('meets');
    expect(os('Linux', 'Ubuntu 22.04')).toBe('meets');
    expect(os('Ubuntu 22.04', 'Windows 11')).toBe('fails');
    expect(os('Ubuntu 22.04', 'Ubuntu 20.04')).toBe('missing');   // same family, different version: verify
    expect(os('Haiku OS', 'Ubuntu 22.04')).toBe('missing');       // unrecognised family: never "fails"
    expect(os('Ubuntu 22.04', undefined)).toBe('missing');
    expect(osFamily('Red Hat Enterprise Linux 9')).toBe('rhel');
  });
});

describe('request-side information', () => {
  test('no structured requirements → warning, category is the only check', () => {
    const { warnings, requirements } = describeRequirements(req({}));
    expect(warnings.map(w => w.code)).toContain('NO_STRUCTURED_REQUIREMENTS');
    expect(requirements.map(r => r.field)).toEqual(['category']);
    expect(evaluateAsset(req({}), asset({})).eligibility).toBe('compatible');
  });

  test('ambiguous requirements are flagged rather than guessed', () => {
    const { warnings, requirements } = describeRequirements(req({ operatingSystem: 'something modern', gpuModel: 'any CUDA-capable' }, { category: 'gpu_system' }));
    expect(warnings.map(w => w.code)).toEqual(expect.arrayContaining(['UNRECOGNISED_OS', 'FREE_TEXT_GPU_MODEL', 'UNSPECIFIED_FIELDS']));
    expect(requirements.find(r => r.field === 'gpuModel').kind).toBe('preference');
    expect(requirements.find(r => r.field === 'gpu').kind).toBe('capability');
  });

  test('formFactor "any" is treated as unspecified', () => {
    const { requirements } = describeRequirements(req({ formFactor: 'any', memoryGb: 8 }));
    expect(requirements.map(r => r.field)).not.toContain('formFactor');
  });
});

describe('ranking', () => {
  test('closest fit ranks first; department and model preferences add points; ties break by tag', () => {
    const r = req({ memoryGb: 16, gpuModel: 'RTX 4090' }, { category: 'workstation', department: 'Physics' });
    const assets = [
      asset({ memoryGb: 128, gpuModel: 'NVIDIA RTX 4090' }, { assetTag: 'BIG', category: 'workstation' }),
      asset({ memoryGb: 16, gpuModel: 'NVIDIA RTX A2000' }, { assetTag: 'FIT', category: 'workstation' }),
      asset({ memoryGb: 16, gpuModel: 'NVIDIA RTX A2000' }, { assetTag: 'FIT-DEPT', category: 'workstation', department: 'physics' }),
      asset({ memoryGb: 16, gpuModel: 'NVIDIA RTX A2000' }, { assetTag: 'AAA-FIT', category: 'workstation' })
    ];
    // FIT-DEPT: 60 fit + 10 dept = 70; AAA-FIT & FIT: 60 (tie → tag order); BIG: 8 fit + 15 model = 23
    expect(rank(r, assets)).toEqual(['FIT-DEPT', 'AAA-FIT', 'FIT', 'BIG']);
    const big = evaluateAsset(r, assets[0]);
    expect(big.scoreBreakdown.map(b => b.rule)).toEqual(['fit', 'gpu_model_match']);
  });

  test('preferences never override a failed hard constraint', () => {
    const r = req({ memoryGb: 32, gpuModel: 'RTX 4090', operatingSystem: 'Ubuntu 22.04' }, { category: 'workstation', department: 'Physics' });
    const perfectPrefsButTooSmall = asset({ memoryGb: 16, gpuModel: 'RTX 4090' },
      { assetTag: 'PREFS', category: 'workstation', department: 'Physics', operatingSystem: 'Ubuntu 22.04' });
    const e = evaluateAsset(r, perfectPrefsButTooSmall);
    expect(e.eligibility).toBe('incompatible');
    expect(e.score).toBeNull();
    expect(e.preferences.length).toBe(3); // shown for context only
    expect(rank(r, [perfectPrefsButTooSmall])).toEqual([]);
  });
});
