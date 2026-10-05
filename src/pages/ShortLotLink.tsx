// src/pages/ShortLotLink.tsx
// /l/:lotId — the short link printed in lot tag QR codes. One URL, and what it
// opens depends on who scans it (enforced by the database, not this page):
//   staff (signed in, member of the lot's company) → the full lot screen
//   everyone else → the public lot page, which also shows a verified shopper
//                   their own hold or purchase (my_lot)
// Older tags encode /view/sales/:saleId/lots/:lotId and keep working.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchPublicLot } from '../lib/publicLots';
import offlineStorage from '../services/Offlinestorage';

export default function ShortLotLink() {
  const { lotId } = useParams<{ lotId: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!lotId) return;
    let cancelled = false;

    (async () => {
      // Staff: RLS only returns the lot to members of its company.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data, error } = await supabase.from('lots').select('sale_id').eq('id', lotId).maybeSingle();
        let saleId = (data as { sale_id?: string } | null)?.sale_id;
        // Offline on the floor: the lot may still be in the local mirror.
        if (!saleId && error) saleId = (await offlineStorage.getLot(lotId).catch(() => undefined))?.sale_id;
        if (cancelled) return;
        if (saleId) {
          navigate(`/sales/${saleId}/lots/${lotId}`, { replace: true });
          return;
        }
      }

      const lot = await fetchPublicLot(lotId);
      if (cancelled) return;
      if (lot) navigate(`/view/sales/${lot.sale_id}/lots/${lotId}`, { replace: true });
      else setNotFound(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [lotId, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {notFound ? (
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Item not found</h1>
          <p className="text-gray-600">This tag does not match an item. It may have been removed from the sale.</p>
        </div>
      ) : (
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      )}
    </div>
  );
}
