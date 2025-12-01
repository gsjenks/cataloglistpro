import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Sale } from '../types';
import { Calendar, MapPin, Edit, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import SaleModal from '../components/SaleModal';

interface SalesListProps {
  sales: Sale[];
  onRefresh: () => void;
}

export default function SalesList({ sales, onRefresh }: SalesListProps) {
  const navigate = useNavigate();
  const { currentCompany } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  const handleDelete = async (sale: Sale) => {
    if (!confirm(`Delete sale "${sale.name}"? This will also delete all lots, contacts, and documents associated with this sale.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', sale.id);

      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Failed to delete sale');
    }
  };

  const getStatusColor = (status: Sale['status']) => {
    switch (status) {
      case 'upcoming':
        return 'bg-indigo-100 text-indigo-700';
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'completed':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div>
      {/* REMOVED: Inline "New Sale" button - now handled by footer */}

      {sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Calendar className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 mb-4">No sales yet</p>
          <p className="text-xs text-gray-500">Use the "New Sale" button at the bottom to create your first sale</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sales.map((sale) => (
            <div
              key={sale.id}
              onClick={() => navigate(`/sales/${sale.id}`)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow group relative cursor-pointer"
            >
              {/* Action buttons - Top Right */}
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingSale(sale);
                    setShowModal(true);
                  }}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shadow-sm"
                  aria-label="Edit sale"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(sale);
                  }}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-all shadow-sm"
                  aria-label="Delete sale"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mb-3">
                <h3 
                  className="font-semibold text-gray-900 text-lg hover:text-indigo-600 transition-colors pr-20"
                >
                  {sale.name}
                </h3>
              </div>

              <div className="space-y-2 mb-3">
                {sale.start_date && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    {new Date(sale.start_date).toLocaleDateString()}
                  </div>
                )}
                {sale.location && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4" />
                    {sale.location}
                  </div>
                )}
              </div>

              <div>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(sale.status)}`}>
                  {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <SaleModal
          sale={editingSale}
          companyId={currentCompany?.id || ''}
          onClose={() => {
            setShowModal(false);
            setEditingSale(null);
          }}
          onSave={() => {
            setShowModal(false);
            setEditingSale(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}