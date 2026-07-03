// src/pages/PublicSale.tsx
// Public catalog for a whole sale: every lot with its number, primary photo,
// live status (available/held/sold), and price. Tapping a lot opens its page
// (which offers Add to Basket when available). Route: /view/sales/:saleId

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import { supabasePublic } from '../lib/publicClient';
import { effectiveStatus } from '../lib/holds';
import { useShopper } from '../hooks/useShopper';
import { useServerBasket } from '../hooks/useServerBasket';
import LotQRCode from '../components/LotQRCode';
import BasketIcon from '../components/BasketIcon';

interface CatalogLot {
  id: string;
  lot_number: number | string | null;
  name: string;
  starting_bid: number | null;
  inventory_status: string | null;
  held_until: string | null;
  imageUrl?: string;
}

const STATUS_BADGE: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  held: 'bg-amber-100 text-amber-800',
  sold: 'bg-gray-200 text-gray-700',
};
const STATUS_TEXT: Record<string, string> = {
  available: 'Available',
  held: 'On Hold',
  sold: 'Sold',
};

export default function PublicSale() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const [lots, setLots] = useState<CatalogLot[]>([]);
  const [saleName, setSaleName] = useState('');
  const [saleType, setSaleType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { shopperId } = useShopper();
  const basket = useServerBasket(saleId, shopperId ?? undefined);

  const load = useCallback(async () => {
    if (!saleId) return;
    const [{ data: sale }, { data: lotRows }] = await Promise.all([
      supabasePublic.from('sales').select('name, sale_type').eq('id', saleId).single(),
      supabasePublic
        .from('lots')
        .select('id, lot_number, name, starting_bid, inventory_status, held_until')
        .eq('sale_id', saleId)
        .order('lot_number', { ascending: true }),
    ]);
    const saleRow = sale as { name?: string; sale_type?: string } | null;
    setSaleName(saleRow?.name ?? '');
    setSaleType(saleRow?.sale_type ?? null);
    const rows = (lotRows as CatalogLot[] | null) || [];

    // Fetch primary photos for all lots in one query, map lot_id -> public URL.
    const ids = rows.map((l) => l.id);
    const imageByLot: Record<string, string> = {};
    if (ids.length) {
      const { data: photos } = await supabasePublic
        .from('photos')
        .select('lot_id, file_path, is_primary')
        .in('lot_id', ids)
        .order('is_primary', { ascending: false });
      for (const p of (photos as { lot_id: string; file_path: string }[] | null) || []) {
        if (!imageByLot[p.lot_id]) {
          imageByLot[p.lot_id] = supabasePublic.storage.from('photos').getPublicUrl(p.file_path).data.publicUrl;
        }
      }
    }
    setLots(rows.map((l) => ({ ...l, imageUrl: imageByLot[l.id] })));
    setLoading(false);
  }, [saleId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep statuses live during the sale.
  useEffect(() => {
    if (!saleId) return;
    const channel = supabasePublic
      .channel(`catalog:${saleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lots', filter: `sale_id=eq.${saleId}` }, () => load())
      .subscribe();
    return () => {
      supabasePublic.removeChannel(channel);
    };
  }, [saleId, load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{saleName || 'Sale'}</h1>
            <p className="text-sm text-gray-500">{lots.length} items</p>
          </div>
          {saleType === 'estate_sale' && (
            <BasketIcon saleId={saleId!} basketId={basket.basketId} count={basket.items.length} />
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {lots.length === 0 ? (
          <p className="text-center text-gray-500 py-16">No items in this sale yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {lots.map((lot) => {
              const status = effectiveStatus(lot.inventory_status, lot.held_until);
              return (
                <button
                  key={lot.id}
                  onClick={() => navigate(`/view/sales/${saleId}/lots/${lot.id}`)}
                  className="text-left bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                    {lot.imageUrl ? (
                      <img src={lot.imageUrl} alt={lot.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Package className="w-10 h-10 text-gray-300" />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-indigo-700">#{lot.lot_number ?? '—'}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[status]}`}>
                        {STATUS_TEXT[status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 line-clamp-2 mb-1">{lot.name}</p>
                    <p className="text-sm font-bold text-gray-900">
                      {lot.starting_bid != null ? `$${lot.starting_bid.toLocaleString()}` : '—'}
                    </p>
                    <div className="mt-2 flex justify-center">
                      <LotQRCode
                        saleId={saleId!}
                        lotId={lot.id}
                        size={72}
                        className="rounded border border-gray-200 bg-white p-1"
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
