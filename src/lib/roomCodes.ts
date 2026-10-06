// src/lib/roomCodes.ts
// Room types and location codes for estate-sale room capture. The codes match
// the flip-chart pages exactly (BESL Flip Chart.pptx): a two-letter room type,
// a two-digit room number (every room is numbered, even when a house has only
// one: LR01, KT01), then a dash and the location 1-20: BD02-5.
// See docs/room-capture-spec.md, Room codes, locations and flip charts.

export interface RoomType {
  code: string;
  name: string;
  area: string;
}

export const ROOM_TYPES: RoomType[] = [
  { code: 'EN', name: 'Entrance', area: 'Entry and living' },
  { code: 'HL', name: 'Hall', area: 'Entry and living' },
  { code: 'MD', name: 'Mudroom', area: 'Entry and living' },
  { code: 'FR', name: 'Family room', area: 'Entry and living' },
  { code: 'LR', name: 'Living room', area: 'Entry and living' },
  { code: 'BL', name: 'Ballroom', area: 'Entry and living' },
  { code: 'BN', name: 'Bonus / play room', area: 'Entry and living' },
  { code: 'MR', name: 'Music room', area: 'Entry and living' },
  { code: 'DW', name: 'Drawing room / parlor', area: 'Entry and living' },
  { code: 'LB', name: 'Library', area: 'Entry and living' },
  { code: 'SR', name: 'Sunroom', area: 'Entry and living' },
  { code: 'OF', name: 'Office', area: 'Work' },
  { code: 'WS', name: 'Workshop', area: 'Work' },
  { code: 'DR', name: 'Dining room', area: 'Dining and kitchen' },
  { code: 'BK', name: 'Breakfast room', area: 'Dining and kitchen' },
  { code: 'KT', name: 'Kitchen', area: 'Dining and kitchen' },
  { code: 'PN', name: 'Pantry', area: 'Dining and kitchen' },
  { code: 'LA', name: 'Laundry', area: 'Dining and kitchen' },
  { code: 'BD', name: 'Bedroom', area: 'Bedrooms' },
  { code: 'BA', name: 'Bathroom', area: 'Baths' },
  { code: 'HB', name: 'Half bathroom', area: 'Baths' },
  { code: 'GB', name: 'Guest bathroom', area: 'Baths' },
  { code: 'CB', name: 'Cabana / pool bathroom', area: 'Baths' },
  { code: 'BS', name: 'Basement', area: 'Up, down, out' },
  { code: 'AT', name: 'Attic', area: 'Up, down, out' },
  { code: 'GA', name: 'Garage', area: 'Up, down, out' },
  { code: 'OB', name: 'Outbuilding', area: 'Up, down, out' },
  { code: 'FP', name: 'Front porch', area: 'Outdoors' },
  { code: 'SP', name: 'Screen porch', area: 'Outdoors' },
  { code: 'PA', name: 'Patio', area: 'Outdoors' },
  { code: 'DK', name: 'Deck', area: 'Outdoors' },
  { code: 'BC', name: 'Balcony', area: 'Outdoors' },
  { code: 'YD', name: 'Yard / grounds', area: 'Outdoors' },
  { code: 'XX', name: 'Miscellaneous', area: 'Other' },
];

export const MAX_ROOMS_PER_TYPE = 9;
export const MAX_LOCATION = 20;

const ROOM_CODE_RE = /^([A-Z]{2})(\d{2})$/;
const ZONE_RE = /^([A-Z]{2}\d{2})-(\d{1,2})$/;

export function roomType(code: string): RoomType | undefined {
  return ROOM_TYPES.find((t) => t.code === code.slice(0, 2).toUpperCase());
}

export function isRoomCode(code: string | null | undefined): boolean {
  return !!code && ROOM_CODE_RE.test(code);
}

/** The next free room number for a type in this sale: BD01, BD02, ... (null when 01-09 are taken). */
export function nextRoomCode(type: string, existing: string[]): string | null {
  const t = type.toUpperCase();
  const used = new Set(existing.filter((c) => c.startsWith(t)));
  for (let n = 1; n <= MAX_ROOMS_PER_TYPE; n++) {
    const code = `${t}${String(n).padStart(2, '0')}`;
    if (!used.has(code)) return code;
  }
  return null;
}

/** Default name for a new room: the type name, numbered when the house has more than one. */
export function defaultRoomName(code: string, existing: string[]): string {
  const t = roomType(code);
  const base = t?.name ?? code;
  const sameType = existing.filter((c) => c.slice(0, 2) === code.slice(0, 2)).length;
  return sameType > 0 || code.slice(2) !== '01' ? `${base} ${Number(code.slice(2))}` : base;
}

/** "BD02" + 5 -> "BD02-5". */
export function formatZone(room: string, location: number | null | undefined): string | null {
  if (!isRoomCode(room) || !location || location < 1) return null;
  return `${room}-${Math.min(Math.round(location), MAX_LOCATION)}`;
}

/** "BD02-5" -> { room: "BD02", location: 5 }; anything else -> null. */
export function parseZone(zone: string | null | undefined): { room: string; location: number } | null {
  const m = zone?.trim().toUpperCase().match(ZONE_RE);
  return m ? { room: m[1], location: Number(m[2]) } : null;
}

/**
 * Sort lots in walking order: the sale room list order, then location (from
 * the doorway, left to right), then lot number. Lots with no room go last.
 */
export function compareByLocation(
  roomOrder: string[],
): (a: LocatedLot, b: LocatedLot) => number {
  const rank = new Map(roomOrder.map((c, i) => [c, i]));
  const roomRank = (r: string | null | undefined) =>
    r ? rank.get(r) ?? roomOrder.length + (r.charCodeAt(0) * 100 + r.charCodeAt(1)) / 10_000 : Number.MAX_SAFE_INTEGER;
  return (a, b) => {
    const ra = roomRank(a.room ?? parseZone(a.zone)?.room);
    const rb = roomRank(b.room ?? parseZone(b.zone)?.room);
    if (ra !== rb) return ra - rb;
    const la = parseZone(a.zone)?.location ?? MAX_LOCATION + 1;
    const lb = parseZone(b.zone)?.location ?? MAX_LOCATION + 1;
    if (la !== lb) return la - lb;
    return (Number(a.lot_number) || 0) - (Number(b.lot_number) || 0);
  };
}

export interface LocatedLot {
  room?: string | null;
  zone?: string | null;
  lot_number?: number | string | null;
}

/** What a lot shows for where it is: the full location, else the room, else nothing. */
export function lotLocationLabel(lot: { room?: string | null; zone?: string | null }): string {
  return lot.zone || lot.room || '';
}
