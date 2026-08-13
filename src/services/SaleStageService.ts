// src/services/SaleStageService.ts
// Persistence for the sale STAGE pipeline (#2): update sales.stage and the
// stage_progress checklist, plus stage advancement with override. Pure gate logic
// lives in src/lib/auctionStages.ts. See docs/auction-lifecycle-spec.md.

import { supabase } from '../lib/supabase';
import type { SaleStage, StageProgress, StageOverride } from '../types';
import { nextStage, deriveStatus, setChecklistItem, addOverride } from '../lib/auctionStages';

async function updateSale(saleId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('sales').update(patch).eq('id', saleId);
  if (error) throw error;
}

// Toggle / annotate a manual checklist item and persist stage_progress. Returns
// the new progress so the caller can update local state without a refetch.
export async function setSaleChecklistItem(
  saleId: string,
  progress: StageProgress | undefined,
  key: string,
  patch: { done?: boolean; note?: string; by?: string },
): Promise<StageProgress> {
  const next = setChecklistItem(progress, key, patch);
  await updateSale(saleId, { stage_progress: next });
  return next;
}

// Advance to the next stage. When the gate is not satisfied an override reason is
// required and recorded. Keeps sales.status in sync (spec §1). Returns null when
// already at the final stage.
export async function advanceStage(
  saleId: string,
  current: SaleStage,
  progress: StageProgress | undefined,
  override?: { by?: string; reason: string },
): Promise<{ stage: SaleStage; progress: StageProgress } | null> {
  const target = nextStage(current);
  if (!target) return null;

  let nextProgress: StageProgress = progress || {};
  if (override) {
    const ov: StageOverride = {
      stage: current,
      at: new Date().toISOString(),
      by: override.by,
      reason: override.reason,
    };
    nextProgress = addOverride(progress, ov);
  }

  await updateSale(saleId, {
    stage: target,
    status: deriveStatus(target),
    stage_progress: nextProgress,
  });
  return { stage: target, progress: nextProgress };
}
