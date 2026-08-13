// src/lib/auctionStages.ts
// Config + pure logic for the auction sale STAGE pipeline (#2). Declares the
// ordered stages, each stage's checklist items, and pure helpers to evaluate gate
// status and mutate stage_progress. No I/O — persistence lives in SaleStageService.
// See docs/auction-lifecycle-spec.md.

import type {
  SaleStage, StageProgress, StageOverride, Lot, Consignment, Document,
} from '../types';

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  // Derived items are computed from data (lots / consignments / documents), not
  // toggled by hand. Their done-state comes from computeDerived(), not stage_progress.
  derived?: boolean;
}

export interface StageDef {
  stage: SaleStage;
  label: string;
  items: ChecklistItem[];
}

export const STAGE_ORDER: SaleStage[] = [
  'intake', 'setup', 'listed', 'live',
  'settlement', 'fulfillment', 'reconciliation', 'closed',
];

export const STAGES: Record<SaleStage, StageDef> = {
  intake: {
    stage: 'intake', label: 'Intake',
    items: [
      { key: 'contact_logged', label: 'Contact / lead logged', required: true },
      { key: 'consultation_done', label: 'Consultation / preliminary valuation', required: true },
      { key: 'contract_on_file', label: 'Contract signed & on file', required: true, derived: true },
      { key: 'consignment_terms', label: 'Consignment terms captured', required: true, derived: true },
      { key: 'intake_receipt', label: 'Intake receipt / chain of custody', required: true },
      { key: 'insurance_custody', label: 'Insurance in custody', required: false },
    ],
  },
  setup: {
    stage: 'setup', label: 'Setup / Cataloging',
    items: [
      { key: 'photography_complete', label: 'Photography complete', required: true, derived: true },
      { key: 'lots_assigned', label: 'Every lot assigned to a consignor', required: true, derived: true },
      { key: 'lotting_decided', label: 'Lotting decided', required: true },
      { key: 'condition_reports', label: 'Condition reports entered', required: true },
      { key: 'pricing_set', label: 'Reserve / estimate / starting bid set', required: true, derived: true },
      { key: 'dimensions_weight', label: 'Dimensions + weight captured', required: false, derived: true },
      { key: 'restricted_check', label: 'Restricted-items check', required: true },
      { key: 'crosslist_target', label: 'Cross-list target chosen', required: false },
      { key: 'qc_review', label: 'QC / review pass', required: true },
    ],
  },
  listed: {
    stage: 'listed', label: 'Listed',
    items: [
      { key: 'catalog_exported', label: 'Catalog exported to LA', required: true },
      { key: 'terms_of_sale', label: 'Terms of sale set on platform', required: true },
      { key: 'auction_scheduled', label: 'Auction date/time scheduled', required: true },
      { key: 'la_approved', label: 'Catalog approved by LA', required: true },
      { key: 'preview_set', label: 'Preview / exhibition set', required: false },
      { key: 'marketing_started', label: 'Marketing kicked off', required: false },
    ],
  },
  live: {
    stage: 'live', label: 'Live',
    items: [
      { key: 'auction_ended', label: 'Auction ended', required: true },
    ],
  },
  settlement: {
    stage: 'settlement', label: 'Settlement',
    items: [
      { key: 'eoa_imported', label: 'EOA results imported', required: true },
      { key: 'invoices_sent', label: 'Invoices sent', required: false },
      { key: 'payments_collected', label: 'Payments collected', required: true },
      { key: 'nonpaying_resolved', label: 'Non-paying lots resolved', required: true, derived: true },
    ],
  },
  fulfillment: {
    stage: 'fulfillment', label: 'Fulfillment',
    items: [
      { key: 'method_per_lot', label: 'Ship/pickup method set per lot', required: true },
      { key: 'labels_printed', label: 'Packing labels printed', required: false },
      { key: 'manifest', label: 'Packing list / manifest', required: false },
      { key: 'all_fulfilled', label: 'Every paid lot shipped or picked up', required: true, derived: true },
    ],
  },
  reconciliation: {
    stage: 'reconciliation', label: 'Reconciliation',
    items: [
      { key: 'settlements_generated', label: 'Settlement statement per consignor', required: true },
      { key: 'consignors_paid', label: 'Each consignor paid', required: true },
      { key: 'unsold_dispositioned', label: 'Unsold lots dispositioned', required: true, derived: true },
      { key: 'accounting_export', label: 'Accounting export', required: false },
    ],
  },
  closed: {
    stage: 'closed', label: 'Closed',
    items: [
      { key: 'archived', label: 'Archived', required: true },
      { key: 'analytics_captured', label: 'Analytics captured', required: false },
    ],
  },
};

// ── Ordering helpers ─────────────────────────────────────────────────────────

export function stageIndex(stage: SaleStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function nextStage(stage: SaleStage): SaleStage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

// Coarse sales.status derived from the fine stage (spec §1): the sale stays
// `active` through the whole back office; only Closed → completed.
export function deriveStatus(stage: SaleStage): 'upcoming' | 'active' | 'completed' {
  if (stage === 'closed') return 'completed';
  return stageIndex(stage) >= stageIndex('live') ? 'active' : 'upcoming';
}

// ── Derived checklist items ──────────────────────────────────────────────────

export interface DerivedContext {
  lots: Lot[];
  consignments: Consignment[];
  documents: Document[];
}

// Compute the done-state of every `derived` checklist item from live data. Keys
// match the `derived: true` items in STAGES above.
export function computeDerived(ctx: DerivedContext): Record<string, boolean> {
  const { lots, consignments, documents } = ctx;
  const hasLots = lots.length > 0;
  const sold = lots.filter(l => l.outcome === 'sold');
  const paid = lots.filter(l => l.payment_status === 'paid');
  const unsold = lots.filter(l => l.outcome === 'passed' || l.payment_status === 'defaulted');
  return {
    contract_on_file: documents.some(d => d.document_type === 'contract'),
    consignment_terms: consignments.length > 0,
    // TODO: refine to "every lot has ≥1 photo" once photo counts are in context.
    photography_complete: hasLots,
    lots_assigned: hasLots && lots.every(l => !!l.consignment_id),
    pricing_set: hasLots && lots.every(l => l.starting_bid != null || l.estimate_low != null),
    dimensions_weight: hasLots && lots.every(l => l.weight != null),
    nonpaying_resolved: sold.every(l => l.payment_status === 'paid' || l.payment_status === 'defaulted'),
    all_fulfilled: paid.every(l => !!l.shipped_at || l.fulfillment_method === 'pickup'),
    unsold_dispositioned: unsold.every(l => !!l.disposition),
  };
}

// ── Gate evaluation ──────────────────────────────────────────────────────────

export interface ItemStatus extends ChecklistItem {
  done: boolean;
  note?: string;
}

export interface GateStatus {
  items: ItemStatus[];
  requiredTotal: number;
  requiredDone: number;
  satisfied: boolean;
  openRequired: string[]; // keys of unsatisfied required items
}

export function itemDone(
  item: ChecklistItem,
  progress: StageProgress | undefined,
  derived: Record<string, boolean>,
): boolean {
  if (item.derived) return !!derived[item.key];
  return !!progress?.items?.[item.key]?.done;
}

export function gateStatus(
  stage: SaleStage,
  progress: StageProgress | undefined,
  derived: Record<string, boolean> = {},
): GateStatus {
  const def = STAGES[stage];
  const items: ItemStatus[] = def.items.map(it => ({
    ...it,
    done: itemDone(it, progress, derived),
    note: progress?.items?.[it.key]?.note,
  }));
  const required = items.filter(i => i.required);
  const openRequired = required.filter(i => !i.done).map(i => i.key);
  return {
    items,
    requiredTotal: required.length,
    requiredDone: required.length - openRequired.length,
    satisfied: openRequired.length === 0,
    openRequired,
  };
}

// ── Pure stage_progress mutations (return a new object; caller persists) ──────

export function setChecklistItem(
  progress: StageProgress | undefined,
  key: string,
  patch: { done?: boolean; note?: string; by?: string },
): StageProgress {
  const base: StageProgress = progress ? { ...progress } : {};
  const items = { ...(base.items || {}) };
  const prev = items[key] || { done: false };
  items[key] = {
    ...prev,
    ...(patch.done !== undefined ? { done: patch.done } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(patch.done ? { done_at: new Date().toISOString(), done_by: patch.by } : {}),
  };
  return { ...base, items };
}

export function addOverride(
  progress: StageProgress | undefined,
  override: StageOverride,
): StageProgress {
  const base: StageProgress = progress ? { ...progress } : {};
  return { ...base, overrides: [...(base.overrides || []), override] };
}
