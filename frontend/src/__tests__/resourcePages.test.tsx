import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import catalog from './fixtures/catalog.json';
import type { Catalog, MatchCandidate, MatchResult, ResourceRequestDetail, User } from '../types';
import { useAuthStore } from '../stores/auth';
import { useCatalogStore } from '../stores/catalog';
import { resourceApi } from '../lib/resourceApi';
import { SubmitRequest } from '../pages/requests/SubmitRequest';
import { RequestDetail } from '../pages/requests/RequestDetail';

vi.mock('../lib/resourceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/resourceApi')>();
  return {
    ...actual,
    resourceApi: {
      catalog: vi.fn(),
      createRequest: vi.fn(),
      getRequest: vi.fn(),
      listAssets: vi.fn(),
      matches: vi.fn(),
      assign: vi.fn(),
      transition: vi.fn(),
      respondToClarification: vi.fn(),
    },
  };
});

const api = vi.mocked(resourceApi);

const requester: User = { _id: 'u1', email: 'ravi@college.edu', name: 'Ravi', role: 'user', department: 'CS' };
const admin: User = { _id: 'a1', email: 'ada@college.edu', name: 'Ada', role: 'admin' };

function baseRequest(overrides: Partial<ResourceRequestDetail> = {}): ResourceRequestDetail {
  const req = {
    title: 'GPU machine', category: 'gpu_system', purpose: 'Train models', description: 'One GPU box please',
    specifications: { gpuMemoryGb: 24 }, quantity: 1, urgency: 'high', neededBy: null,
  };
  return {
    _id: 'r00000000000000000000001', ...req, original: req,
    requester: { _id: 'u1', name: 'Ravi', email: 'ravi@college.edu', department: 'CS' },
    department: 'CS', status: 'APPROVED', allocation: { active: 0, proposed: 0 },
    createdAt: '2026-10-10T10:00:00Z', updatedAt: '2026-10-10T10:00:00Z',
    history: [{ _id: 'h1', type: 'created', from: null, to: 'RECEIVED', actor: { _id: 'u1', name: 'Ravi' }, actorRole: 'user', message: 'Request submitted', at: '2026-10-10T10:00:00Z' }],
    assignments: [], allowedTransitions: [], canEdit: false, canRespondToClarification: false,
    ...overrides,
  };
}

function candidate(tag: string, eligibility: MatchCandidate['eligibility'], extra: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    asset: { _id: `as-${tag.toLowerCase().split('-')[1]}`, assetTag: tag, name: 'Fit node', category: 'gpu_system', specs: {} },
    availability: { status: 'available', available: true },
    eligibility, score: null, scoreBreakdown: [], comparisons: [], matches: [], failures: [], unverified: [], preferences: [],
    ...extra,
  };
}

function matchResult(): MatchResult {
  return {
    requestId: 'r00000000000000000000001', generatedAt: '2026-10-10T12:00:00Z', advisory: true,
    method: { version: 'fit-v1', scoring: {} },
    request: { status: 'APPROVED', category: 'gpu_system', quantity: 1, remaining: 1, allocatable: true },
    requirements: [{ field: 'gpuMemoryGb', label: 'GPU memory', kind: 'minimum', value: 24, display: 'at least 24 GB' }],
    warnings: [{ code: 'FREE_TEXT_GPU_MODEL', severity: 'info', message: 'GPU model is free text, so it is used for ranking only.' }],
    candidates: {
      eligible: [candidate('GPU-FIT', 'compatible', {
        score: 60,
        scoreBreakdown: [{ rule: 'fit', points: 60, message: 'Closeness of fit 100%' }],
        comparisons: [{ field: 'gpuMemoryGb', label: 'GPU memory', required: 24, actual: 24, result: 'meets', message: 'meets' }],
      })],
      needsVerification: [candidate('GPU-UNK', 'unverified', { unverified: ['GPU memory not recorded on the asset'] })],
      incompatible: [candidate('GPU-SMALL', 'incompatible', { failures: ['GPU memory 8 GB is below the required 24 GB'] })],
      unavailable: [],
    },
    summary: { evaluated: 3, eligible: 1, needsVerification: 1, incompatible: 1, unavailable: 0, unavailableCompatible: 0, otherCategoryAvailable: 0 },
    explanation: null,
  };
}

function renderAt(path: string, element: React.ReactNode, routePath: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path={routePath} element={element} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useCatalogStore.setState({ catalog: catalog as Catalog, error: null });
});

describe('SubmitRequest', () => {
  beforeEach(() => useAuthStore.setState({ user: requester, token: 't', refreshToken: 'r' }));

  it('shows category-specific spec fields and validates before submitting', async () => {
    renderAt('/requests/new', <SubmitRequest />, '/requests/new');

    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByText('Choose the kind of resource you need')).toBeInTheDocument();
    expect(api.createRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'GPU for thesis' } });
    fireEvent.change(document.getElementById('category')!, { target: { value: 'gpu_system' } });
    expect(screen.getByLabelText('Number of GPUs')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Purpose / use case'), { target: { value: 'Deep learning' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Need a GPU for 3 months' } });
    fireEvent.change(screen.getByLabelText('Number of GPUs'), { target: { value: '2' } });

    api.createRequest.mockResolvedValue(baseRequest());
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    await waitFor(() => expect(api.createRequest).toHaveBeenCalledTimes(1));
    expect(api.createRequest.mock.calls[0][0]).toMatchObject({
      title: 'GPU for thesis', category: 'gpu_system', specifications: { gpuCount: 2 }, quantity: 1, department: 'CS',
    });
  });
});

describe('RequestDetail', () => {
  it('admin sees ranked compatible matches; only those can be assigned', async () => {
    useAuthStore.setState({ user: admin, token: 't', refreshToken: 'r' });
    api.getRequest.mockResolvedValue(baseRequest({
      allowedTransitions: [{ to: 'REJECTED', action: 'reject', requires: 'reason' }, { to: 'CLOSED', action: 'close', requires: 'reason' }],
    }));
    api.matches.mockResolvedValue(matchResult());
    api.assign.mockResolvedValue(baseRequest({ status: 'ALLOCATED', allocation: { active: 1, proposed: 0 } }));

    renderAt('/admin/requests/r1', <RequestDetail />, '/admin/requests/:id');

    expect(await screen.findByRole('heading', { name: 'GPU machine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject request' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject request' }));
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();

    expect(await screen.findByText('Compatible and available (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GPU-FIT' })).toHaveAttribute('href', '/admin/inventory/as-fit');
    expect(screen.getByText('+60: Closeness of fit 100%')).toBeInTheDocument();
    expect(screen.getByText(/Needs verification \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('GPU memory not recorded on the asset')).toBeInTheDocument();
    expect(screen.getByText(/Incompatible \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('GPU memory 8 GB is below the required 24 GB')).toBeInTheDocument();
    expect(screen.getByText(/free text/)).toBeInTheDocument(); // request-level warning

    // exactly one Assign button: the eligible candidate
    const assignButtons = screen.getAllByRole('button', { name: 'Assign' });
    expect(assignButtons).toHaveLength(1);
    fireEvent.click(assignButtons[0]);
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith('r00000000000000000000001', 'as-fit', 'assign'));
    expect(await screen.findByText('Allocated')).toBeInTheDocument();
  });

  it('shows a read-only preview before approval and an explanation when nothing matches', async () => {
    useAuthStore.setState({ user: admin, token: 't', refreshToken: 'r' });
    api.getRequest.mockResolvedValue(baseRequest({ status: 'UNDER_REVIEW' }));
    const preview = matchResult();
    api.matches.mockResolvedValue({
      ...preview,
      request: { ...preview.request, status: 'UNDER_REVIEW', allocatable: false },
      candidates: { ...preview.candidates, eligible: [] },
      explanation: 'No available asset satisfies every stated requirement.',
    });

    renderAt('/admin/requests/r1', <RequestDetail />, '/admin/requests/:id');

    expect(await screen.findByText('Inventory check')).toBeInTheDocument();
    expect(screen.getByText('No available asset satisfies every stated requirement.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument();
  });

  it('requester sees the clarification question and no admin controls', async () => {
    useAuthStore.setState({ user: requester, token: 't', refreshToken: 'r' });
    api.getRequest.mockResolvedValue(baseRequest({
      status: 'CLARIFICATION_REQUIRED',
      pendingClarification: { message: 'Which framework?', requestedAt: '2026-10-10T11:00:00Z' },
      canRespondToClarification: true,
      allowedTransitions: [{ to: 'CLOSED', action: 'close', requires: 'reason' }],
    }));

    renderAt('/requests/r1', <RequestDetail />, '/requests/:id');

    expect(await screen.findByText('Which framework?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send response' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw request' })).toBeInTheDocument();
    expect(screen.queryByText('Assign resources')).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory check')).not.toBeInTheDocument();
    expect(api.matches).not.toHaveBeenCalled();
  });
});
