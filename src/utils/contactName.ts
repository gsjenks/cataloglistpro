// src/utils/contactName.ts
// Format a Contact into a display name: honorific + given/family parts, falling
// back to business name. Shared by the consignor UIs (#2).

import type { Contact } from '../types';

export function formatContactName(c: Contact | undefined): string {
  if (!c) return 'Unknown consignor';
  const parts = [c.prefix, c.first_name, c.middle_name, c.last_name, c.suffix].filter(Boolean);
  return parts.join(' ') || c.business_name || 'Unnamed contact';
}
