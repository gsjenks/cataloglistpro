// src/components/RoomCaptureVideoStep.tsx
// Film rooms and follow them through the server. Pick the room, record (or
// choose) one narrated clip per wall, tap Finish room and move on: each clip
// uploads in the background from this device (RoomCaptureQueue) and the
// room-capture edge function analyses it, so the next room can be filmed while
// the last one processes. Every room of the sale is listed below with its
// progress; a finished room opens in the review table (Review), where its photos
// are cut from the stored clips. The room is picked from the sale room list, so
// every lot created carries its room code (LR02).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Video, Upload, X, Loader2, CheckCircle2, AlertTriangle, RotateCcw, Plus, Flag, Trash2, ListChecks } from 'lucide-react';
import type { SaleRoom } from '../types';
import { listSaleRooms, addSaleRoom } from '../services/SaleRoomService';
import { ROOM_TYPES } from '../lib/roomCodes';
import type { CapturePackage } from '../services/RoomCaptureImportService';
import {
  addClips, cleanupJob, finishJob, hasDeviceCopy, kickJob, listClips, listJobs, openJobForRoom,
  pumpUploads, removeClip, retryClip, retryUpload, subscribeUploads, uploadProgress,
  type RoomCaptureClip, type RoomCaptureJob,
} from '../services/RoomCaptureQueue';
import { prepareJobPackage } from '../services/RoomCaptureVideoService';

interface Props {
  saleId: string;
  companyId: string;
  saleContext: string;
  onReview: (job: RoomCaptureJob, pkg: CapturePackage, images: Map<string, File>) => void;
}

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;
const AREAS = [...new Set(ROOM_TYPES.map((t) => t.area))];
const NEW_ROOM = '__new';

const JOB_LABEL: Record<RoomCaptureJob['status'], string> = {
  recording: 'Filming',
  processing: 'Processing',
  consolidating: 'Merging clips',
  ready: 'Ready to review',
  failed: 'Failed',
  imported: 'Imported',
};
const JOB_PILL: Record<RoomCaptureJob['status'], string> = {
  recording: 'bg-gray-100 text-gray-700',
  processing: 'bg-indigo-100 text-indigo-800',
  consolidating: 'bg-indigo-100 text-indigo-800',
  ready: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-700',
  imported: 'bg-gray-100 text-gray-500',
};

function clipLine(c: RoomCaptureClip): { text: string; busy: boolean } {
  if (c.status === 'uploading') {
    const p = uploadProgress(c.id);
    if (!p) return { text: 'Upload not finished (recorded on another device?)', busy: false };
    if (p.error) return { text: p.error, busy: false };
    const pct = p.total ? Math.floor((p.sent / p.total) * 100) : 0;
    return { text: p.active ? `Uploading ${pct}%` : pct ? `Upload paused at ${pct}%` : 'Waiting to upload', busy: p.active };
  }
  const items = c.result?.items?.length;
  switch (c.status) {
    case 'uploaded': return { text: 'Uploaded, queued', busy: true };
    case 'transferring': return { text: 'Sending to the AI', busy: true };
    case 'waiting': return { text: 'AI preparing the video', busy: true };
    case 'analyzing': return { text: 'Finding items', busy: true };
    case 'done': return { text: items != null ? `Done · ${items} items` : 'Done', busy: false };
    default: return { text: c.error || 'Failed', busy: false };
  }
}

export default function RoomCaptureVideoStep({ saleId, companyId, saleContext, onReview }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The sale's rooms; new clips belong to the one picked here.
  const [rooms, setRooms] = useState<SaleRoom[]>([]);
  const [roomId, setRoomId] = useState('');
  const [newType, setNewType] = useState(ROOM_TYPES[0].code);
  const [newName, setNewName] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);
  const selectedRoom = rooms.find((r) => r.id === roomId) ?? null;

  // Every room filmed for this sale, and their clips.
  const [jobs, setJobs] = useState<RoomCaptureJob[]>([]);
  const [clips, setClips] = useState<RoomCaptureClip[]>([]);
  const [adding, setAdding] = useState(false);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<{ jobId: string; fraction: number; label: string } | null>(null);
  const [, setTick] = useState(0);

  const openJob = selectedRoom ? jobs.find((j) => j.room_id === selectedRoom.id && j.status === 'recording') ?? null : null;
  const clipsOf = (jobId: string) => clips.filter((c) => c.job_id === jobId);

  useEffect(() => {
    listSaleRooms(saleId)
      .then((rs) => {
        setRooms(rs);
        if (rs.length === 1) setRoomId(rs[0].id);
      })
      .catch((e) => setError(`Could not load the sale rooms: ${e instanceof Error ? e.message : e}`));
  }, [saleId]);

  const refresh = useCallback(async () => {
    try {
      const js = await listJobs(saleId);
      const cs = await listClips(js.map((j) => j.id), true);
      setJobs(js);
      setClips(cs);
    } catch (e) {
      console.error('[ROOM CAPTURE] refresh:', e);
    }
  }, [saleId]);

  // Poll while open; nudge the server now and then so a broken step chain restarts.
  const jobsRef = useRef<RoomCaptureJob[]>([]);
  jobsRef.current = jobs;
  useEffect(() => {
    refresh();
    pumpUploads();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 5000);
    const kick = () =>
      jobsRef.current
        .filter((j) => j.status === 'recording' || j.status === 'processing' || j.status === 'consolidating')
        .forEach((j) => kickJob(j.id).catch((e) => console.error('[ROOM CAPTURE] kick:', e)));
    const firstKick = setTimeout(kick, 3000);
    const kicks = setInterval(kick, 60_000);
    const unsub = subscribeUploads(() => setTick((t) => t + 1));
    return () => {
      clearInterval(poll);
      clearTimeout(firstKick);
      clearInterval(kicks);
      unsub();
    };
  }, [refresh]);

  const addRoom = async () => {
    if (newType === 'XX' && !newName.trim()) { setError('Give the room a name.'); return; }
    setAddingRoom(true);
    setError(null);
    try {
      const created = await addSaleRoom(saleId, newType, rooms, newName);
      setRooms((rs) => [...rs, created]);
      setRoomId(created.id);
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the room.');
    } finally {
      setAddingRoom(false);
    }
  };

  const add = async (list: FileList | null) => {
    if (!list || !selectedRoom) return;
    const vids = Array.from(list).filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
    if (!vids.length) return;
    setError(null);
    setNotice(null);
    setAdding(true);
    try {
      const job = openJob ?? await openJobForRoom({
        companyId,
        saleId,
        roomId: selectedRoom.id,
        roomCode: selectedRoom.room_code,
        roomName: selectedRoom.name,
        saleContext,
      });
      await addClips(job, vids);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the clip.');
    } finally {
      setAdding(false);
    }
  };

  const finish = async (job: RoomCaptureJob) => {
    setBusyJob(job.id);
    setError(null);
    try {
      await finishJob(job.id);
      setNotice(`${job.room_code} ${job.room_name} is processing. You can film the next room now.`);
      if (openJob?.id === job.id) setRoomId('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish the room.');
    } finally {
      setBusyJob(null);
    }
  };

  const retry = async (c: RoomCaptureClip) => {
    setError(null);
    try {
      if (c.status === 'uploading' || (await hasDeviceCopy(c.id))) await retryUpload(c.id);
      else await retryClip(c.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retry the clip.');
    }
  };

  const drop = async (c: RoomCaptureClip) => {
    if (!window.confirm(`Remove ${c.file_name || 'this clip'}?`)) return;
    try {
      await removeClip(c);
      // The room may have been waiting only on this clip.
      kickJob(c.job_id).catch(() => undefined);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the clip.');
    }
  };

  const discard = async (job: RoomCaptureJob) => {
    if (!window.confirm(`Discard ${job.room_code} ${job.room_name}? Its videos and results are deleted; no lots are created.`)) return;
    setBusyJob(job.id);
    try {
      for (const c of clipsOf(job.id)) await removeClip(c).catch(() => undefined);
      await cleanupJob(job.id, true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not discard the room.');
    } finally {
      setBusyJob(null);
    }
  };

  const review = async (job: RoomCaptureJob) => {
    setError(null);
    setPreparing({ jobId: job.id, fraction: 0, label: 'Loading the room' });
    try {
      const cs = await listClips([job.id], true);
      const { pkg, images } = await prepareJobPackage(job, cs, (fraction, label) => setPreparing({ jobId: job.id, fraction, label }));
      onReview(job, pkg, images);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the room.');
    } finally {
      setPreparing(null);
    }
  };

  const openClips = openJob ? clipsOf(openJob.id) : [];
  const others = jobs.filter((j) => j.id !== openJob?.id);

  const renderClip = (c: RoomCaptureClip, i: number, canEdit: boolean) => {
    const { text, busy } = clipLine(c);
    const p = c.status === 'uploading' ? uploadProgress(c.id) : undefined;
    const failed = c.status === 'failed' || !!p?.error;
    return (
      <li key={c.id} className="p-2.5 flex items-start gap-3">
        <span className="mt-0.5 w-6 text-xs text-gray-400">#{i + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 truncate">{c.file_name || 'Clip'} <span className="text-xs text-gray-400">· {mb(c.size)}</span></p>
          <p className={`text-xs ${failed ? 'text-red-600' : 'text-gray-500'}`}>{text}</p>
          {c.result?.summary && <p className="text-xs text-gray-600 mt-0.5">{c.result.summary}</p>}
          {p?.active && (
            <div className="mt-1 h-1.5 bg-gray-100 rounded overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.round((p.sent / (p.total || 1)) * 100)}%` }} />
            </div>
          )}
        </div>
        <span className="mt-0.5 flex items-center gap-1">
          {busy && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
          {c.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
          {failed && (
            <>
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <button onClick={() => retry(c)} className="p-1 text-gray-500 hover:text-indigo-700" aria-label="Retry clip" title="Retry">
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          )}
          {canEdit && !p?.active && (
            <button onClick={() => drop(c)} className="p-1 text-gray-400 hover:text-gray-700" aria-label="Remove clip" title="Remove">
              <X className="w-4 h-4" />
            </button>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 overflow-auto">
      {/* ---- Film a room ---- */}
      <section className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Room you are filming</span>
          <select
            value={roomId}
            onChange={(e) => { setRoomId(e.target.value); setError(null); setNotice(null); }}
            className="mt-1 block w-full sm:w-80 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 bg-white"
          >
            <option value="">Choose the room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.room_code} — {r.name}</option>
            ))}
            <option value={NEW_ROOM}>+ Add a new room…</option>
          </select>
        </label>
        {roomId === NEW_ROOM && (
          <div className="w-full sm:w-80 space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-2.5">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              disabled={addingRoom}
              className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm bg-white"
            >
              {AREAS.map((area) => (
                <optgroup key={area} label={area}>
                  {ROOM_TYPES.filter((t) => t.area === area).map((t) => (
                    <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={addingRoom}
              placeholder={newType === 'XX' ? 'Name (required), e.g. Back hall closet' : 'Name (optional), e.g. Gathering room'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <button
              type="button"
              onClick={addRoom}
              disabled={addingRoom}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300"
            >
              <Plus className="w-4 h-4" /> {addingRoom ? 'Adding…' : 'Add room'}
            </button>
          </div>
        )}

        <div className="rounded-md bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-900 space-y-1">
          <p>One clip per wall or area, starting at the doorway and working left to right; then the centre of the room.</p>
          <p>Talk as you go: maker, material, condition, price, and anything that isn&apos;t for sale. Move slowly and pause on each piece.</p>
          <p>Clips upload in the background and are analysed on the server. Tap <b>Finish room</b> when the room is done, then film the next one. Keep the app open until the uploads finish.</p>
        </div>

        {selectedRoom && (
          <>
            <div className="flex flex-wrap gap-2">
              <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${adding ? 'bg-gray-200 text-gray-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'}`}>
                <Video className="w-4 h-4" /> Record clip
                <input type="file" accept="video/*" capture="environment" className="hidden" disabled={adding} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
              </label>
              <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border ${adding ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'}`}>
                <Upload className="w-4 h-4" /> Choose videos
                <input type="file" accept="video/*" multiple className="hidden" disabled={adding} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
              </label>
              {openJob && openClips.length > 0 && (
                <button
                  onClick={() => finish(openJob)}
                  disabled={busyJob === openJob.id}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300"
                >
                  <Flag className="w-4 h-4" /> Finish {selectedRoom.room_code}
                </button>
              )}
            </div>
            {adding && <p className="text-xs text-gray-500">Saving the clip…</p>}
            {openClips.length > 0 && (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                {openClips.map((c, i) => renderClip(c, i, true))}
              </ul>
            )}
          </>
        )}
      </section>

      {notice && <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{notice}</div>}
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* ---- Every room of the sale ---- */}
      {others.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><ListChecks className="w-4 h-4" /> Rooms</h4>
          <ul className="space-y-2">
            {others.map((j) => {
              const cs = clipsOf(j.id);
              const prep = preparing?.jobId === j.id ? preparing : null;
              const anyFailed = cs.some((c) => c.status === 'failed');
              return (
                <li key={j.id} className="border border-gray-200 rounded-md">
                  <div className="p-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{j.room_code} — {j.room_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${JOB_PILL[j.status]}`}>{JOB_LABEL[j.status]}</span>
                    <span className="text-xs text-gray-500">{cs.length} clip{cs.length === 1 ? '' : 's'}</span>
                    {(j.status === 'processing' || j.status === 'consolidating') && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                    <span className="flex-1" />
                    {j.status === 'recording' && cs.length > 0 && (
                      <button onClick={() => finish(j)} disabled={busyJob === j.id} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40">
                        <Flag className="w-4 h-4" /> Finish room
                      </button>
                    )}
                    {j.status === 'ready' && (
                      <button
                        onClick={() => review(j)}
                        disabled={!!preparing}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300"
                      >
                        {prep ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />} Review
                      </button>
                    )}
                    <button onClick={() => discard(j)} disabled={busyJob === j.id || !!prep} className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40" aria-label="Discard room" title="Discard room">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {prep && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-gray-600">{prep.label}… {Math.round(prep.fraction * 100)}%</p>
                      <div className="mt-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.round(prep.fraction * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  {j.error && <p className="px-3 pb-2 text-xs text-amber-700">{j.error}</p>}
                  {(j.status !== 'ready' || anyFailed) && cs.length > 0 && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-100">
                      {cs.map((c, i) => renderClip(c, i, j.status === 'recording' || c.status === 'failed'))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
