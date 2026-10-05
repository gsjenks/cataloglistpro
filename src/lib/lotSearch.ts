// src/lib/lotSearch.ts
// Shared fuzzy lot-search used by the basket tool and the register. The search
// box is tokenized on whitespace and the tokens are AND-ed: every token must
// match somewhere (name/description, or lot_number for a numeric token), so
// "blue sofa" finds "Blue Sleeper Sofa" regardless of word order or the words
// being non-adjacent. A plain substring match (name ilike %blue sofa%) would
// miss it — hence the tokenization.

// Split a raw search value into sanitized tokens. Characters that are special
// to PostgREST's or() grammar (and the ilike wildcard) are stripped so a stray
// paren/comma can't break the query. Returns [] when there's nothing to search.
export function searchTokens(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[%,()*]/g, ' ').trim())
    .filter(Boolean);
}

// Build the per-token or() clause (name/description ilike, plus lot_number.eq
// for a numeric token) for a PostgREST .or() call.
export function tokenOrClause(token: string): string {
  const like = `%${token}%`;
  // zone covers "BD02-5" and, as a prefix, the room "BD02" (needs the
  // 20261006000000_room_locations migration; room alone is matched via zone or room).
  const ors = [`name.ilike.${like}`, `description.ilike.${like}`, `zone.ilike.${like}`, `room.ilike.${like}`];
  if (/^\d+$/.test(token)) ors.push(`lot_number.eq.${token}`);
  return ors.join(',');
}

// In-memory equivalent of the DB search, for lists already loaded on the
// client (e.g. the Item Lookup tab). Every token must appear in the name,
// description, lot number, or room / location (BD02-5).
export function lotMatchesTokens(
  lot: {
    name?: string | null;
    description?: string | null;
    lot_number?: number | string | null;
    room?: string | null;
    zone?: string | null;
  },
  tokens: string[],
): boolean {
  const hay = `${lot.name ?? ''} ${lot.description ?? ''} ${lot.lot_number ?? ''} ${lot.zone ?? ''} ${lot.room ?? ''}`.toLowerCase();
  return tokens.every((t) => hay.includes(t.toLowerCase()));
}
