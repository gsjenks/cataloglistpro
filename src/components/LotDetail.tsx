// src/components/LotDetail.tsx
// OPTIMIZED: Split into smaller components, memoized handlers
// UPDATED: Added QR code generation on lot save

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { generateQRCodeForLot } from "../lib/qr";
import { useFooter, type FooterAction } from "../context/FooterContext";
import ConnectivityService from "../services/ConnectivityService";
import SyncService from "../services/SyncService";
import {
  getNextLotNumber,
  isTemporaryNumber,
} from "../services/LotNumberService";
import offlineStorage from "../services/Offlinestorage";
import CameraService from "../services/CameraService";
import {
  editWithPhotoRoom,
  type PhotoRoomEditOptions,
  type PhotoRoomEditResult,
} from "../services/PhotoRoomService";
import {
  getLACategories,
  getLAOrigins,
  getLAStyles,
  getLACreators,
  getLAMaterials,
} from "../services/LiveAuctioneersData";
import type { Lot, Photo, Consignment, Contact } from "../types";
import { listConsignments } from "../services/ConsignmentService";
import { toTitleCase } from "../utils/titleCase";
import { ArrowLeft, Save, Trash2, Upload, Camera, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useLotNeighbors, type WalkMode } from "../hooks/useLotNeighbors";
import { CROP_FILE_PREFIX } from "../services/RoomCaptureImportService";
import { deleteLotOnServer } from "../services/LotDeleteService";

// Split components
import WebcamModal from "./WebcamModal";
import PhotoPreviewModal from "./PhotoPreviewModal";
import LotPhotoSection from "./LotPhotoSection";
import LotForm from "./LotForm";
import LotQRCode from "./LotQRCode";
import PrintTagsModal from "./PrintTagsModal";

interface AIResearch {
  researched: boolean;
  basis: string;
  notes: string;
  sources: { title: string; uri: string }[];
}

// Re-encode a photo as a JPEG no larger than 1600px on its long side, as base64.
// Full-size phone photos made the request several MB each for no gain in accuracy.
async function toAIJpeg(blob: Blob): Promise<string> {
  const MAX = 1600;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  } catch {
    // Undecodable here (e.g. HEIC on some browsers): send the original bytes
    return new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onloadend = () => res((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    });
  }
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// The fields a cataloger edits, normalised, so moving to another lot can tell
// whether this one has unsaved changes.
const EDIT_FIELDS: (keyof Lot)[] = [
  "name", "description", "quantity", "condition", "category", "style", "origin",
  "creator", "materials", "estimate_low", "estimate_high", "starting_bid",
  "reserve_price", "buy_now_price", "height", "width", "depth", "weight",
  "dimension_unit", "consignment_id", "condition_report", "is_restricted",
  "restricted_category",
];
const editKey = (l: Partial<Lot>) =>
  JSON.stringify(
    EDIT_FIELDS.map((f) => {
      const v = l[f];
      if (f === "quantity") return Number(v) || 1;
      return v === null || v === undefined ? "" : v;
    }),
  );

// A room-capture crop (cut from a walkthrough video or room photo at import).
const isCaptureCrop = (p: Photo) => (p.file_name || "").startsWith(CROP_FILE_PREFIX);

const queueLotUpsert = async (lot: Lot, type: "create" | "update") => {
  // Writing to IndexedDB is not enough: pushLocalChanges drains `pendingSync`,
  // so a lot saved offline but never queued is invisible to sync and simply
  // never reaches Supabase. Keyed on the lot id (pendingSync uses id as its
  // keyPath) so repeated edits collapse into one queued upsert carrying the
  // latest full row — which is what the drain's upsert needs anyway.
  try {
    await offlineStorage.addPendingSyncItem({ id: lot.id, type, table: "lots", data: lot });
  } catch (e) {
    console.error("Could not queue lot for sync:", e);
  }
};

export default function LotDetail() {
  const { saleId, lotId } = useParams<{ saleId: string; lotId: string }>();
  const navigate = useNavigate();
  // ?walk=photos: Previous/Next only visit lots that still need photos.
  const [searchParams, setSearchParams] = useSearchParams();
  const walkMode: WalkMode = searchParams.get("walk") === "photos" ? "photos" : "all";
  // editKey of the lot as loaded or last saved; anything else is unsaved.
  const loadedKeyRef = useRef<string>("");
  const { setActions, clearActions } = useFooter();
  const [isOnline, setIsOnline] = useState(
    ConnectivityService.getConnectionStatus(),
  );
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [lot, setLot] = useState<Partial<Lot>>({
    name: "",
    description: "",
    quantity: 1,
    condition: "",
    category: "",
    style: "",
    origin: "",
    creator: "",
    materials: "",
    dimension_unit: "inches",
    consignor: "",
  });
  const lotRef = useRef(lot);

  // Keep ref in sync with state
  useEffect(() => {
    lotRef.current = lot;
  }, [lot]);
  // What the last AI run wrote, so a re-run can tell which fields the
  // cataloger has since corrected and weight those above the photos.
  const aiSnapshotRef = useRef<Partial<Lot> | null>(null);
  const [aiResearch, setAiResearch] = useState<AIResearch | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => {
    aiSnapshotRef.current = null;
    setAiResearch(null);
  }, [lotId]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  // Public URL per photo, used if the blob URL fails to render.
  const [photoFallbackUrls, setPhotoFallbackUrls] = useState<Record<string, string>>({});
  // Every blob URL this mount created, revoked once on unmount.
  const createdBlobUrls = useRef<Set<string>>(new Set());
  // loadPhotos can run concurrently (mount + the sync-complete listener). Only
  // the newest run may publish, or an older one lands last and restores URLs
  // that have already been revoked.
  const photoRunId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isNewLot = lotId === "new";

  // Photo editing state
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<
    {
      photoId: string;
      originalUrl: string;
      enhancedUrl: string;
      enhancedBlob: Blob;
    }[]
  >([]);
  const [editOptions, setEditOptions] = useState<PhotoRoomEditOptions>({
    removeBackground: false,
    backgroundColor: undefined,
    fillPercentage: 85,
    lightBalance: 0,
    addShadow: false,
  });

  // Connectivity monitoring
  useEffect(() => {
    const unsubscribe = ConnectivityService.onStatusChange(setIsOnline);
    return unsubscribe;
  }, []);

  // Load lot data
  useEffect(() => {
    if (isNewLot) initializeNewLot();
    else loadLot();
  }, [lotId, saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load consignors (#2) for the consignment picker: the sale's consignments plus
  // the contacts they resolve to.
  useEffect(() => {
    if (!saleId) return;
    (async () => {
      try {
        const [cons, { data: cts }] = await Promise.all([
          listConsignments(saleId),
          supabase.from("contacts").select("*").eq("sale_id", saleId),
        ]);
        setConsignments(cons);
        setContacts(cts || []);
      } catch (e) {
        console.error("Error loading consignors:", e);
      }
    })();
  }, [saleId]);

  // Load photos
  useEffect(() => {
    if (!isNewLot && lotId) loadPhotos();
  }, [lotId, isNewLot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Estate sales print Niimbot lot tags from here (auctions keep Avery sheets).
  const [isEstateSale, setIsEstateSale] = useState(false);
  const [showPrintTag, setShowPrintTag] = useState(false);
  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("sales").select("sale_type").eq("id", saleId).maybeSingle();
      const type = (data as { sale_type?: string } | null)?.sale_type
        ?? (await offlineStorage.getSale(saleId).catch(() => undefined))?.sale_type;
      if (!cancelled) setIsEstateSale(type === "estate_sale");
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  // Sync completion reload
  useEffect(() => {
    if (isNewLot || !lotId) return;
    let wasSyncing = false;
    const unsubscribe = SyncService.onSyncStatusChange((syncing: boolean) => {
      if (wasSyncing && !syncing) loadPhotos();
      wasSyncing = syncing;
    });
    return unsubscribe;
  }, [lotId, isNewLot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke blob URLs on unmount ONLY. This used to depend on [photoUrls], so
  // every reload of the photo list revoked the previous run's URLs — and with
  // loadPhotos running more than once, a slower run could publish URLs that had
  // already been revoked, leaving a permanently broken thumbnail even though
  // the file was fine in storage.
  useEffect(() => {
    const created = createdBlobUrls.current;
    return () => {
      created.forEach((url) => URL.revokeObjectURL(url));
      created.clear();
    };
  }, []);

  // Data loading functions
  const initializeNewLot = async () => {
    try {
      const lotNumber = await getNextLotNumber(saleId!, isOnline);
      setLot((prev) => ({ ...prev, lot_number: lotNumber, sale_id: saleId }));
    } catch (e) {
      console.error("Error initializing new lot:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadLot = async () => {
    if (!lotId) return;
    setLoading(true);
    try {
      if (isOnline) {
        const { data, error } = await supabase
          .from("lots")
          .select("*")
          .eq("id", lotId)
          .single();
        if (error) throw error;
        if (data) {
          setLot(data);
          loadedKeyRef.current = editKey(data);
          await offlineStorage.upsertLot(data);
        }
      } else {
        const offlineLot = await offlineStorage.getLot(lotId);
        if (offlineLot) {
          setLot(offlineLot);
          loadedKeyRef.current = editKey(offlineLot);
        }
      }
    } catch (e) {
      console.error("Error loading lot:", e);
      alert("Failed to load item");
    } finally {
      setLoading(false);
    }
  };

  const loadPhotos = async () => {
    if (!lotId) return;
    const run = ++photoRunId.current;
    console.log(`[PHOTO] LotDetail loadPhotos for lot ${lotId.slice(0, 8)}`);
    try {
      const urls: Record<string, string> = {};
      const fallbacks: Record<string, string> = {};
      let photoData: Photo[] = [];

      // Get local photo metadata
      const localPhotos = await offlineStorage.getPhotosByLot(lotId);
      console.log(`[PHOTO] Local photos found: ${localPhotos?.length || 0}`);

      if (localPhotos?.length) {
        photoData = localPhotos;
        // Try to get local blobs
        for (const photo of localPhotos) {
          const blob = await offlineStorage.getPhotoBlob(photo.id);
          if (blob && blob.size > 0 && blob.type.startsWith("image/")) {
            const url = URL.createObjectURL(blob);
            createdBlobUrls.current.add(url);
            urls[photo.id] = url;
          } else if (blob) {
            // Empty, or an error body cached as a photo. Drop it so the public
            // URL is used and the next sync can re-fetch.
            console.warn(`[PHOTO] Discarding bad local blob for ${photo.id} (${blob.size}b ${blob.type || 'unknown'})`);
            await offlineStorage.deletePhotoBlob(photo.id);
          }
        }
        console.log(`[PHOTO] Local blobs found: ${Object.keys(urls).length}`);
      }

      if (isOnline) {
        // Fetch remote photos to ensure we have all metadata
        const { data: remotePhotos, error } = await supabase
          .from("photos")
          .select("*")
          .eq("lot_id", lotId)
          .order("created_at", { ascending: true });

        console.log(
          `[PHOTO] Remote photos: ${remotePhotos?.length || 0}, error: ${error?.message || "none"}`,
        );

        if (error) throw error;

        // The server is the authority for photos this device has already
        // uploaded (synced === true): one deleted elsewhere goes here too, and the
        // primary flag follows the server. Unuploaded local photos are kept as-is.
        const remoteById = new Map((remotePhotos || []).map((r) => [r.id, r]));
        const kept: Photo[] = [];
        for (const p of photoData) {
          const remote = remoteById.get(p.id);
          if (p.synced === true && !remote) {
            await offlineStorage.deletePhoto(p.id).catch(() => undefined);
            if (urls[p.id]?.startsWith("blob:")) URL.revokeObjectURL(urls[p.id]);
            delete urls[p.id];
            continue;
          }
          if (p.synced === true && remote && remote.is_primary !== p.is_primary) {
            const updated = { ...p, is_primary: remote.is_primary };
            await offlineStorage.upsertPhoto(updated).catch(() => undefined);
            kept.push(updated);
            continue;
          }
          kept.push(p);
        }
        photoData = kept;

        if (remotePhotos?.length) {
          // Merge remote photos with local (in case any are missing locally)
          const localIds = new Set(photoData.map((p) => p.id));
          for (const remote of remotePhotos) {
            if (!localIds.has(remote.id)) {
              photoData.push(remote);
              // Cache metadata locally
              await offlineStorage.upsertPhoto({ ...remote, synced: true });
            }
          }

          // Public bucket — use public URLs (createSignedUrl 404s on it) for
          // any photo without a local blob.
          let publicUrlCount = 0;
          for (const photo of photoData) {
            const { data: urlData } = supabase.storage
              .from("photos")
              .getPublicUrl(photo.file_path);
            if (!urlData?.publicUrl) continue;
            // Always keep the public URL as a fallback, even when a blob URL
            // exists — the blob is a cache and can be stale, empty or revoked.
            fallbacks[photo.id] = urlData.publicUrl;
            if (!urls[photo.id]) {
              urls[photo.id] = urlData.publicUrl;
              publicUrlCount++;
            }
          }
          console.log(`[PHOTO] Public URLs generated: ${publicUrlCount}`);
        }
      }

      console.log(
        `[PHOTO] Final: ${photoData.length} photos, ${Object.keys(urls).length} URLs`,
      );
      if (run !== photoRunId.current) return; // superseded by a newer run
      // Photos deleted behind the Undo bar stay hidden until the delete commits.
      const pending = new Set(pendingDeletes.current.map((d) => d.id));
      setPhotos(pending.size ? photoData.filter((p) => !pending.has(p.id)) : photoData);
      setPhotoUrls(urls);
      setPhotoFallbackUrls(fallbacks);
    } catch (e) {
      console.error("Error loading photos:", e);
    }
  };

  // Photo handlers
  // A new real photo becomes primary when the lot has no real (non-crop) primary
  // yet; a room-capture crop then stays as an extra view. The first capture claims
  // primary synchronously, before it has saved, so a quick burst of captures
  // ("Save & Take More") can't each decide they are the first.
  const realPrimaryClaimed = useRef(false);
  useEffect(() => {
    realPrimaryClaimed.current = photos.some((p) => p.is_primary && !isCaptureCrop(p));
  }, [photos]);
  const takesOverPrimary = useCallback(() => {
    if (realPrimaryClaimed.current) return false;
    realPrimaryClaimed.current = true;
    return true;
  }, []);
  // Give the claim back when the capture that took it produced no photo.
  const releasePrimaryClaim = useCallback(() => {
    realPrimaryClaimed.current = photos.some((p) => p.is_primary && !isCaptureCrop(p));
  }, [photos]);

  const demoteCropPrimaries = useCallback(async () => {
    const crops = photos.filter((p) => p.is_primary && isCaptureCrop(p));
    if (crops.length === 0) return;
    const ids = new Set(crops.map((c) => c.id));
    setPhotos((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, is_primary: false } : p)));
    try {
      for (const c of crops) {
        const rec = await offlineStorage.getPhoto(c.id);
        // Offline: mark unsynced so the next sync pushes the change to the server.
        if (rec) await offlineStorage.upsertPhoto({ ...rec, is_primary: false, ...(isOnline ? {} : { synced: false }) });
      }
      if (isOnline) {
        const { error } = await supabase.from("photos").update({ is_primary: false }).in("id", [...ids]);
        if (error) console.error("Could not demote capture crop:", error);
      }
    } catch (e) {
      console.error("Could not demote capture crop:", e);
    }
  }, [photos, isOnline]);

  const handleTakePhoto = useCallback(async () => {
    if (!lotId || isNewLot) {
      alert("Please save the lot first");
      return;
    }

    // Auto-save metadata before opening camera
    const currentLot = lotRef.current;
    if (currentLot.id && currentLot.sale_id) {
      try {
        const updatedLot: Lot = {
          ...currentLot,
          id: currentLot.id,
          sale_id: currentLot.sale_id,
          name: toTitleCase(currentLot.name || ""),
          updated_at: new Date().toISOString(),
        };
        setLot(updatedLot);
        await offlineStorage.upsertLot(updatedLot);
        if (isOnline) {
          SyncService.startOperation();
          try {
            await supabase.from("lots").update(updatedLot).eq("id", lotId);
          } catch (e) {
            console.error("Pre-camera save failed, queued for sync:", e);
            await queueLotUpsert(updatedLot, "update");
          } finally {
            SyncService.endOperation();
          }
        } else {
          await queueLotUpsert(updatedLot, "update");
        }
      } catch (e) {
        console.error("Error saving before camera:", e);
        alert("Failed to save item");
        return;
      }
    }

    const caps = CameraService.getPlatformCapabilities();

    if (caps.isNative) {
      // Continuous capture mode for native camera
      let photoCount = 0;
      let keepCapturing = true;
      const takeOver = takesOverPrimary();

      while (keepCapturing) {
        try {
          const isPrimary = takeOver && photoCount === 0;
          const result = await CameraService.takePhoto(lotId, isPrimary);

          if (!result.success) {
            if (takeOver && photoCount === 0) releasePrimaryClaim();
            // User cancelled or error - exit loop
            if (photoCount > 0) {
              alert(
                `Done! ${photoCount} photo${photoCount > 1 ? "s" : ""} captured.`,
              );
            }
            break;
          }

          if (result.photoId && result.blobUrl) {
            const newPhoto: Photo = {
              id: result.photoId,
              lot_id: lotId,
              file_path: `${lotId}/${result.photoId}.jpg`,
              file_name: `Photo_${Date.now()}.jpg`,
              is_primary: isPrimary,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              synced: false,
            };
            setPhotos((prev) => [...prev, newPhoto]);
            setPhotoUrls((prev) => ({
              ...prev,
              [result.photoId!]: result.blobUrl!,
            }));
            if (isPrimary) await demoteCropPrimaries();
            photoCount++;

            // Ask if user wants to take more photos
            keepCapturing = window.confirm(
              `Photo ${photoCount} saved! Take another photo?`,
            );
          }
        } catch (e) {
          console.error("Error taking photo:", e);
          alert("Failed to capture photo");
          break;
        }
      }
    } else {
      setShowCameraModal(true);
    }
  }, [lotId, isNewLot, photos.length, isOnline, takesOverPrimary, demoteCropPrimaries, releasePrimaryClaim]);

  const handleCaptureFromWebcam = useCallback(
    async (blob: Blob) => {
      if (!lotId) return;
      try {
        const photoId = generateUUID();
        const isPrimary = takesOverPrimary();
        const blobUrl = URL.createObjectURL(blob);

        const metadata: Photo = {
          id: photoId,
          lot_id: lotId,
          file_path: `${lotId}/${photoId}.jpg`,
          file_name: `Webcam_${Date.now()}.jpg`,
          is_primary: isPrimary,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          synced: false,
        };

        await offlineStorage.savePhoto(metadata, blob);
        setPhotos((prev) => [...prev, metadata]);
        setPhotoUrls((prev) => ({ ...prev, [photoId]: blobUrl }));
        if (isPrimary) await demoteCropPrimaries();

        if (isOnline) {
          setTimeout(async () => {
            try {
              const file = new File([blob], `${photoId}.jpg`, {
                type: blob.type,
              });
              const { error } = await supabase.storage
                .from("photos")
                .upload(`${lotId}/${photoId}.jpg`, file, { upsert: true });
              if (!error) {
                const { error: rowError } = await supabase.from("photos").upsert({
                  id: photoId,
                  lot_id: lotId,
                  file_path: `${lotId}/${photoId}.jpg`,
                  file_name: metadata.file_name,
                  is_primary: isPrimary,
                });
                // Left unsynced on failure so the normal photo sync retries it.
                if (!rowError) {
                  metadata.synced = true;
                  await offlineStorage.updatePhoto(metadata);
                } else {
                  console.error("Webcam photo row failed, will retry:", rowError);
                }
              }
            } catch (e) {
              console.error("Background sync failed:", e);
            }
          }, 1000);
        }
        setShowCameraModal(false);
      } catch (e) {
        console.error("Error saving webcam photo:", e);
        alert("Failed to save photo");
      }
    },
    [lotId, photos.length, isOnline, takesOverPrimary, demoteCropPrimaries],
  );

  const handlePhotoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length || !lotId || isNewLot) {
        if (!lotId || isNewLot) alert("Please save the lot first");
        e.target.value = "";
        return;
      }

      try {
        const takeOver = takesOverPrimary();
        const result = await CameraService.handleFileInput(files, lotId, takeOver);
        if (result.success > 0) {
          const newPhotos = result.photos.map((p, i) => ({
            id: p.photoId,
            lot_id: lotId,
            file_path: `${lotId}/${p.photoId}.jpg`,
            file_name: `Photo_${Date.now()}_${i}.jpg`,
            is_primary: takeOver && i === 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            synced: false,
          }));
          setPhotos((prev) => [...prev, ...newPhotos]);
          const newUrls: Record<string, string> = {};
          result.photos.forEach((p) => {
            newUrls[p.photoId] = p.blobUrl;
          });
          setPhotoUrls((prev) => ({ ...prev, ...newUrls }));
          if (takeOver) await demoteCropPrimaries();
        } else if (takeOver) {
          releasePrimaryClaim();
        }
        if (result.failed > 0)
          alert(`${result.failed} file(s) failed to upload`);
        e.target.value = "";
      } catch (err) {
        console.error("Error uploading photos:", err);
        alert("Failed to upload photos");
        e.target.value = "";
      }
    },
    [lotId, isNewLot, photos.length, takesOverPrimary, demoteCropPrimaries, releasePrimaryClaim],
  );

  const handleSetPrimary = useCallback(
    async (photoId: string) => {
      try {
        // Offline, mark changed photos unsynced so the next sync sends them; the
        // server otherwise wins when photos are next loaded online.
        const updated = photos.map((p) => {
          const is_primary = p.id === photoId;
          return is_primary === p.is_primary || isOnline
            ? { ...p, is_primary }
            : { ...p, is_primary, synced: false };
        });
        setPhotos(updated);
        await Promise.all(updated.map((p) => offlineStorage.upsertPhoto(p)));
        if (isOnline) {
          await supabase
            .from("photos")
            .update({ is_primary: false })
            .eq("lot_id", lotId);
          await supabase
            .from("photos")
            .update({ is_primary: true })
            .eq("id", photoId);
        }
      } catch (e) {
        console.error("Error setting primary:", e);
        alert("Failed to set primary photo");
      }
    },
    [photos, lotId, isOnline],
  );

  // Photo deletes take effect a few seconds later, behind an Undo bar, instead of
  // a confirm() box (which froze the page while open). Pending deletes are
  // committed when the timer runs out, on Undo-less navigation, or on unmount.
  const pendingDeletes = useRef<Photo[]>([]);
  const deleteTimer = useRef<number | null>(null);
  const [pendingDeleteCount, setPendingDeleteCount] = useState(0);

  const commitDeletes = useCallback(async () => {
    if (deleteTimer.current) {
      window.clearTimeout(deleteTimer.current);
      deleteTimer.current = null;
    }
    const batch = pendingDeletes.current;
    pendingDeletes.current = [];
    setPendingDeleteCount(0);
    let failed = 0;
    for (const photo of batch) {
      try {
        await offlineStorage.deletePhoto(photo.id);
        if (ConnectivityService.getConnectionStatus()) {
          await supabase.storage.from("photos").remove([photo.file_path]);
          const { error } = await supabase.from("photos").delete().eq("id", photo.id);
          if (error) throw error;
        }
      } catch (e) {
        console.error("Error deleting photo:", e);
        failed++;
      }
    }
    if (failed) alert(`${failed} photo${failed > 1 ? "s" : ""} could not be deleted`);
  }, []);

  const handleDeletePhoto = useCallback(
    (photoId: string) => {
      const photo = photos.find((p) => p.id === photoId);
      if (!photo) return;
      pendingDeletes.current.push(photo);
      setPendingDeleteCount(pendingDeletes.current.length);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setSelectedPhotos((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
      if (deleteTimer.current) window.clearTimeout(deleteTimer.current);
      deleteTimer.current = window.setTimeout(() => {
        commitDeletes();
      }, 6000);
    },
    [photos, commitDeletes],
  );

  const undoDeletes = useCallback(() => {
    if (deleteTimer.current) {
      window.clearTimeout(deleteTimer.current);
      deleteTimer.current = null;
    }
    const batch = pendingDeletes.current;
    pendingDeletes.current = [];
    setPendingDeleteCount(0);
    setPhotos((prev) =>
      [...prev, ...batch].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")),
    );
  }, []);

  // Moving to another lot or leaving the screen commits anything still pending.
  useEffect(
    () => () => {
      if (pendingDeletes.current.length) commitDeletes();
    },
    [lotId, commitDeletes],
  );

  // Photo selection handlers
  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);
  const selectAllPhotos = useCallback(
    () => setSelectedPhotos(new Set(photos.map((p) => p.id))),
    [photos],
  );
  const clearSelection = useCallback(() => setSelectedPhotos(new Set()), []);
  const resetEditOptions = useCallback(
    () =>
      setEditOptions({
        removeBackground: false,
        backgroundColor: undefined,
        fillPercentage: 85,
        lightBalance: 0,
        addShadow: false,
      }),
    [],
  );
  const toggleEditPanel = useCallback(() => setShowEditPanel((p) => !p), []);

  // AI photo editing
  const handleGeneratePreview = useCallback(async () => {
    if (selectedPhotos.size === 0) {
      alert("Select at least one photo");
      return;
    }
    if (
      !editOptions.removeBackground &&
      !editOptions.backgroundColor &&
      (editOptions.lightBalance ?? 0) === 0
    ) {
      alert("Select at least one edit option");
      return;
    }

    setProcessing(true);
    setProgressText("Starting...");
    const previews: typeof previewImages = [];
    const errors: string[] = [];

    const blobToDataUrl = (blob: Blob): Promise<string> =>
      new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });

    try {
      const selected = Array.from(selectedPhotos);
      for (let i = 0; i < selected.length; i++) {
        const photoId = selected[i];
        const originalUrl = photoUrls[photoId];
        if (!originalUrl) continue;
        setProgressText(`Processing ${i + 1} of ${selected.length}...`);

        let imageBlob = await offlineStorage.getPhotoBlob(photoId);
        if (!imageBlob) {
          const resp = await fetch(originalUrl);
          imageBlob = await resp.blob();
        }
        const originalDataUrl = await blobToDataUrl(imageBlob);
        const result: PhotoRoomEditResult = await editWithPhotoRoom(
          imageBlob,
          editOptions,
        );

        if (result.success && result.editedDataUrl && result.editedBlob) {
          previews.push({
            photoId,
            originalUrl: originalDataUrl,
            enhancedUrl: result.editedDataUrl,
            enhancedBlob: result.editedBlob,
          });
        } else if (result.error) {
          // Surface the actual PhotoRoom error instead of silently skipping
          errors.push(result.error);
          console.error(`PhotoRoom error for photo ${photoId}:`, result.error);
        }
      }

      if (previews.length === 0) {
        const errMsg =
          errors.length > 0
            ? `Image processing failed: ${errors[0]}`
            : "No images processed successfully";
        throw new Error(errMsg);
      }
      setPreviewImages(previews);
      setShowPreview(true);
    } catch (e) {
      console.error("Preview error:", e);
      alert(e instanceof Error ? e.message : "Failed to generate preview");
    } finally {
      setProcessing(false);
      setProgressText("");
    }
  }, [selectedPhotos, editOptions, photoUrls]);

  const handleAcceptEnhancements = useCallback(async () => {
    setProcessing(true);
    setProgressText("Saving enhanced images...");
    try {
      for (let i = 0; i < previewImages.length; i++) {
        const preview = previewImages[i];
        const photo = photos.find((p) => p.id === preview.photoId);
        if (!photo) continue;
        setProgressText(`Saving ${i + 1} of ${previewImages.length}...`);

        await offlineStorage.savePhoto(photo, preview.enhancedBlob);
        const newBlobUrl = URL.createObjectURL(preview.enhancedBlob);
        setPhotoUrls((prev) => ({ ...prev, [photo.id]: newBlobUrl }));

        if (isOnline) {
          const fileName = `${lotId}/${Date.now()}_enhanced_${Math.random().toString(36).substring(7)}.png`;
          const { error } = await supabase.storage
            .from("photos")
            .upload(fileName, preview.enhancedBlob);
          if (!error) {
            await supabase
              .from("photos")
              .update({
                file_path: fileName,
                file_name: `enhanced_${photo.file_name}`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", photo.id);
            await supabase.storage.from("photos").remove([photo.file_path]);
          }
        }
      }
      setShowPreview(false);
      setPreviewImages([]);
      setSelectedPhotos(new Set());
      alert("Photos enhanced successfully!");
    } catch (e) {
      console.error("Save error:", e);
      alert("Failed to save enhanced images");
    } finally {
      setProcessing(false);
      setProgressText("");
    }
  }, [previewImages, photos, lotId, isOnline]);

  const handleRejectEnhancements = useCallback(() => {
    setShowPreview(false);
    setPreviewImages([]);
  }, []);

  // AI Enrich handler (kept inline due to Gemini API complexity)
  const handleAIEnrich = useCallback(async () => {
    if (photos.length === 0) {
      alert("Add at least one photo");
      return;
    }
    if (!isOnline) {
      alert("AI Detail Editor requires internet");
      return;
    }

    setSaving(true);
    setAiBusy(true);
    try {
      const primaryPhoto = photos.find((p) => p.is_primary) || photos[0];
      const otherPhotos = photos
        .filter((p) => p.id !== primaryPhoto.id)
        .slice(0, 2);
      const photosToAnalyze = [primaryPhoto, ...otherPhotos];

      const photoBlobs: Blob[] = [];
      for (const photo of photosToAnalyze) {
        const blob = await offlineStorage.getPhotoBlob(photo.id);
        if (blob) photoBlobs.push(blob);
      }
      if (photoBlobs.length === 0) {
        alert("No photos available");
        return;
      }

      const base64Photos = await Promise.all(photoBlobs.map(toAIJpeg));

      const categories = getLACategories().map((c) => c.name);
      const styles = getLAStyles().map((s) => s.name);
      const origins = getLAOrigins().map((o) => o.name);
      const creators = getLACreators().map((c) => c.name);
      const materials = getLAMaterials().map((m) => m.name);

      // Send what the cataloger has already entered. Without this every run
      // re-read the same photos and overwrote their corrections.
      const current = lotRef.current;
      const snapshot = aiSnapshotRef.current;
      const known: [keyof Lot, string][] = [
        ["name", "Title"],
        ["creator", "Maker / artist"],
        ["materials", "Materials"],
        ["origin", "Origin"],
        ["style", "Style / period"],
        ["category", "Category"],
        ["condition", "Condition"],
        ["condition_report", "Condition report"],
        ["quantity", "Quantity"],
        ["description", "Description"],
      ];
      const corrected: string[] = [];
      const entered: string[] = [];
      for (const [key, label] of known) {
        const val = current[key];
        if (val === null || val === undefined || String(val).trim() === "")
          continue;
        const line = `${label}: ${String(val).trim()}`;
        // Changed since the last AI run (or no AI run yet) = the cataloger's own
        // input. With no run this session a description may be an old AI draft,
        // so it is context only unless edited after a run.
        const changed = snapshot
          ? String(snapshot[key] ?? "") !== String(val)
          : key !== "description";
        if (changed)
          corrected.push(line);
        else entered.push(line);
      }
      const dims = [current.height, current.width, current.depth]
        .filter((d) => d !== null && d !== undefined && d !== 0)
        .join(" x ");
      if (dims) entered.push(`Dimensions (H x W x D): ${dims} ${current.dimension_unit || "inches"}`);
      if (current.weight) entered.push(`Weight: ${current.weight}`);

      console.log("[AI] Cataloger context:", { corrected, entered });

      // Research (Google Search) + formatting happen server-side in the
      // `lot-enrich` edge function, which also keeps the Gemini key private.
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "lot-enrich",
        {
          body: {
            photos: base64Photos.map((data) => ({ data, mimeType: "image/jpeg" })),
            corrected,
            entered,
            lists: { categories, styles, origins, creators, materials },
          },
        },
      );
      if (fnError || !result?.fields) {
        let detail = result?.error || fnError?.message || "no response";
        // FunctionsHttpError keeps the function's JSON body on `context`
        const ctx = (fnError as { context?: Response } | null)?.context;
        if (ctx && typeof ctx.json === "function") {
          const errBody = await ctx.json().catch(() => null);
          if (errBody?.error) detail = errBody.error;
        }
        throw new Error(`AI analysis failed: ${detail}`);
      }
      const aiData = result.fields as Record<string, unknown>;
      console.log("[AI] Result:", result);
      setAiResearch({
        researched: !!result.researched,
        basis: typeof aiData.valuation_basis === "string" ? aiData.valuation_basis : "",
        notes: typeof result.research === "string" ? result.research : "",
        sources: Array.isArray(result.sources) ? result.sources : [],
      });

      // Defensive: Gemini sometimes returns arrays or non-strings even when prompted not to
      const findMatch = (val: unknown, list: string[]): string => {
        if (val === null || val === undefined) return "";
        const strVal = Array.isArray(val) ? val.join(", ") : String(val);
        if (!strVal.trim()) return "";
        const lower = strVal.toLowerCase();
        return (
          list.find((i) => i.toLowerCase() === lower) ||
          list.find(
            (i) =>
              i.toLowerCase().includes(lower) ||
              lower.includes(i.toLowerCase()),
          ) ||
          strVal
        );
      };

      // Defensive: coerce any value to a clean string
      const toStr = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (Array.isArray(val)) return val.join(", ");
        return String(val);
      };

      // Defensive: coerce to number if possible, else undefined
      const toNum = (val: unknown): number | undefined => {
        if (typeof val === "number" && !isNaN(val)) return val;
        if (typeof val === "string") {
          const n = parseFloat(val.replace(/[^0-9.-]/g, ""));
          return isNaN(n) ? undefined : n;
        }
        return undefined;
      };

      // Pricing is only filled in silently when the lot has none yet. If the
      // cataloger already has figures, show old vs new and let them choose.
      const cur = lotRef.current;
      const newPrice = {
        estimate_low: toNum(aiData.estimate_low) ?? cur.estimate_low,
        estimate_high: toNum(aiData.estimate_high) ?? cur.estimate_high,
        starting_bid: toNum(aiData.starting_bid) ?? cur.starting_bid,
      };
      const hasPrice = [cur.estimate_low, cur.estimate_high, cur.starting_bid].some(
        (v) => Number(v) > 0,
      );
      const money = (v: unknown) =>
        Number(v) > 0 ? `$${Number(v).toLocaleString()}` : "—";
      const priceChanged =
        Number(newPrice.estimate_low ?? 0) !== Number(cur.estimate_low ?? 0) ||
        Number(newPrice.estimate_high ?? 0) !== Number(cur.estimate_high ?? 0) ||
        Number(newPrice.starting_bid ?? 0) !== Number(cur.starting_bid ?? 0);
      const applyPrice =
        !hasPrice ||
        !priceChanged ||
        confirm(
          "The AI suggests different pricing for this lot.\n\n" +
            `Current estimate: ${money(cur.estimate_low)} – ${money(cur.estimate_high)}\n` +
            `Current starting bid: ${money(cur.starting_bid)}\n\n` +
            `New estimate: ${money(newPrice.estimate_low)} – ${money(newPrice.estimate_high)}\n` +
            `New starting bid: ${money(newPrice.starting_bid)}\n` +
            (typeof aiData.valuation_basis === "string" && aiData.valuation_basis
              ? `\nBasis: ${aiData.valuation_basis}\n`
              : "") +
            "\nOK = use the new pricing. Cancel = keep the current pricing.",
        );

      setLot((prev) => {
        const next = {
          ...prev,
          name: toTitleCase(toStr(aiData.title).substring(0, 50)) || prev.name,
          description: toStr(aiData.description) || prev.description,
          category: findMatch(aiData.category, categories) || prev.category,
          style: findMatch(aiData.style, styles) || prev.style,
          origin: findMatch(aiData.origin, origins) || prev.origin,
          creator: findMatch(aiData.creator, creators) || prev.creator,
          materials: findMatch(aiData.materials, materials) || prev.materials,
          condition: toStr(aiData.condition) || prev.condition,
          ...(applyPrice ? newPrice : {}),
        };
        aiSnapshotRef.current = { ...next };
        return next;
      });
      alert(
        result.researched
          ? "AI Detail Editor complete! Review the research below, then save."
          : "AI Detail Editor complete (web research unavailable this time). Review and save.",
      );
    } catch (e) {
      console.error("AI error:", e);
      alert(e instanceof Error ? e.message : "Failed to analyze item");
    } finally {
      setAiBusy(false);
      setSaving(false);
    }
  }, [photos, isOnline]);

  // Save/Delete handlers
  // Resolves true when the lot was saved. `silent` skips the success alert (used
  // when saving on the way to the next lot); a click passes an event, not options.
  const handleSave = useCallback(async (opts?: { silent?: boolean }): Promise<boolean> => {
    const currentLot = lotRef.current;
    if (!currentLot.name) {
      alert("Please enter an item name");
      return false;
    }
    if (!saleId) {
      alert("No sale selected");
      return false;
    }
    setSaving(true);
    try {
      if (isNewLot) {
        const newLot: Lot = {
          ...currentLot,
          sale_id: saleId,
          id: generateUUID(),
          name: toTitleCase(currentLot.name || ""),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await offlineStorage.upsertLot(newLot);
        if (isOnline) {
          SyncService.startOperation();
          try {
            await supabase.from("lots").insert(newLot);
            // Generate QR code after lot is created
            await generateQRCodeForLot(
              saleId,
              newLot.id,
              newLot.lot_number || 0,
            );
          } catch (e) {
            // Online by navigator, but the write failed anyway (captive wifi,
            // signal dying mid-request). Queue rather than lose it.
            console.error("Lot insert failed, queued for sync:", e);
            await queueLotUpsert(newLot, "create");
          } finally {
            SyncService.endOperation();
          }
        } else {
          await queueLotUpsert(newLot, "create");
          // Also generate QR code offline (will sync later)
          generateQRCodeForLot(saleId, newLot.id, newLot.lot_number || 0).catch(
            (e) => console.error("QR generation failed:", e),
          );
        }
        navigate(`/sales/${saleId}/lots/${newLot.id}`, { replace: true });
      } else {
        if (!currentLot.id || !currentLot.sale_id) {
          alert("Invalid lot data");
          return false;
        }
        const updatedLot: Lot = {
          ...currentLot,
          id: currentLot.id,
          sale_id: currentLot.sale_id,
          name: toTitleCase(currentLot.name || ""),
          updated_at: new Date().toISOString(),
        };
        setLot(updatedLot);
        await offlineStorage.upsertLot(updatedLot);
        if (isOnline) {
          SyncService.startOperation();
          try {
            await supabase.from("lots").update(updatedLot).eq("id", lotId);
            // Regenerate QR code when lot is updated
            await generateQRCodeForLot(
              saleId,
              updatedLot.id,
              updatedLot.lot_number || 0,
            );
          } catch (e) {
            console.error("Lot update failed, queued for sync:", e);
            await queueLotUpsert(updatedLot, "update");
          } finally {
            SyncService.endOperation();
          }
        } else {
          await queueLotUpsert(updatedLot, "update");
        }
        loadedKeyRef.current = editKey(updatedLot);
        if (opts?.silent !== true) alert("Item saved successfully");
      }
      return true;
    } catch (e) {
      console.error("Error saving:", e);
      alert("Failed to save item");
      return false;
    } finally {
      setSaving(false);
    }
  }, [isNewLot, saleId, lotId, isOnline, navigate]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm("Delete this item? Cannot be undone.")) return;
    setSaving(true);
    try {
      if (!lotId) return;
      const markDeletedLocally = () =>
        offlineStorage.upsertLot({
          ...lotRef.current,
          id: lotId,
          deleted: true,
        } as Lot & { deleted: boolean });
      if (isOnline) {
        // Online: delete for real, or say why not and stay on the lot. (A failure
        // used to be queued silently, so the lot just stayed in the list.)
        SyncService.startOperation();
        try {
          await deleteLotOnServer(lotId);
        } finally {
          SyncService.endOperation();
        }
        await markDeletedLocally();
      } else {
        // Offline: hide it here and queue the delete; the sync runs the same
        // server delete when the connection returns.
        for (const photo of photos) {
          await offlineStorage.deletePhoto(photo.id);
        }
        await markDeletedLocally();
        await offlineStorage.addPendingSyncItem({
          id: lotId, type: "delete", table: "lots", data: { id: lotId },
        });
      }
      navigate(`/sales/${saleId}`);
    } catch (e) {
      console.error("Error deleting:", e);
      alert(e instanceof Error ? e.message : "Failed to delete item");
      setSaving(false);
    }
  }, [photos, lotId, saleId, isOnline, navigate]);

  const neighbors = useLotNeighbors(saleId, isNewLot ? undefined : lotId, walkMode);

  // Move to another lot of this sale, keeping the walk mode. Unsaved edits are
  // saved first (or the move is cancelled); photos are already saved as taken.
  const goToLot = useCallback(
    async (id: string | null) => {
      if (!id || saving) return;
      if (!isNewLot && editKey(lotRef.current) !== loadedKeyRef.current) {
        if (!window.confirm("Save your changes to this lot before moving on?\n\nOK saves and continues. Cancel stays here.")) return;
        if (!(await handleSave({ silent: true }))) return;
      }
      navigate(`/sales/${saleId}/lots/${id}${walkMode === "photos" ? "?walk=photos" : ""}`);
      window.scrollTo(0, 0);
    },
    [saving, isNewLot, handleSave, navigate, saleId, walkMode],
  );

  // Footer actions
  useEffect(() => {
    const caps = CameraService.getPlatformCapabilities();
    const actions: FooterAction[] = [
      {
        id: "save",
        label: isNewLot ? "Create Item" : "Save Changes",
        icon: <Save className="w-4 h-4" />,
        onClick: handleSave,
        variant: "primary",
        disabled: !lot.name || saving,
        loading: saving,
      },
    ];

    if (!isNewLot && (caps.supportsWebCamera || caps.supportsNativeCamera)) {
      actions.push({
        id: "camera",
        label: caps.supportsNativeCamera ? "Camera" : "Webcam",
        icon: <Camera className="w-4 h-4" />,
        onClick: handleTakePhoto,
        variant: "secondary",
      });
    }

    if (!isNewLot && isEstateSale) {
      actions.push({
        id: "print-tag",
        label: "Print tag",
        icon: <Printer className="w-4 h-4" />,
        onClick: async () => {
          // The tag shows the saved price; save edits first so it is not stale.
          if (editKey(lotRef.current) !== loadedKeyRef.current) {
            if (!window.confirm("Save your changes before printing the tag?\n\nOK saves and prints. Cancel stays here.")) return;
            if (!(await handleSave({ silent: true }))) return;
          }
          setShowPrintTag(true);
        },
        variant: "secondary",
        disabled: saving,
      });
    }

    if (!isNewLot) {
      actions.push({
        id: "next-lot",
        label: "Next lot",
        icon: <ChevronRight className="w-4 h-4" />,
        onClick: () => goToLot(neighbors.nextId),
        variant: "secondary",
        disabled: !neighbors.nextId || saving,
      });
      actions.push({
        id: "upload",
        label: "Choose Files",
        icon: <Upload className="w-4 h-4" />,
        onClick: () => document.getElementById("photo-upload")?.click(),
        variant: "secondary",
      });
    }

    actions.push({
      id: "back",
      label: "Back",
      icon: <ArrowLeft className="w-4 h-4" />,
      onClick: () => navigate(`/sales/${saleId}`),
      variant: "secondary",
    });

    if (!isNewLot) {
      actions.push({
        id: "delete",
        label: "Delete",
        icon: <Trash2 className="w-4 h-4" />,
        onClick: handleDelete,
        variant: "danger",
      });
    }

    setActions(actions);
    return () => clearActions();
  }, [
    lot.name,
    isNewLot,
    saving,
    saleId,
    handleSave,
    handleTakePhoto,
    handleDelete,
    goToLot,
    neighbors.nextId,
    navigate,
    setActions,
    clearActions,
    isEstateSale,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading item...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      <input
        id="photo-upload"
        type="file"
        accept="image/*"
        multiple
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {pendingDeleteCount > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-gray-900 text-white text-sm rounded-full px-4 py-2 shadow-lg">
          <span>
            {pendingDeleteCount} photo{pendingDeleteCount > 1 ? "s" : ""} deleted
          </span>
          <button onClick={undoDeletes} className="font-semibold text-indigo-300 hover:text-indigo-200">
            Undo
          </button>
        </div>
      )}

      {/* Walk the sale: previous / next lot, optionally only lots still needing photos */}
      {!isNewLot && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => goToLot(neighbors.prevId)}
            disabled={!neighbors.prevId || saving}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-sm text-gray-600 min-w-[7rem] text-center">
            {neighbors.ready && neighbors.position > 0
              ? `${neighbors.position} of ${neighbors.count}${walkMode === "photos" ? " needing photos" : ""}`
              : ""}
          </span>
          <button
            onClick={() => goToLot(neighbors.nextId)}
            disabled={!neighbors.nextId || saving}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
          <label className="ml-auto inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={walkMode === "photos"}
              onChange={(e) => setSearchParams(e.target.checked ? { walk: "photos" } : {}, { replace: true })}
            />
            Only lots needing photos
          </label>
        </div>
      )}

      {/* Lot badges */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
          Lot #{lot.lot_number || "TBD"}
          {isTemporaryNumber(lot.lot_number) && (
            <span className="ml-2 text-xs text-indigo-600">(Temporary)</span>
          )}
        </span>
        {!isNewLot && lot.quantity && lot.quantity > 1 && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
            Qty: {lot.quantity}
          </span>
        )}
        {!isNewLot && lot.condition && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            {lot.condition}
          </span>
        )}
      </div>

      {/* Photos Section */}
      {!isNewLot && (
        <LotPhotoSection
          photos={photos}
          photoUrls={photoUrls}
          photoFallbackUrls={photoFallbackUrls}
          selectedPhotos={selectedPhotos}
          showEditPanel={showEditPanel}
          editOptions={editOptions}
          processing={processing}
          progressText={progressText}
          onToggleEditPanel={toggleEditPanel}
          onTogglePhotoSelection={togglePhotoSelection}
          onSelectAll={selectAllPhotos}
          onClearSelection={clearSelection}
          onResetEditOptions={resetEditOptions}
          onEditOptionsChange={setEditOptions}
          onGeneratePreview={handleGeneratePreview}
          onSetPrimary={handleSetPrimary}
          onDeletePhoto={handleDeletePhoto}
        />
      )}

      {/* Form */}
      <LotForm
        lot={lot}
        onChange={setLot}
        isOnline={isOnline}
        isNewLot={isNewLot}
        hasPhotos={photos.length > 0}
        saving={saving}
        onAIEnrich={handleAIEnrich}
        aiBusy={aiBusy}
        consignments={consignments}
        contacts={contacts}
      />

      {aiResearch && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">AI research</h2>
            <button
              onClick={() => setAiResearch(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
          {!aiResearch.researched && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded p-2">
              Web research was unavailable for this run — the details and
              estimate are from the photos and your entries only.
            </p>
          )}
          {aiResearch.basis && (
            <p className="text-sm text-gray-800">
              <span className="font-medium">Estimate basis: </span>
              {aiResearch.basis}
            </p>
          )}
          {aiResearch.notes && (
            <details className="text-sm">
              <summary className="cursor-pointer text-indigo-700 font-medium">
                Research notes
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-gray-700">
                {aiResearch.notes}
              </p>
            </details>
          )}
          {aiResearch.sources.length > 0 && (
            <div className="text-sm">
              <div className="font-medium text-gray-800 mb-1">Sources</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {aiResearch.sources.map((s) => (
                  <li key={s.uri}>
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-700 hover:underline break-all"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-500">
            AI findings can be wrong — check the sources before relying on an
            attribution or estimate. Research notes are not saved with the lot.
          </p>
        </div>
      )}

      {/* QR code — links to the public lot page (existing lots only) */}
      {!isNewLot && saleId && lotId && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6 flex flex-col items-center">
          <p className="text-sm font-medium text-gray-700 mb-3">Lot QR Code</p>
          <LotQRCode saleId={saleId} lotId={lotId} size={160} className="rounded" />
          <p className="mt-3 text-xs text-gray-500 text-center">
            Scans to the public item page. Print tags from Reports &amp; Tools → QR Code Price Tags.
          </p>
        </div>
      )}

      {/* Modals */}
      {showPreview && (
        <PhotoPreviewModal
          previewImages={previewImages}
          processing={processing}
          progressText={progressText}
          onAccept={handleAcceptEnhancements}
          onReject={handleRejectEnhancements}
        />
      )}

      {showPrintTag && lotId && (
        <PrintTagsModal
          lots={[{ ...(lot as Lot), id: lotId }]}
          onClose={() => setShowPrintTag(false)}
          onPrinted={(_id, printedAt, price) =>
            setLot((prev) => ({ ...prev, tag_printed_at: printedAt, tag_price: price }))
          }
        />
      )}

      {showCameraModal && (
        <WebcamModal
          onCapture={handleCaptureFromWebcam}
          onClose={() => setShowCameraModal(false)}
        />
      )}
    </div>
  );
}
