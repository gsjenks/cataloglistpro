import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, Users, FileText, BarChart3, ArrowLeft, Plus, Upload, ScanLine, ShoppingCart, ShoppingBag, FileCheck, FileWarning, ListChecks, DollarSign, PackageX, Truck, Banknote } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useFooter } from '../context/FooterContext';
import type { Sale, Lot, Contact, Document, Consignment } from '../types';
import { useLotInventoryRealtime } from '../hooks/useLotInventoryRealtime';
import { reclaimExpiredHolds } from '../lib/holds';
import { isSoldLot } from '../lib/lotState';
import { refundLotSale } from '../services/RefundService';
import type { ScannedLot } from '../services/ScannerService';
import ScrollableTabs from './ScrollableTabs';
import LotsList from './LotsList';
import AssignToBasketModal from './AssignToBasketModal';
import SaleCloseSummary from './SaleCloseSummary';
import QRScanner from './QRScanner';
import PointOfSale from './PointOfSale';
import BasketManager from './BasketManager';
import ContactsList from './ContactsList';
import DocumentsList from './DocumentsList';
import ExportService from '../services/ExportService';
import SaleReportsTools from './SaleReportsTools';
import StageBanner from './StageBanner';
import SaleSetupTab from './SaleSetupTab';
import ConsignmentsManager from './ConsignmentsManager';
import CatalogueImportModal from './CatalogueImportModal';
import PaymentsPanel from './PaymentsPanel';
import UnsoldPanel from './UnsoldPanel';
import FulfillmentPanel from './FulfillmentPanel';
import EstateFulfillmentPanel from './EstateFulfillmentPanel';
import ReconciliationPanel from './ReconciliationPanel';
import { listConsignments } from '../services/ConsignmentService';
import { formatContactName } from '../utils/contactName';

export default function SaleDetail() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const { setActions, clearActions } = useFooter();
  const [sale, setSale] = useState<Sale | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [showCatalogueImport, setShowCatalogueImport] = useState(false);

  // consignment_id -> consignor display name, for lot cards.
  const consignorNames = useMemo(() => {
    const map: Record<string, string> = {};
    consignments.forEach((c) => {
      map[c.id] = formatContactName(contacts.find((ct) => ct.id === c.contact_id));
    });
    return map;
  }, [consignments, contacts]);
  const [activeTab, setActiveTab] = useState('items');
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showBaskets, setShowBaskets] = useState(false);
  // Set when handing a basket from the Baskets tool straight to the register.
  const [checkoutBasketId, setCheckoutBasketId] = useState<string | null>(null);
  // The lot being put into a customer's basket via the item-list "Held" control.
  const [assignLot, setAssignLot] = useState<Lot | null>(null);
  
  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [exportStats, setExportStats] = useState<{
    totalLots: number;
    lotsWithPhotos: number;
    totalPhotos: number;
    missingData: string[];
  } | null>(null);
  
  // Search state - track search query for each tab separately
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({
    items: '',
    contacts: '',
    documents: '',
    reports: ''
  });

  // Filter state - track active filter for each tab
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({
    items: '',
    contacts: '',
    documents: '',
    reports: ''
  });

  // Items: multi-select inventory-status filter (empty = show all). Any
  // combination of Available / Held / Sold.
  type InvStatus = 'available' | 'held' | 'sold';
  const [statusFilter, setStatusFilter] = useState<Set<InvStatus>>(new Set());
  const toggleStatusFilter = (s: InvStatus) =>
    setStatusFilter((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  // Sort state - track active sort for each tab (default: lot-desc = last lot first)
  // Load from localStorage for persistence
  const [activeSorts, setActiveSorts] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('saleDetail_activeSorts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { items: 'lot-desc', contacts: '', documents: '', reports: '' };
      }
    }
    return { items: 'lot-desc', contacts: '', documents: '', reports: '' };
  });

  // Save sort preferences to localStorage when changed
  useEffect(() => {
    localStorage.setItem('saleDetail_activeSorts', JSON.stringify(activeSorts));
  }, [activeSorts]);

  useEffect(() => {
    loadSale();
    loadLots();
    loadContacts();
    loadDocuments();
    loadConsignments();
  }, [saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load export stats when Reports tab is active
  useEffect(() => {
    if (activeTab === 'reports' && saleId) {
      loadExportStats();
    }
  }, [activeTab, saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set footer actions based on active tab
  useEffect(() => {
    switch (activeTab) {
      case 'items':
        setActions([
          {
            id: 'add-lot',
            label: 'New Item',
            icon: <Plus className="w-4 h-4" />,
            onClick: () => navigate(`/sales/${saleId}/lots/new`),
            variant: 'primary'
          },
          // Estate sales: open the register, or scan a tag to jump to a lot.
          ...(sale?.sale_type === 'estate_sale'
            ? [
                {
                  id: 'register',
                  label: 'Register',
                  icon: <ShoppingCart className="w-4 h-4" />,
                  onClick: () => setShowRegister(true),
                  variant: 'primary' as const,
                },
                {
                  id: 'scan-lot',
                  label: 'Scan',
                  icon: <ScanLine className="w-4 h-4" />,
                  onClick: () => setShowScanner(true),
                  variant: 'secondary' as const,
                },
                {
                  id: 'baskets',
                  label: 'Baskets',
                  icon: <ShoppingBag className="w-4 h-4" />,
                  onClick: () => setShowBaskets(true),
                  variant: 'secondary' as const,
                },
              ]
            : []),
          {
            id: 'back',
            label: 'Back',
            icon: <ArrowLeft className="w-4 h-4" />,
            onClick: () => navigate('/'),
            variant: 'secondary'
          }
        ]);
        break;
      case 'contacts':
        setActions([
          {
            id: 'add-contact',
            label: 'New Contact',
            icon: <Plus className="w-4 h-4" />,
            onClick: () => {
              // Trigger contact add from ContactsList
              const addButton = document.querySelector('[data-add-contact]') as HTMLButtonElement;
              if (addButton) addButton.click();
            },
            variant: 'primary'
          },
          {
            id: 'back',
            label: 'Back',
            icon: <ArrowLeft className="w-4 h-4" />,
            onClick: () => navigate('/'),
            variant: 'secondary'
          }
        ]);
        break;
      case 'documents':
        setActions([
          {
            id: 'add-document',
            label: 'Upload Document',
            icon: <Upload className="w-4 h-4" />,
            onClick: () => {
              // Trigger document upload from DocumentsList
              const addButton = document.querySelector('[data-add-document]') as HTMLButtonElement;
              if (addButton) addButton.click();
            },
            variant: 'primary'
          },
          {
            id: 'back',
            label: 'Back',
            icon: <ArrowLeft className="w-4 h-4" />,
            onClick: () => navigate('/'),
            variant: 'secondary'
          }
        ]);
        break;
      case 'reports':
        setActions([
          {
            id: 'back',
            label: 'Back',
            icon: <ArrowLeft className="w-4 h-4" />,
            onClick: () => navigate('/'),
            variant: 'secondary'
          }
        ]);
        break;
      default:
        clearActions();
    }

    // Cleanup on unmount
    return () => {
      clearActions();
    };
  }, [activeTab, saleId, sale?.sale_type, setActions, clearActions, navigate]);

  const loadSale = async () => {
    if (!saleId) return;

    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single();

      if (error) throw error;
      setSale(data);
    } catch (error) {
      console.error('Error loading sale:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLots = async () => {
    if (!saleId) return;

    try {
      // Free any timed-out holds before reading, so expired items show as
      // available (and leave shoppers' baskets) instead of staying "held".
      await reclaimExpiredHolds(supabase, saleId);
      const { data, error } = await supabase
        .from('lots')
        .select('*')
        .eq('sale_id', saleId)
        .order('lot_number', { ascending: true });

      if (error) throw error;
      setLots(data || []);
    } catch (error) {
      console.error('Error loading lots:', error);
    }
  };

  // Estate-sale floor: patch a single lot in place when another device changes
  // it (status, etc.) via realtime.
  const handleRealtimeLotUpdate = useCallback((updated: Lot) => {
    setLots((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  }, []);

  // A lot was added or removed elsewhere — reload the list to stay consistent.
  const handleStructuralChange = useCallback(() => {
    loadLots();
  }, [saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refund a sold lot — the only way it leaves "Sold". Reverses its register sale
  // and returns it to Available.
  const handleRefundLot = useCallback(async (lot: Lot) => {
    const price = lot.sold_price != null ? ` ($${lot.sold_price.toLocaleString()})` : '';
    if (!confirm(`Refund #${lot.lot_number ?? '—'} ${lot.name}${price}? This reverses the sale and returns the item to Available.`)) return;
    const reason = window.prompt('Reason for the refund (optional):') ?? '';
    const res = await refundLotSale(lot, { companyId: sale?.company_id ?? null, reason });
    if (!res.success) {
      alert('Refund failed: ' + (res.error ?? 'unknown error'));
      return;
    }
    loadLots();
  }, [sale?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Staff mark a lot Available / Held / Sold. Optimistic update + write-back;
  // realtime echoes the change to other devices.
  const handleInventoryChange = useCallback(
    async (lotId: string, status: NonNullable<Lot['inventory_status']>) => {
      setLots((prev) =>
        prev.map((l) =>
          l.id === lotId ? { ...l, inventory_status: status, held_by: null, held_until: null } : l,
        ),
      );
      // Clearing held_by/held_until makes a manual "Held" an indefinite staff
      // hold (no timer, so the expired-hold reclaim leaves it alone), and
      // Available/Sold properly release any buyer hold.
      const { error } = await supabase
        .from('lots')
        .update({ inventory_status: status, held_by: null, held_until: null, updated_at: new Date().toISOString() })
        .eq('id', lotId);
      if (error) {
        console.error('Failed to update inventory status:', error);
        loadLots(); // reconcile on failure
      }
    },
    [saleId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useLotInventoryRealtime(saleId, {
    onUpdate: handleRealtimeLotUpdate,
    onStructuralChange: handleStructuralChange,
    enabled: sale?.sale_type === 'estate_sale',
  });

  // Scanned a lot tag on the floor — jump to that lot (may be in another sale).
  const handleScanned = useCallback(
    (scanned: ScannedLot) => {
      setShowScanner(false);
      navigate(`/sales/${scanned.saleId}/lots/${scanned.lotId}`);
    },
    [navigate],
  );

  const loadContacts = async () => {
    if (!saleId) return;

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('sale_id', saleId)
        .order('first_name', { ascending: true });

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const loadDocuments = async () => {
    if (!saleId) return;

    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const loadConsignments = async () => {
    if (!saleId) return;
    try {
      setConsignments(await listConsignments(saleId));
    } catch (error) {
      console.error('Error loading consignments:', error);
    }
  };

  const loadExportStats = async () => {
    if (!saleId) return;

    try {
      const stats = await ExportService.getExportStats(saleId);
      setExportStats(stats);
    } catch (error) {
      console.error('Error loading export stats:', error);
    }
  };

  const handleExportCSV = async (includePhotos: boolean) => {
    if (!saleId || !sale) return;

    setExporting(true);
    setExportMessage(null);

    try {
      const result = await ExportService.exportToLiveAuctioneersCSV(
        saleId,
        sale.name,
        includePhotos
      );

      if (result.success) {
        setExportMessage({
          type: 'success',
          text: result.message
        });
      } else {
        setExportMessage({
          type: 'error',
          text: result.message
        });
      }
    } catch (error) {
      setExportMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Export failed'
      });
    } finally {
      setExporting(false);
      
      // Auto-clear success message after 5 seconds
      setTimeout(() => {
        setExportMessage(null);
      }, 5000);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  };

  // Search handler - updates search query for specific tab
  const handleSearch = (tabId: string, query: string) => {
    setSearchQueries(prev => ({
      ...prev,
      [tabId]: query
    }));
  };

  // Filter handler - updates active filter for specific tab
  const handleFilterChange = (tabId: string, filterId: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [tabId]: filterId
    }));
  };

  // Sort handler - updates active sort for specific tab
  const handleSortChange = (tabId: string, sortId: string) => {
    setActiveSorts(prev => ({
      ...prev,
      [tabId]: sortId
    }));
  };

  // COMPREHENSIVE LOTS FILTER - Searches ALL 20+ metadata fields
  const getFilteredLots = () => {
    let filtered = [...lots];
    const query = searchQueries.items?.toLowerCase().trim();
    
    // Apply search across all lot fields
    if (query) {
      filtered = filtered.filter(lot => 
        lot.name?.toLowerCase().includes(query) ||
        lot.description?.toLowerCase().includes(query) ||
        lot.lot_number?.toString().includes(query) ||
        lot.category?.toLowerCase().includes(query) ||
        lot.condition?.toLowerCase().includes(query) ||
        lot.style?.toLowerCase().includes(query) ||
        lot.origin?.toLowerCase().includes(query) ||
        lot.creator?.toLowerCase().includes(query) ||
        lot.materials?.toLowerCase().includes(query) ||
        lot.consignor?.toLowerCase().includes(query) ||
        lot.estimate_low?.toString().includes(query) ||
        lot.estimate_high?.toString().includes(query) ||
        lot.starting_bid?.toString().includes(query) ||
        lot.reserve_price?.toString().includes(query) ||
        lot.buy_now_price?.toString().includes(query) ||
        lot.height?.toString().includes(query) ||
        lot.width?.toString().includes(query) ||
        lot.depth?.toString().includes(query) ||
        lot.weight?.toString().includes(query) ||
        lot.quantity?.toString().includes(query)
      );
    }
    
    // Apply category filter
    const filter = activeFilters.items;
    if (filter) {
      filtered = filtered.filter(lot => lot.category?.toLowerCase() === filter.toLowerCase());
    }

    // Apply inventory-status filter (any combination of Available/Held/Sold).
    if (statusFilter.size > 0) {
      filtered = filtered.filter(lot => statusFilter.has((lot.inventory_status ?? 'available') as InvStatus));
    }

    // Apply sort
    const sort = activeSorts.items;
    if (sort) {
      switch (sort) {
        case 'lot-asc':
          filtered.sort((a, b) => {
            const aNum = Number(a.lot_number) || 0;
            const bNum = Number(b.lot_number) || 0;
            return aNum - bNum;
          });
          break;
        case 'lot-desc':
          filtered.sort((a, b) => {
            const aNum = Number(a.lot_number) || 0;
            const bNum = Number(b.lot_number) || 0;
            return bNum - aNum;
          });
          break;
        case 'name-asc':
          filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          break;
        case 'name-desc':
          filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
          break;
        case 'price-asc':
          filtered.sort((a, b) => {
            const aPrice = Number(a.estimate_low) || 0;
            const bPrice = Number(b.estimate_low) || 0;
            return aPrice - bPrice;
          });
          break;
        case 'price-desc':
          filtered.sort((a, b) => {
            const aPrice = Number(a.estimate_high) || 0;
            const bPrice = Number(b.estimate_high) || 0;
            return bPrice - aPrice;
          });
          break;
      }
    }
    
    return filtered;
  };

  // CONTACTS FILTER - Searches all contact fields
  const getFilteredContacts = () => {
    let filtered = [...contacts];
    const query = searchQueries.contacts?.toLowerCase().trim();
    
    if (query) {
      filtered = filtered.filter(contact =>
        contact.first_name?.toLowerCase().includes(query) ||
        contact.last_name?.toLowerCase().includes(query) ||
        contact.business_name?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.phone?.toLowerCase().includes(query) ||
        contact.address?.toLowerCase().includes(query) ||
        contact.city?.toLowerCase().includes(query) ||
        contact.state?.toLowerCase().includes(query) ||
        contact.zip_code?.toLowerCase().includes(query) ||
        contact.notes?.toLowerCase().includes(query) ||
        contact.contact_type?.toLowerCase().includes(query)
      );
    }
    
    // Apply contact type filter
    const filter = activeFilters.contacts;
    if (filter) {
      filtered = filtered.filter(contact => contact.contact_type === filter);
    }
    
    return filtered;
  };

  // DOCUMENTS FILTER
  const getFilteredDocuments = () => {
    let filtered = [...documents];
    const query = searchQueries.documents?.toLowerCase().trim();
    
    if (query) {
      filtered = filtered.filter(doc =>
        doc.name?.toLowerCase().includes(query) ||
        doc.file_name?.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.document_type?.toLowerCase().includes(query) ||
        doc.file_type?.toLowerCase().includes(query)
      );
    }
    
    // Apply document type filter
    const filter = activeFilters.documents;
    if (filter) {
      filtered = filtered.filter(doc => doc.document_type === filter);
    }
    
    return filtered;
  };

  // Get filtered data for each tab
  const filteredLots = getFilteredLots();
  const filteredContacts = getFilteredContacts();
  const filteredDocuments = getFilteredDocuments();

  // Define tabs with filtered counts
  // Estate sales don't use the LiveAuctioneers settlement pipeline; payments are
  // taken at the register, so the auction Payments tab is hidden for them.
  const isEstate = sale?.sale_type === 'estate_sale';
  const tabs = [
    {
      id: 'setup',
      label: 'Setup',
      icon: <ListChecks className="w-4 h-4" />,
    },
    {
      id: 'items',
      label: 'Items',
      icon: <Package className="w-4 h-4" />,
      count: filteredLots.length,
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: <DollarSign className="w-4 h-4" />,
      count: lots.filter((l) => l.outcome === 'sold' && (l.payment_status ?? 'unpaid') !== 'paid').length,
    },
    {
      id: 'fulfillment',
      label: 'Fulfillment',
      icon: <Truck className="w-4 h-4" />,
      count: isEstate
        ? lots.filter((l) => l.inventory_status === 'sold' && l.for_delivery).length
        : lots.filter((l) => l.outcome === 'sold' && l.payment_status === 'paid' && !l.shipped_at && !l.delivered_at).length,
    },
    {
      id: 'unsold',
      label: 'Unsold',
      icon: <PackageX className="w-4 h-4" />,
      count: isEstate
        ? lots.filter((l) => !l.disposition && !isSoldLot(l) && l.inventory_status !== 'sold'
            && !(l.inventory_status === 'held' && !!l.held_until && new Date(l.held_until).getTime() > Date.now())).length
        : lots.filter((l) => l.outcome === 'passed' && !l.disposition).length,
    },
    {
      id: 'reconciliation',
      label: 'Reconciliation',
      icon: <Banknote className="w-4 h-4" />,
      count: consignments.filter((c) => !c.paid_at).length,
    },
    {
      id: 'contacts',
      label: 'Contacts',
      icon: <Users className="w-4 h-4" />,
      count: filteredContacts.length,
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: <FileText className="w-4 h-4" />,
      count: filteredDocuments.length,
    },
    {
      id: 'reports',
      label: 'Reports & Tools',
      icon: <BarChart3 className="w-4 h-4" />,
    },
  ].filter((t) => !(isEstate && t.id === 'payments'));

  // Define filters for each tab
  const tabFilters = {
    items: {
      searchPlaceholder: 'Search items by name, category, price, lot #, dimensions...',
      showSearch: true,
      showFilter: true,
      showSort: true,
      sortOptions: [
        { id: 'lot-desc', label: 'Lot # (Last First)', value: 'lot-desc' },
        { id: 'lot-asc', label: 'Lot # (First First)', value: 'lot-asc' },
        { id: 'name-asc', label: 'Name (A-Z)', value: 'name-asc' },
        { id: 'name-desc', label: 'Name (Z-A)', value: 'name-desc' },
        { id: 'price-asc', label: 'Price (Low to High)', value: 'price-asc' },
        { id: 'price-desc', label: 'Price (High to Low)', value: 'price-desc' },
      ],
      filterOptions: [
        { id: 'furniture', label: 'Furniture', value: 'furniture' },
        { id: 'art', label: 'Art', value: 'art' },
        { id: 'jewelry', label: 'Jewelry', value: 'jewelry' },
        { id: 'collectibles', label: 'Collectibles', value: 'collectibles' },
        { id: 'antiques', label: 'Antiques', value: 'antiques' },
        { id: 'electronics', label: 'Electronics', value: 'electronics' },
        { id: 'tools', label: 'Tools', value: 'tools' },
        { id: 'vehicles', label: 'Vehicles', value: 'vehicles' },
        { id: 'books', label: 'Books', value: 'books' },
        { id: 'other', label: 'Other', value: 'other' },
      ],
    },
    contacts: {
      searchPlaceholder: 'Search contacts by name, email, phone, company, address...',
      showSearch: true,
      showFilter: true,
      filterOptions: [
        { id: 'client', label: 'Clients', value: 'client' },
        { id: 'realtor', label: 'Realtors', value: 'realtor' },
        { id: 'appraiser', label: 'Appraisers', value: 'appraiser' },
        { id: 'executor', label: 'Executors', value: 'executor' },
        { id: 'contractor', label: 'Contractors', value: 'contractor' },
        { id: 'emergency', label: 'Emergency', value: 'emergency' },
        { id: 'other', label: 'Other', value: 'other' },
      ],
    },
    documents: {
      searchPlaceholder: 'Search documents by name, type, description...',
      showSearch: true,
      showFilter: true,
      filterOptions: [
        { id: 'contract', label: 'Contracts', value: 'contract' },
        { id: 'invoice', label: 'Invoices', value: 'invoice' },
        { id: 'receipt', label: 'Receipts', value: 'receipt' },
        { id: 'report', label: 'Reports', value: 'report' },
        { id: 'other', label: 'Other', value: 'other' },
      ],
    },
    reports: {
      showSearch: false,
      showFilter: false,
    },
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
        <p className="text-red-600">Sale not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{sale.name}</h1>
        
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
          <span>{formatDate(sale.start_date)}</span>
          {sale.location && (
            <>
              <span>•</span>
              <span>{sale.location}</span>
            </>
          )}
          <span className={`
            px-2 py-1 rounded text-xs font-medium
            ${sale.status === 'active' 
              ? 'bg-green-100 text-green-700' 
              : sale.status === 'completed'
              ? 'bg-gray-100 text-gray-700'
              : 'bg-yellow-100 text-yellow-700'
            }
          `}>
            {sale.status?.charAt(0).toUpperCase() + sale.status?.slice(1)}
          </span>
          {documents.some((doc) => doc.document_type === 'contract') ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200"
              title="Contract on file for this sale"
            >
              <FileCheck className="w-3.5 h-3.5" />
              Contract on file
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('documents')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              title="No contract on file — click to open Documents and add one"
            >
              <FileWarning className="w-3.5 h-3.5" />
              No contract
            </button>
          )}
        </div>
      </div>

      {/* Auction lifecycle stage banner (#2) */}
      <StageBanner
        sale={sale}
        lots={lots}
        consignments={consignments}
        documents={documents}
        onChanged={loadSale}
        onOpenSetup={() => setActiveTab('setup')}
      />

      {/* Scrollable Tabs with Search, Filter, and Sort */}
      <ScrollableTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabFilters={tabFilters}
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
      />

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'setup' && (
          <div className="space-y-6">
            {sale.stage === 'closed' && (
              <SaleCloseSummary
                sale={sale}
                lots={lots}
                consignments={consignments}
                consignorNames={consignorNames}
                saleType={sale?.sale_type}
                onChanged={loadSale}
              />
            )}
            <SaleSetupTab
              sale={sale}
              lots={lots}
              consignments={consignments}
              documents={documents}
              onChanged={loadSale}
            />
            <ConsignmentsManager
              saleId={saleId!}
              companyId={sale.company_id}
              consignments={consignments}
              contacts={contacts}
              lots={lots}
              saleName={sale.name}
              saleType={sale?.sale_type}
              onChanged={loadConsignments}
            />
            {!isEstate && (
              <div className="bg-white rounded-lg border border-gray-200 p-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Catalogue</h2>
                  <p className="text-sm text-gray-500">
                    Import the LiveAuctioneers catalogue PDF to add estimates and descriptions
                    to existing lots and pull in the unsold lots.
                  </p>
                </div>
                <button
                  onClick={() => setShowCatalogueImport(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shrink-0"
                >
                  <Upload className="w-4 h-4" /> Import catalogue PDF
                </button>
              </div>
            )}
          </div>
        )}
        {activeTab === 'items' && (
          <>
            {/* Inventory-status filter: tap any combination of Available/Held/Sold */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs font-medium text-gray-500 mr-1">Status:</span>
              {([
                { key: 'available' as InvStatus, label: 'Available', on: 'bg-green-600 text-white border-green-600', off: 'bg-white text-green-700 border-green-300 hover:bg-green-50' },
                { key: 'held' as InvStatus, label: 'Held', on: 'bg-amber-500 text-white border-amber-500', off: 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50' },
                { key: 'sold' as InvStatus, label: 'Sold', on: 'bg-gray-700 text-white border-gray-700', off: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50' },
              ]).map(({ key, label, on, off }) => {
                const active = statusFilter.has(key);
                const count = lots.filter((l) => (l.inventory_status ?? 'available') === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => toggleStatusFilter(key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${active ? on : off}`}
                  >
                    {label} <span className="opacity-70">({count})</span>
                  </button>
                );
              })}
              {statusFilter.size > 0 && (
                <button
                  onClick={() => setStatusFilter(new Set())}
                  className="text-xs text-gray-500 hover:text-indigo-600 underline ml-1"
                >
                  Clear
                </button>
              )}
            </div>

            <LotsList
              lots={filteredLots}
              saleId={saleId!}
              onRefresh={loadLots}
              saleType={sale?.sale_type}
              onInventoryChange={handleInventoryChange}
              onHoldLot={setAssignLot}
              onRefundLot={handleRefundLot}
              consignorNames={consignorNames}
            />
            
            {/* Show "No results" message when a search/filter hides everything */}
            {(searchQueries.items || statusFilter.size > 0 || activeFilters.items) && filteredLots.length === 0 && lots.length > 0 && (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">No items found</p>
                <p className="text-gray-400 text-sm">
                  {searchQueries.items
                    ? `No items match your search for "${searchQueries.items}"`
                    : 'No items match the current filters.'}
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'payments' && !isEstate && (
          <PaymentsPanel saleId={saleId!} saleName={sale.name} companyId={sale.company_id} lots={lots} onChanged={loadLots} />
        )}

        {activeTab === 'fulfillment' && (
          isEstate ? (
            <EstateFulfillmentPanel saleId={saleId!} saleName={sale.name} lots={lots} onChanged={loadLots} />
          ) : (
            <FulfillmentPanel saleId={saleId!} companyId={sale.company_id} saleName={sale.name} lots={lots} onChanged={loadLots} />
          )
        )}

        {activeTab === 'unsold' && (
          <UnsoldPanel
            saleId={saleId!}
            lots={lots}
            consignorNames={consignorNames}
            saleName={sale.name}
            saleType={sale?.sale_type}
            onChanged={loadLots}
          />
        )}

        {activeTab === 'reconciliation' && (
          <ReconciliationPanel
            saleId={saleId!}
            saleName={sale.name}
            consignments={consignments}
            lots={lots}
            consignorNames={consignorNames}
            saleType={sale?.sale_type}
            onChanged={loadConsignments}
          />
        )}

        {activeTab === 'contacts' && (
          <>
            <ContactsList
              contacts={filteredContacts}
              saleId={saleId!}
              onRefresh={loadContacts}
            />
            
            {/* Show "No results" message when searching */}
            {searchQueries.contacts && filteredContacts.length === 0 && contacts.length > 0 && (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">No contacts found</p>
                <p className="text-gray-400 text-sm">
                  No contacts match your search for "{searchQueries.contacts}"
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'documents' && (
          <>
            <DocumentsList
              documents={filteredDocuments}
              saleId={saleId!}
              companyId={sale?.company_id ?? undefined}
              onRefresh={loadDocuments}
            />
            
            {/* Show "No results" message when searching */}
            {searchQueries.documents && filteredDocuments.length === 0 && documents.length > 0 && (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">No documents found</p>
                <p className="text-gray-400 text-sm">
                  No documents match your search for "{searchQueries.documents}"
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'reports' && (
          <SaleReportsTools
            saleId={saleId!}
            saleName={sale?.name || 'Sale'}
            saleType={sale?.sale_type}
            lots={lots}
            exporting={exporting}
            exportMessage={exportMessage}
            exportStats={exportStats}
            onExportCSV={handleExportCSV}
          />
        )}
      </div>

      {showScanner && (
        <QRScanner onScan={handleScanned} onClose={() => setShowScanner(false)} />
      )}

      {showRegister && (
        <PointOfSale
          saleId={saleId!}
          companyId={sale?.company_id ?? null}
          saleName={sale?.name}
          lots={lots}
          initialBasketId={checkoutBasketId}
          onClose={() => { setShowRegister(false); setCheckoutBasketId(null); }}
          onCompleted={loadLots}
        />
      )}

      {showBaskets && (
        <BasketManager
          saleId={saleId!}
          companyId={sale?.company_id ?? null}
          onClose={() => setShowBaskets(false)}
          onChanged={loadLots}
          onCheckout={(shopperId) => {
            setShowBaskets(false);
            setCheckoutBasketId(shopperId);
            setShowRegister(true);
          }}
        />
      )}

      {assignLot && (
        <AssignToBasketModal
          saleId={saleId!}
          companyId={sale?.company_id ?? null}
          lot={assignLot}
          onClose={() => setAssignLot(null)}
          onAssigned={loadLots}
        />
      )}

      {showCatalogueImport && (
        <CatalogueImportModal
          saleId={saleId!}
          onClose={() => setShowCatalogueImport(false)}
          onImported={(res) => {
            setShowCatalogueImport(false);
            loadLots();
            alert(`Catalogue imported: ${res.updated} lots updated, ${res.created} added as unsold.`);
          }}
        />
      )}
    </div>
  );
}