// src/lib/saleViewState.ts
// The sale screen's view (tab, search, Items filters, scroll) remembered per sale
// for this browser session, so coming back from a lot lands where you left off,
// with the lot you were on scrolled into view. sessionStorage: a new tab or a
// restart starts fresh. Every access is guarded: storage can be unavailable.

export interface SaleViewState {
  activeTab?: string;
  searchQueries?: Record<string, string>;
  activeFilters?: Record<string, string>;
  statusFilter?: string[];
  tagFilter?: boolean;
  roomFilter?: string;
  detailFilter?: boolean;
  scrollY?: number;
  /** The lot last opened from this sale (set by the lot screen, including Previous/Next). */
  lastLotId?: string | null;
}

const key = (saleId: string) => `saleView:${saleId}`;

export function readSaleView(saleId: string | undefined): SaleViewState {
  if (!saleId) return {};
  try {
    const raw = sessionStorage.getItem(key(saleId));
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as SaleViewState) : {};
  } catch {
    return {};
  }
}

export function writeSaleView(saleId: string | undefined, patch: SaleViewState) {
  if (!saleId) return;
  try {
    sessionStorage.setItem(key(saleId), JSON.stringify({ ...readSaleView(saleId), ...patch }));
  } catch {
    /* storage unavailable: the view just isn't remembered */
  }
}
