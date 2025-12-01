import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, Users, FileText, BarChart3, ArrowLeft, Plus, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useFooter } from '../context/FooterContext';
import type { Sale, Lot, Contact, Document } from '../types';
import ScrollableTabs from './ScrollableTabs';
import LotsList from './LotsList';
import ContactsList from './ContactsList';
import DocumentsList from './DocumentsList';
import ExportService from '../services/ExportService';
import SaleReportsTools from './SaleReportsTools';

export default function SaleDetail() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const { setActions, clearActions } = useFooter();
  const [sale, setSale] = useState<Sale | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState('items');
  const [loading, setLoading] = useState(true);
  
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

  // Sort state - track active sort for each tab (default: lot-desc = last lot first)
  const [activeSorts, setActiveSorts] = useState<Record<string, string>>({
    items: 'lot-desc',
    contacts: '',
    documents: '',
    reports: ''
  });

  useEffect(() => {
    loadSale();
    loadLots();
    loadContacts();
    loadDocuments();
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
  }, [activeTab, saleId, setActions, clearActions, navigate]);

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
  const tabs = [
    {
      id: 'items',
      label: 'Items',
      icon: <Package className="w-4 h-4" />,
      count: filteredLots.length,
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
  ];

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
              <span>â€¢</span>
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
        </div>
      </div>

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
        {activeTab === 'items' && (
          <>
            <LotsList
              lots={filteredLots}
              saleId={saleId!}
              onRefresh={loadLots}
            />
            
            {/* Show "No results" message when searching */}
            {searchQueries.items && filteredLots.length === 0 && lots.length > 0 && (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">No items found</p>
                <p className="text-gray-400 text-sm">
                  No items match your search for "{searchQueries.items}"
                </p>
              </div>
            )}
          </>
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
            exporting={exporting}
            exportMessage={exportMessage}
            exportStats={exportStats}
            onExportCSV={handleExportCSV}
          />
        )}
      </div>
    </div>
  );
}