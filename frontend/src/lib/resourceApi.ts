import api from './api';
import type {
  AdminOverview, Asset, Assignment, Catalog, MatchResult, Paged, RequestRequirements,
  RequestStatus, ResourceRequestDetail, ResourceRequestSummary, Specs
} from '../types';

type Query = Record<string, string | number | boolean | undefined>;

const clean = (q: Query) =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== ''));

export const resourceApi = {
  catalog: async () => (await api.get<Catalog>('/catalog')).data,

  listRequests: async (q: Query = {}) =>
    (await api.get<Paged<ResourceRequestSummary>>('/requests', { params: clean(q) })).data,
  overview: async () => (await api.get<AdminOverview>('/requests/overview')).data,
  getRequest: async (id: string) =>
    (await api.get<{ request: ResourceRequestDetail }>(`/requests/${id}`)).data.request,
  createRequest: async (body: RequestRequirements & { department?: string }) =>
    (await api.post<{ request: ResourceRequestDetail }>('/requests', body)).data.request,
  transition: async (id: string, to: RequestStatus, extra: { reason?: string; message?: string } = {}) =>
    (await api.post<{ request: ResourceRequestDetail }>(`/requests/${id}/transitions`, { to, ...extra })).data.request,
  respondToClarification: async (id: string, message: string, updates: Partial<RequestRequirements> = {}) =>
    (await api.post<{ request: ResourceRequestDetail }>(`/requests/${id}/clarification-response`, { message, updates })).data.request,
  matches: async (id: string) => (await api.get<MatchResult>(`/requests/${id}/matches`)).data,
  assign: async (id: string, assetId: string, mode: 'assign' | 'propose', notes?: string) =>
    (await api.post<{ request: ResourceRequestDetail }>(`/requests/${id}/assignments`, { assetId, mode, notes })).data.request,

  listAssets: async (q: Query = {}) => (await api.get<Paged<Asset>>('/assets', { params: clean(q) })).data,
  getAsset: async (id: string) => (await api.get<{ asset: Asset }>(`/assets/${id}`)).data.asset,
  createAsset: async (body: AssetInput & { assetTag: string }) =>
    (await api.post<{ asset: Asset }>('/assets', body)).data.asset,
  updateAsset: async (id: string, body: Partial<AssetInput>) =>
    (await api.patch<{ asset: Asset }>(`/assets/${id}`, body)).data.asset,

  listAssignments: async (q: Query = {}) =>
    (await api.get<Paged<Assignment>>('/assignments', { params: clean(q) })).data,
  approveAssignment: async (id: string) => (await api.post(`/assignments/${id}/approve`, {})).data,
  rejectAssignment: async (id: string, reason: string) => (await api.post(`/assignments/${id}/reject`, { reason })).data,
  releaseAssignment: async (id: string, reason: string) => (await api.post(`/assignments/${id}/release`, { reason })).data,
};

export interface AssetInput {
  name: string;
  category: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  specs: Specs;
  operatingSystem?: string;
  software?: string[];
  location?: string;
  department?: string;
  status?: string;
  notes?: string;
}

/** Extracts the API's safe error message from an Axios error. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const data = (error as { response?: { data?: { message?: unknown } } }).response?.data;
    if (data && typeof data.message === 'string') return data.message;
  }
  return fallback;
}
