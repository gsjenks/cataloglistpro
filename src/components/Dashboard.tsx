// src/components/Dashboard.tsx
// OPTIMIZED: Parallel API calls, memoized filters, useCallback handlers

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useFooter } from '../context/FooterContext';
import { supabase } from '../lib/supabase';
import type { Sale, Contact, Document } from '../types';
import { 
  Package,
  TrendingUp,
  Calendar,
  FileText,
  Users,
  Plus,
  Upload,
  FileUp
} from 'lucide-react';
import SalesList from './SalesList';
import ContactsList from './ContactsList';
import DocumentsList from './DocumentsList';
import ScrollableTabs from './ScrollableTabs';
import SaleModal from './SaleModal';
import ReportsAndTools from './ReportsAndTools';

export default function Dashboard() {
  const { user, currentCompany } = useApp();
  const { setActions, clearActions } = useFooter();
  const [activeTab, setActiveTab] = useState('sales');
  const [sales, setSales] = useState<Sale[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalLots, setTotalLots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSaleModal, setShowSaleModal] = useState(false);
  
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({
    sales: '',
    contacts: '',
    documents: ''
  });
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({
    sales: '',
    contacts: '',
    documents: ''
  });

  // Memoized stats
  const stats = useMemo(() => ({
    activeSales: sales.filter(s => s.status === 'active').length,
    upcomingSales: sales.filter(s => s.status === 'upcoming').length,
    totalLots
  }), [sales, totalLots]);

  // Parallel data loading
  const loadDashboardData = useCallback(async () => {
    if (!currentCompany) return;

    setLoading(true);
    try {
      // Run all queries in parallel
      const [salesResult, contactsResult, documentsResult] = await Promise.all([
        supabase
          .from('sales')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('contacts')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('first_name', { ascending: true }),
        supabase
          .from('documents')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: false })
      ]);

      if (salesResult.error) throw salesResult.error;
      if (contactsResult.error) throw contactsResult.error;
      if (documentsResult.error) throw documentsResult.error;

      const salesData = salesResult.data || [];
      setSales(salesData);
      setContacts(contactsResult.data || []);
      setDocuments(documentsResult.data || []);

      // Count lots only if we have sales (separate query to not block UI)
      if (salesData.length > 0) {
        const { count } = await supabase
          .from('lots')
          .select('*', { count: 'exact', head: true })
          .in('sale_id', salesData.map(s => s.id));
        setTotalLots(count || 0);
      } else {
        setTotalLots(0);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      alert('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [currentCompany]);

  useEffect(() => {
    if (currentCompany) {
      loadDashboardData();
    }
  }, [currentCompany, loadDashboardData]);

  // Memoized footer actions setup
  useEffect(() => {
    switch (activeTab) {
      case 'sales':
        setActions([{
          id: 'add-sale',
          label: 'New Sale',
          icon: <Plus className="w-4 h-4" />,
          onClick: () => setShowSaleModal(true),
          variant: 'primary'
        }]);
        break;
      case 'contacts':
        setActions([{
          id: 'add-contact',
          label: 'New Contact',
          icon: <Plus className="w-4 h-4" />,
          onClick: () => {
            const addButton = document.querySelector('[data-add-contact]') as HTMLButtonElement;
            if (addButton) addButton.click();
          },
          variant: 'primary'
        }]);
        break;
      case 'documents':
        setActions([{
          id: 'add-document',
          label: 'Upload Document',
          icon: <Upload className="w-4 h-4" />,
          onClick: () => {
            const addButton = document.querySelector('[data-add-document]') as HTMLButtonElement;
            if (addButton) addButton.click();
          },
          variant: 'primary'
        }]);
        break;
      default:
        clearActions();
    }
    return () => clearActions();
  }, [activeTab, setActions, clearActions]);

  // Memoized handlers
  const handleSearch = useCallback((tabId: string, query: string) => {
    setSearchQueries(prev => ({ ...prev, [tabId]: query }));
  }, []);

  const handleFilterChange = useCallback((tabId: string, filterId: string) => {
    setActiveFilters(prev => ({ ...prev, [tabId]: filterId }));
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  const handleSaleModalClose = useCallback(() => {
    setShowSaleModal(false);
  }, []);

  const handleSaleSave = useCallback(() => {
    setShowSaleModal(false);
    loadDashboardData();
  }, [loadDashboardData]);

  // Memoized filtered data
  const filteredSales = useMemo(() => {
    let filtered = [...sales];
    const query = searchQueries.sales.toLowerCase();
    
    if (query) {
      filtered = filtered.filter(sale =>
        sale.name.toLowerCase().includes(query) ||
        sale.location?.toLowerCase().includes(query) ||
        sale.status?.toLowerCase().includes(query)
      );
    }
    
    const filter = activeFilters.sales;
    if (filter) {
      filtered = filtered.filter(sale => sale.status === filter);
    }
    
    // Sort by status priority then date
    const statusOrder: Record<string, number> = { 'active': 0, 'upcoming': 1, 'completed': 2 };
    filtered.sort((a, b) => {
      const aStatus = statusOrder[a.status] ?? 999;
      const bStatus = statusOrder[b.status] ?? 999;
      if (aStatus !== bStatus) return aStatus - bStatus;
      
      const aDate = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bDate = b.start_date ? new Date(b.start_date).getTime() : 0;
      return bDate - aDate;
    });
    
    return filtered;
  }, [sales, searchQueries.sales, activeFilters.sales]);

  const filteredContacts = useMemo(() => {
    let filtered = [...contacts];
    const query = searchQueries.contacts.toLowerCase();
    
    if (query) {
      filtered = filtered.filter(contact =>
        contact.prefix?.toLowerCase().includes(query) ||
        contact.first_name?.toLowerCase().includes(query) ||
        contact.middle_name?.toLowerCase().includes(query) ||
        contact.last_name?.toLowerCase().includes(query) ||
        contact.suffix?.toLowerCase().includes(query) ||
        contact.business_name?.toLowerCase().includes(query) ||
        contact.role?.toLowerCase().includes(query) ||
        contact.contact_type?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.phone?.toLowerCase().includes(query) ||
        contact.address?.toLowerCase().includes(query) ||
        contact.city?.toLowerCase().includes(query) ||
        contact.state?.toLowerCase().includes(query) ||
        contact.zip_code?.toLowerCase().includes(query) ||
        contact.notes?.toLowerCase().includes(query)
      );
    }
    
    const filter = activeFilters.contacts;
    if (filter) {
      filtered = filtered.filter(contact => 
        contact.contact_type?.toLowerCase() === filter.toLowerCase()
      );
    }
    
    return filtered;
  }, [contacts, searchQueries.contacts, activeFilters.contacts]);

  const filteredDocuments = useMemo(() => {
    let filtered = [...documents];
    const query = searchQueries.documents.toLowerCase();
    
    if (query) {
      filtered = filtered.filter(doc =>
        doc.name?.toLowerCase().includes(query) ||
        doc.file_name?.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.document_type?.toLowerCase().includes(query) ||
        doc.file_type?.toLowerCase().includes(query)
      );
    }
    
    const filter = activeFilters.documents;
    if (filter) {
      filtered = filtered.filter(doc => doc.document_type === filter);
    }
    
    return filtered;
  }, [documents, searchQueries.documents, activeFilters.documents]);

  // Memoized tabs config
  const tabs = useMemo(() => [
    { id: 'sales', label: 'Sales', icon: <Calendar className="w-4 h-4" />, count: filteredSales.length },
    { id: 'contacts', label: 'Contacts', icon: <Users className="w-4 h-4" />, count: filteredContacts.length },
    { id: 'documents', label: 'Documents', icon: <FileText className="w-4 h-4" />, count: filteredDocuments.length },
    { id: 'reports', label: 'Reports & Tools', icon: <FileUp className="w-4 h-4" />, count: 0 },
  ], [filteredSales.length, filteredContacts.length, filteredDocuments.length]);

  // Static tab filters config
  const tabFilters = useMemo(() => ({
    sales: {
      searchPlaceholder: 'Search sales by name or location...',
      showSearch: true,
      showFilter: true,
      filterOptions: [
        { id: 'upcoming', label: 'Upcoming', value: 'upcoming' },
        { id: 'active', label: 'Active', value: 'active' },
        { id: 'completed', label: 'Completed', value: 'completed' },
      ],
    },
    contacts: {
      searchPlaceholder: 'Search contacts by name, email, or company...',
      showSearch: true,
      showFilter: true,
      filterOptions: [
        { id: 'staff', label: 'Staff', value: 'staff' },
        { id: 'buyer', label: 'Buyers', value: 'buyer' },
        { id: 'contractor', label: 'Contractors', value: 'contractor' },
        { id: 'appraiser', label: 'Appraisers', value: 'appraiser' },
        { id: 'attorney', label: 'Attorneys', value: 'attorney' },
        { id: 'other', label: 'Other', value: 'other' },
      ],
    },
    documents: {
      searchPlaceholder: 'Search documents by name or description...',
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
      searchPlaceholder: '',
      showSearch: false,
      showFilter: false,
      filterOptions: [],
    },
  }), []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {currentCompany?.name || 'CatalogListPro'}
              </h1>
              <p className="text-sm text-indigo-100 mt-1">{user?.email}</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4 pb-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-indigo-100 text-xs font-medium truncate">Active Sales</p>
                  <p className="text-white text-2xl font-bold">{stats.activeSales}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-indigo-100 text-xs font-medium truncate">Upcoming</p>
                  <p className="text-white text-2xl font-bold">{stats.upcomingSales}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-indigo-100 text-xs font-medium truncate">Total Lots</p>
                  <p className="text-white text-2xl font-bold">{stats.totalLots.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4">
        <div className="bg-white rounded-lg shadow-md">
          <ScrollableTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabFilters={tabFilters}
            onSearch={handleSearch}
            onFilterChange={handleFilterChange}
          />

          <div className="p-6">
            {activeTab === 'sales' && (
              <SalesList sales={filteredSales} onRefresh={loadDashboardData} />
            )}
            {activeTab === 'contacts' && (
              <ContactsList 
                contacts={filteredContacts} 
                companyId={currentCompany?.id}
                onRefresh={loadDashboardData} 
              />
            )}
            {activeTab === 'documents' && (
              <DocumentsList 
                documents={filteredDocuments} 
                companyId={currentCompany?.id}
                onRefresh={loadDashboardData} 
              />
            )}
            {activeTab === 'reports' && <ReportsAndTools />}
          </div>
        </div>
      </div>

      {showSaleModal && (
        <SaleModal
          sale={null}
          companyId={currentCompany?.id || ''}
          onClose={handleSaleModalClose}
          onSave={handleSaleSave}
        />
      )}
    </div>
  );
}