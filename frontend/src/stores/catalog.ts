import { create } from 'zustand';
import type { Catalog } from '../types';
import { resourceApi } from '../lib/resourceApi';

interface CatalogState {
  catalog: Catalog | null;
  error: string | null;
  load: () => Promise<void>;
}

// The catalog (categories, spec fields, statuses) comes from the API so the
// frontend never hardcodes it. Loaded once per session.
export const useCatalogStore = create<CatalogState>((set, get) => ({
  catalog: null,
  error: null,
  load: async () => {
    if (get().catalog) return;
    try {
      set({ catalog: await resourceApi.catalog(), error: null });
    } catch {
      set({ error: 'Could not load resource catalog' });
    }
  },
}));
