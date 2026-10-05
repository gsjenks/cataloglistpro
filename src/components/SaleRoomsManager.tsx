// src/components/SaleRoomsManager.tsx
// Build and edit a sale's room list: add rooms from the flip-chart catalog
// (numbered automatically: BD01, BD02, ...), rename them, put them in walking
// order, and remove rooms that hold no lots. See src/lib/roomCodes.ts.

import { useMemo, useState } from 'react';
import { X, Plus, ArrowUp, ArrowDown, Trash2, DoorOpen } from 'lucide-react';
import { ROOM_TYPES, nextRoomCode } from '../lib/roomCodes';
import {
  addSaleRoom,
  deleteSaleRoom,
  renameSaleRoom,
  reorderSaleRooms,
} from '../services/SaleRoomService';
import type { SaleRoom } from '../types';

interface Props {
  saleId: string;
  rooms: SaleRoom[];
  /** Lots per room code, so rooms in use cannot be removed. */
  lotCounts: Record<string, number>;
  onChanged: (rooms: SaleRoom[]) => void;
  onClose: () => void;
}

const AREAS = [...new Set(ROOM_TYPES.map((t) => t.area))];

export default function SaleRoomsManager({ saleId, rooms, lotCounts, onChanged, onClose }: Props) {
  const [type, setType] = useState('LR');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(rooms.map((r) => [r.id, r.name])),
  );

  const codes = useMemo(() => rooms.map((r) => r.room_code), [rooms]);
  const nextCode = nextRoomCode(type, codes);

  const run = async (fn: () => Promise<SaleRoom[]>) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      if (type === 'XX' && !newName.trim()) throw new Error('Name the miscellaneous room (e.g. "Back hall closet").');
      const room = await addSaleRoom(saleId, type, rooms, newName);
      setNames((n) => ({ ...n, [room.id]: room.name }));
      setNewName('');
      return [...rooms, room];
    });

  const rename = (room: SaleRoom) => {
    const name = (names[room.id] ?? '').trim();
    if (!name || name === room.name) {
      setNames((n) => ({ ...n, [room.id]: room.name }));
      return;
    }
    void run(async () => {
      await renameSaleRoom(room.id, name);
      return rooms.map((r) => (r.id === room.id ? { ...r, name } : r));
    });
  };

  const move = (index: number, delta: number) =>
    run(async () => {
      const next = [...rooms];
      const [r] = next.splice(index, 1);
      next.splice(index + delta, 0, r);
      await reorderSaleRooms(next);
      return next.map((x, i) => ({ ...x, sort_order: i + 1 }));
    });

  const remove = (room: SaleRoom) =>
    run(async () => {
      if (!window.confirm(`Remove ${room.room_code} ${room.name} from this sale?`)) return rooms;
      await deleteSaleRoom(room.id);
      return rooms.filter((r) => r.id !== room.id);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 cursor-pointer" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col cursor-default" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-indigo-600" /> Rooms in this sale
          </h2>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-auto">
          <p className="text-xs text-gray-500">
            Codes match the flip charts. List the rooms in the order you walk the house; tags
            and the Items list follow this order. Locations inside a room count from the
            doorway, then left to right.
          </p>

          {rooms.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No rooms yet. Add the first one below.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
              {rooms.map((room, i) => {
                const count = lotCounts[room.room_code] ?? 0;
                return (
                  <li key={room.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 shrink-0">
                      {room.room_code}
                    </span>
                    <input
                      value={names[room.id] ?? room.name}
                      onChange={(e) => setNames((n) => ({ ...n, [room.id]: e.target.value }))}
                      onBlur={() => rename(room)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      disabled={busy}
                      className="flex-1 min-w-0 px-2 py-1 text-sm border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded"
                      aria-label={`Name for ${room.room_code}`}
                    />
                    <span className="text-xs text-gray-500 shrink-0 w-14 text-right">
                      {count} item{count === 1 ? '' : 's'}
                    </span>
                    <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30" aria-label="Move up">
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={busy || i === rooms.length - 1} className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30" aria-label="Move down">
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(room)}
                      disabled={busy || count > 0}
                      className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                      aria-label="Remove room"
                      title={count > 0 ? 'Move its items to another room first' : 'Remove room'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-gray-200 pt-4 space-y-2">
            <p className="text-sm font-medium text-gray-700">Add a room</p>
            <div className="flex gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={busy}
                className="flex-1 min-w-0 px-2 py-2 border border-gray-300 rounded-md text-sm"
              >
                {AREAS.map((area) => (
                  <optgroup key={area} label={area}>
                    {ROOM_TYPES.filter((t) => t.area === area).map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.code} — {t.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                onClick={add}
                disabled={busy || !nextCode}
                className="inline-flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300"
              >
                <Plus className="w-4 h-4" /> {nextCode ?? 'Full'}
              </button>
            </div>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={busy}
              placeholder={type === 'XX' ? 'Name (required), e.g. Back hall closet' : 'Name (optional), e.g. Gathering room'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>}
        </div>
      </div>
    </div>
  );
}
