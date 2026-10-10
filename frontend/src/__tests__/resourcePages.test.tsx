import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import catalog from './fixtures/catalog.json';
import type { Catalog, ResourceRequestDetail, User } from '../types';
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
  it('admin sees actions and can assign an available asset', async () => {
    useAuthStore.setState({ user: admin, token: 't', refreshToken: 'r' });
    api.getRequest.mockResolvedValue(baseRequest({
      allowedTransitions: [{ to: 'REJECTED', action: 'reject', requires: 'reason' }, { to: 'CLOSED', action: 'close', requires: 'reason' }],
    }));
    api.listAssets.mockResolvedValue({
      items: [{ _id: 'as1', assetTag: 'GPU-ML-001', name: 'ML node', category: 'gpu_system', status: 'available', specs: { gpuCount: 4 }, currentAssignment: null, createdAt: '', updatedAt: '' }],
      total: 1, page: 1, limit: 50,
    });
    api.assign.mockResolvedValue(baseRequest({ status: 'ALLOCATED', allocation: { active: 1, proposed: 0 } }));

    renderAt('/admin/requests/r1', <RequestDetail />, '/admin/requests/:id');

    expect(await screen.findByRole('heading', { name: 'GPU machine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject request' })).toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reject request' }));
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();

    const assignButton = await screen.findByRole('button', { name: 'Assign' });
    fireEvent.click(assignButton);
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith('r00000000000000000000001', 'as1', 'assign'));
    expect(await screen.findByText('Allocated')).toBeInTheDocument();
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
    expect(api.listAssets).not.toHaveBeenCalled();
  });
});
