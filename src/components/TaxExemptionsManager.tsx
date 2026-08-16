// src/components/TaxExemptionsManager.tsx
// Every resale certificate on file, across all of the signed-in user's companies —
// the same dealer buys from Benson Auction Services and Benson Estate Sales, so a
// permit handed to one side is on file for both. Sorted so the ones about to lapse
// are the first thing you see.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus, Pencil, Search, BadgeCheck, AlertTriangle, ExternalLink, Building2 } from 'lucide-react';
import type { TaxExemption } from '../types';
import { useApp } from '../context/AppContext';
import { listExemptions, certificateUrl, daysUntilExpiry, isExpired } from '../services/TaxExemptionService';
import TaxExemptionModal from './TaxExemptionModal';

interface Props {
  /** Company a newly-added certificate is filed under (the active one). */
  companyId?: string;
  onClose: () => void;
  onChanged?: () => void;
}

const EXPIRING_SOON_DAYS = 60;

export default function TaxExemptionsManager({ companyId, onClose, onChanged }: Props) {
  const { companies } = useApp();
  const [rows, setRows] = useState<TaxExemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TaxExemption | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listExemptions()
      .then(setRows)
      .catch((e) => console.error('Failed to load certificates:', e))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const companyName = (id?: string) =>
    (companies || []).find((c: { id: string; name: string }) => c.id === id)?.name;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          [r.buyer_name, r.buyer_key, r.business_name, r.permit_number, r.state]
            .some((v) => v?.toLowerCase().includes(q)))
      : rows;
    // Expired first, then soonest to lapse, then evergreen.
    return [...filtered].sort((a, b) => {
      const da = daysUntilExpiry(a);
      const db = daysUntilExpiry(b);
      if (da === null && db === null) return (a.buyer_name || '').localeCompare(b.buyer_name || '');
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }, [rows, search]);

  const expiredCount = rows.filter((r) => isExpired(r)).length;
  const soonCount = rows.filter((r) => {
    const d = daysUntilExpiry(r);
    return d !== null && d >= 0 && d <= EXPIRING_SOON_DAYS;
  }).length;

  const afterSave = () => {
    setEditing(null);
    setAdding(false);
    load();
    onChanged?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Resale certificates</h3>
            <p className="text-xs text-gray-500">
              {rows.length} on file across your companies
              {expiredCount > 0 && <span className="text-red-600"> · {expiredCount} expired</span>}
              {soonCount > 0 && <span className="text-amber-600"> · {soonCount} expiring soon</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5">
          {rows.length > 0 && (
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by buyer, business, permit or state…"
                className="w-full border border-gray-300 rounded-md p-2 pl-8 text-sm"
              />
            </div>
          )}

          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <BadgeCheck className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">
                {rows.length === 0
                  ? 'No resale certificates on file yet.'
                  : 'Nothing matches that search.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {visible.map((r) => (
                <Row
                  key={r.id}
                  ex={r}
                  companyName={companyName(r.company_id)}
                  onEdit={() => setEditing(r)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {(editing || adding) && (
        <TaxExemptionModal
          companyId={editing?.company_id ?? companyId}
          buyerKey={editing?.buyer_key ?? ''}
          buyerName={editing?.buyer_name ?? ''}
          existing={editing ?? undefined}
          allowBuyerEdit
          onSaved={afterSave}
          onClose={() => { setEditing(null); setAdding(false); }}
        />
      )}
    </div>
  );
}

function Row({ ex, companyName, onEdit }: {
  ex: TaxExemption; companyName?: string; onEdit: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const days = daysUntilExpiry(ex);
  const expired = isExpired(ex);
  const soon = days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS;

  const view = async () => {
    if (!ex.image_path) return;
    const signed = url ?? (await certificateUrl(ex.image_path));
    setUrl(signed);
    if (signed) window.open(signed, '_blank', 'noopener');
  };

  return (
    <li className="py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900">{ex.buyer_name || ex.buyer_key}</span>
          {expired ? (
            <Badge tone="red"><AlertTriangle className="w-3 h-3" /> Expired</Badge>
          ) : soon ? (
            <Badge tone="amber">Expires in {days}d</Badge>
          ) : (
            <Badge tone="green"><BadgeCheck className="w-3 h-3" /> Valid</Badge>
          )}
        </div>
        <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 mt-0.5">
          {ex.business_name && <span>{ex.business_name}</span>}
          <span>{[ex.state, ex.permit_number && `#${ex.permit_number}`].filter(Boolean).join(' ') || 'no permit #'}</span>
          {ex.expires_on && <span>{expired ? 'expired' : 'expires'} {ex.expires_on}</span>}
          {!ex.expires_on && <span className="text-gray-400">no expiry</span>}
        </div>
        <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 mt-0.5">
          <span>{ex.buyer_key}</span>
          {companyName && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {companyName}
            </span>
          )}
          {!ex.image_path && <span className="text-amber-600">no image on file</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {ex.image_path && (
          <button onClick={view} className="p-1.5 text-gray-500 hover:text-blue-600" title="View certificate">
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
        <button onClick={onEdit} className="p-1.5 text-gray-500 hover:text-blue-600" title="Edit">
          <Pencil className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tones[tone]}`}>
      {children}
    </span>
  );
}
