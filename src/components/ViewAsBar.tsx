// src/components/ViewAsBar.tsx
// Shown while an owner/admin/manager is previewing the app as a lower role, so
// a preview is never mistaken for the real thing and is one tap from undoing.

import { Eye } from 'lucide-react';
import { useRole } from '../context/RoleContext';
import { ROLE_LABELS } from '../lib/roles';

export default function ViewAsBar() {
  const { viewAs, actualRole, setViewAs } = useRole();
  if (!viewAs) return null;

  return (
    <div className="bg-amber-100 border-b border-amber-300 text-amber-900">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">
            Viewing as <strong>{ROLE_LABELS[viewAs]}</strong>
          </span>
        </span>
        <button
          onClick={() => setViewAs(null)}
          className="flex-shrink-0 px-3 py-1 rounded-md bg-amber-600 text-white font-medium hover:bg-amber-700"
        >
          Back to {ROLE_LABELS[actualRole]}
        </button>
      </div>
    </div>
  );
}
