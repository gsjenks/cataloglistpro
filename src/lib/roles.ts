// src/lib/roles.ts
// Staff roles and what each may do. One table, so every screen asks the same
// question (can(role, 'refund')) instead of comparing role names inline.
//
//   owner    created the business; everything, including deleting it
//   admin    everything except deleting the business; manages the team
//   manager  runs sales: setup, stages, register, refunds, money, deletes
//   staff    works the floor: find and edit lots, lot status, holds, baskets,
//            photos, tags, lookup. No sale-level information or money.
//
// 'member' is the old name for staff and still appears on older rows.
// The database enforces the same limits for real accounts
// (supabase/migrations/20261007000001_role_enforcement.sql). "View as" only
// changes the screens: the database still sees the account's real role.

export type StaffRole = 'owner' | 'admin' | 'manager' | 'staff';

export type Permission =
  | 'money'      // Payments, Reconciliation, payouts, invoices, money reports
  | 'register'   // run the cashier counter (record sales)
  | 'refund'     // refund a sold item
  | 'delete'     // delete sales and lots
  | 'saleInfo'   // see and manage sale-level information: create/edit sales, Setup,
                 // Contacts, Documents, Unsold, Reports & Tools, stages banner, rooms
  | 'stages'     // advance a sale through stages, or override the checklist
  | 'team'       // invite, remove and change roles of team members
  | 'business';  // delete the business

const ALL: Permission[] = ['money', 'register', 'refund', 'delete', 'saleInfo', 'stages', 'team', 'business'];

const GRANTS: Record<StaffRole, Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== 'business'),
  manager: ['money', 'register', 'refund', 'delete', 'saleInfo', 'stages'],
  staff: [],
};

const RANK: Record<StaffRole, number> = { owner: 3, admin: 2, manager: 1, staff: 0 };

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

export function normalizeRole(role: string | null | undefined): StaffRole {
  return role === 'owner' || role === 'admin' || role === 'manager' ? role : 'staff';
}

export function can(role: StaffRole, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

/** Only admins and managers (and the owner) may preview the app as another role. */
export function canViewAs(role: StaffRole): boolean {
  return RANK[role] >= RANK.manager;
}

/** The roles a user may preview: their own and everything below it. */
export function viewAsChoices(role: StaffRole): StaffRole[] {
  return (Object.keys(RANK) as StaffRole[]).filter((r) => RANK[r] <= RANK[role]);
}
