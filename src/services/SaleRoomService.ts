// src/services/SaleRoomService.ts
// A sale's room list (sale_rooms): built once from the catalog in
// src/lib/roomCodes.ts and reused by capture, lot locations, tags and filters.
// Online only, like the rest of the sale setup.

import { supabase } from '../lib/supabase';
import { defaultRoomName, isRoomCode, nextRoomCode } from '../lib/roomCodes';
import type { SaleRoom } from '../types';

export async function listSaleRooms(saleId: string): Promise<SaleRoom[]> {
  const { data, error } = await supabase
    .from('sale_rooms')
    .select('*')
    .eq('sale_id', saleId)
    .order('sort_order', { ascending: true })
    .order('room_code', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as SaleRoom[]) ?? [];
}

/** Adds the next room of a type (BD01, then BD02, ...). */
export async function addSaleRoom(saleId: string, type: string, rooms: SaleRoom[], name?: string): Promise<SaleRoom> {
  const codes = rooms.map((r) => r.room_code);
  const code = nextRoomCode(type, codes);
  if (!code) throw new Error(`This sale already has nine rooms of that type.`);
  const sortOrder = rooms.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
  const { data, error } = await supabase
    .from('sale_rooms')
    .insert({ sale_id: saleId, room_code: code, name: name?.trim() || defaultRoomName(code, codes), sort_order: sortOrder })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as SaleRoom;
}

/** Makes sure a specific room code exists (used by room capture import). */
export async function ensureSaleRoom(saleId: string, code: string, name?: string | null): Promise<void> {
  if (!isRoomCode(code)) return;
  const rooms = await listSaleRooms(saleId);
  if (rooms.some((r) => r.room_code === code)) return;
  const sortOrder = rooms.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
  const { error } = await supabase.from('sale_rooms').upsert(
    {
      sale_id: saleId,
      room_code: code,
      name: name?.trim() || defaultRoomName(code, rooms.map((r) => r.room_code)),
      sort_order: sortOrder,
    },
    { onConflict: 'sale_id,room_code', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function renameSaleRoom(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('sale_rooms').update({ name: name.trim() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Saves the walking order of the rooms (index = sort_order). */
export async function reorderSaleRooms(rooms: SaleRoom[]): Promise<void> {
  const results = await Promise.all(
    rooms.map((r, i) => supabase.from('sale_rooms').update({ sort_order: i + 1 }).eq('id', r.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

export async function deleteSaleRoom(id: string): Promise<void> {
  const { error } = await supabase.from('sale_rooms').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
