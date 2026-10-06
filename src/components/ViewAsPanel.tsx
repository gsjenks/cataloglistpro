// src/components/ViewAsPanel.tsx
// Settings > Profile: preview the app as another role. Staff roles switch the
// whole app in place; Buyer opens a sale's public page, which is exactly what a
// shopper sees (no sign-in). Shipper has no screens of its own yet.

import { useEffect, useState } from 'react';
import { Eye, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { useRole } from '../context/RoleContext';
import { ROLE_LABELS, canViewAs, viewAsChoices, type StaffRole } from '../lib/roles';

const ROLE_HINTS: Record<StaffRole, string> = {
  owner: 'Everything, including deleting the business.',
  admin: 'Everything except deleting the business. Manages the team.',
  manager: 'Runs sales: setup, stages, register, refunds, money, deletes.',
  staff: 'Floor work: items, photos, tags, holds, baskets, lookup. No register, money, refunds, deletes, setup or stages.',
};

export default function ViewAsPanel() {
  const { currentCompany } = useApp();
  const { actualRole, role, setViewAs } = useRole();
  const [sales, setSales] = useState<{ id: string; name: string }[]>([]);

  const allowed = canViewAs(actualRole);

  useEffect(() => {
    if (!allowed || !currentCompany) return;
    supabase
      .from('sales')
      .select('id, name')
      .eq('company_id', currentCompany.id)
      .in('status', ['upcoming', 'active'])
      .order('start_date', { ascending: true })
      .then(({ data }) => setSales(data ?? []));
  }, [allowed, currentCompany]);

  if (!allowed) return null;

  return (
    <div className="pt-4 border-t border-gray-100">
      <h4 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Eye className="w-4 h-4" /> View as
      </h4>
      <p className="text-xs text-gray-500 mb-3">
        See the app the way another role sees it. This only changes what you see; your account keeps its {ROLE_LABELS[actualRole]} access.
      </p>

      <div className="space-y-2">
        {viewAsChoices(actualRole).slice().reverse().map((r) => (
          <label
            key={r}
            className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer ${
              role === r ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="view-as"
              checked={role === r}
              onChange={() => setViewAs(r)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">
                {ROLE_LABELS[r]}{r === actualRole ? ' (you)' : ''}
              </span>
              <span className="block text-xs text-gray-500">{ROLE_HINTS[r]}</span>
            </span>
          </label>
        ))}

        <div className="p-2.5 rounded-md border border-gray-200">
          <span className="block text-sm font-medium text-gray-900">Buyer</span>
          <span className="block text-xs text-gray-500 mb-2">
            Opens the sale page a shopper sees from a tag or link, in a new tab.
          </span>
          {sales.length === 0 ? (
            <span className="text-xs text-gray-400">No upcoming or active sales.</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sales.map((s) => (
                <a
                  key={s.id}
                  href={`/view/sales/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-300 text-indigo-700 hover:bg-indigo-50"
                >
                  {s.name} <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="p-2.5 rounded-md border border-dashed border-gray-200 opacity-60">
          <span className="block text-sm font-medium text-gray-900">Shipper</span>
          <span className="block text-xs text-gray-500">
            Not available yet: shippers have no screens of their own, only the printed manifest.
          </span>
        </div>
      </div>
    </div>
  );
}
