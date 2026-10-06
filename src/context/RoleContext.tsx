// src/context/RoleContext.tsx
// The signed-in user's role in the current company, and the "View as" preview
// that lets an owner, admin or manager see the app as a lower role.
//
//   actualRole  what the account really is (company owner, else user_companies)
//   role        what the screens obey: the preview role while one is set
//
// The preview is per tab session (sessionStorage), so it never outlives the
// visit, and it can only go down from the actual role, never up.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from './AppContext';
import { can as roleCan, canViewAs, normalizeRole, viewAsChoices, type Permission, type StaffRole } from '../lib/roles';

interface RoleContextType {
  actualRole: StaffRole;
  role: StaffRole;
  viewAs: StaffRole | null;
  setViewAs: (role: StaffRole | null) => void;
  can: (permission: Permission) => boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

const VIEW_AS_KEY = 'viewAsRole';

function readStored(key: string, storage: () => Storage): string | null {
  try { return storage().getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string | null, storage: () => Storage) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch { /* storage unavailable: the role still works for this page */ }
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { user, currentCompany } = useApp();
  const isCompanyOwner = !!user && !!currentCompany && currentCompany.user_id === user.id;
  const cacheKey = user && currentCompany ? `role:${user.id}:${currentCompany.id}` : null;

  // Last known role, so the right screens show offline and on first paint.
  const [memberRole, setMemberRole] = useState<StaffRole>(() =>
    normalizeRole(cacheKey ? readStored(cacheKey, () => localStorage) : null),
  );
  const [viewAs, setViewAsState] = useState<StaffRole | null>(() => {
    const stored = readStored(VIEW_AS_KEY, () => sessionStorage);
    return stored ? normalizeRole(stored) : null;
  });

  useEffect(() => {
    if (!user || !currentCompany || isCompanyOwner || !cacheKey) return;
    setMemberRole(normalizeRole(readStored(cacheKey, () => localStorage)));
    let live = true;
    supabase
      .from('user_companies')
      .select('role')
      .eq('company_id', currentCompany.id)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live || error) return;
        const r = normalizeRole((data as { role?: string } | null)?.role);
        setMemberRole(r);
        writeStored(cacheKey, r, () => localStorage);
      });
    return () => { live = false; };
  }, [user, currentCompany, isCompanyOwner, cacheKey]);

  const actualRole: StaffRole = isCompanyOwner ? 'owner' : memberRole;
  // A preview above the actual role (or by someone not allowed to preview) is ignored.
  const effectiveViewAs = viewAs && canViewAs(actualRole) && viewAsChoices(actualRole).includes(viewAs) && viewAs !== actualRole
    ? viewAs
    : null;
  const role = effectiveViewAs ?? actualRole;

  const value = useMemo<RoleContextType>(() => ({
    actualRole,
    role,
    viewAs: effectiveViewAs,
    setViewAs: (r) => {
      const next = r && r !== actualRole ? r : null;
      setViewAsState(next);
      writeStored(VIEW_AS_KEY, next, () => sessionStorage);
    },
    can: (p) => roleCan(role, p),
  }), [actualRole, role, effectiveViewAs]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) throw new Error('useRole must be used within a RoleProvider');
  return context;
}
