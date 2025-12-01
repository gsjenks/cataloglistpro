import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useFooter } from '../context/FooterContext';
import { supabase } from '../lib/supabase';
import type { Sale, Contact, Document } from '../types';
import { 
//  Settings,
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
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showSaleModal, setShowSaleModal] = useState(false);
  
  // Search and filter state
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
  
  // Calculate stats from actual data
  const stats = {
    activeSales: sales.filter(s => s.status === 'active').length,
    upcomingSales: sales.filter(s => s.status === 'upcoming').length,
    totalLots: 0 // We'll calculate this from lots
  };

  const loadDashboardData = async () => {
    if (!currentCompany) return;

    setLoading(true);
    try {
      // Load sales
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;
      setSales(salesData || []);

      // Load contacts
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('first_name', { ascending: true });

      if (contactsError) throw contactsError;
      setContacts(contactsData || []);

      // Load documents
      const { data: documentsData, error: documentsError } = await supabase
        .from('documents')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false });

      if (documentsError) throw documentsError;
      setDocuments(documentsData || []);

      // Count total lots across all sales
      const { count, error: countError } = await supabase
        .from('lots')
        .select('*', { count: 'exact', head: true })
        .in('sale_id', salesData?.map(s => s.id) || []);

      if (!countError) {
        stats.totalLots = count || 0;
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      alert('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentCompany) {
      loadDashboardData();
    }
  }, [currentCompany]);

  // Set footer actions based on active tab
  useEffect(() => {
    switch (activeTab) {
      case 'sales':
        setActions([
          {
            id: 'add-sale',
            label: 'New Sale',
            icon: <Plus className="w-4 h-4" />,
            onClick: () => setShowSaleModal(true),
            variant: 'primary'
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
          }
        ]);
        break;
      case 'reports':
        // No footer actions for reports & tools tab
        clearActions();
        break;
      default:
        clearActions();
    }

    // Cleanup on unmount
    return () => {
      clearActions();
    };
  }, [activeTab, setActions, clearActions]);

  // Search handler
  const handleSearch = (tabId: string, query: string) => {
    setSearchQueries(prev => ({
      ...prev,
      [tabId]: query
    }));
  };

  // Filter handler
  const handleFilterChange = (tabId: string, filterId: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [tabId]: filterId
    }));
  };

  // Filter data based on search and active filters
  const getFilteredSales = () => {
    let filtered = [...sales];
    
    // Apply search
    const query = searchQueries.sales.toLowerCase();
    if (query) {
      filtered = filtered.filter(sale =>
        sale.name.toLowerCase().includes(query) ||
        sale.location?.toLowerCase().includes(query) ||
        sale.status?.toLowerCase().includes(query)
      );
    }
    
    // Apply filter
    const filter = activeFilters.sales;
    if (filter) {
      filtered = filtered.filter(sale => sale.status === filter);
    }
    
    // Sort by status (active, upcoming, completed) then by date within each status
    filtered.sort((a, b) => {
      // Define status priority
      const statusOrder: Record<string, number> = {
        'active': 0,
        'upcoming': 1,
        'completed': 2
      };
      
      const aStatus = statusOrder[a.status] ?? 999;
      const bStatus = statusOrder[b.status] ?? 999;
      
      // First sort by status
      if (aStatus !== bStatus) {
        return aStatus - bStatus;
      }
      
      // Then sort by date within same status (most recent first)
      const aDate = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bDate = b.start_date ? new Date(b.start_date).getTime() : 0;
      
      return bDate - aDate; // Descending order (newest first)
    });
    
    return filtered;
  };

  const getFilteredContacts = () => {
    let filtered = [...contacts];
    
    // Apply search
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
        (contact as any).contact_type?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.phone?.toLowerCase().includes(query) ||
        contact.address?.toLowerCase().includes(query) ||
        contact.city?.toLowerCase().includes(query) ||
        contact.state?.toLowerCase().includes(query) ||
        contact.zip_code?.toLowerCase().includes(query) ||
        contact.notes?.toLowerCase().includes(query)
      );
    }
    
    // Apply filter by contact_type
    const filter = activeFilters.contacts;
    if (filter) {
      filtered = filtered.filter(contact => (contact as any).contact_type?.toLowerCase() === filter.toLowerCase());
    }
    
    return filtered;
  };

  const getFilteredDocuments = () => {
    let filtered = [...documents];
    
    // Apply search
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
    
    // Apply filter
    const filter = activeFilters.documents;
    if (filter) {
      filtered = filtered.filter(doc => doc.document_type === filter);
    }
    
    return filtered;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Define tabs for ScrollableTabs component with counts reflecting filtered data
  const filteredSales = getFilteredSales();
  const filteredContacts = getFilteredContacts();
  const filteredDocuments = getFilteredDocuments();

  const tabs = [
    {
      id: 'sales',
      label: 'Sales',
      icon: <Calendar className="w-4 h-4" />,
      count: filteredSales.length,
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
      icon: <FileUp className="w-4 h-4" />,
      count: 0,
    },
  ];

  // Define filters for each tab
  const tabFilters = {
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
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header with gradient - using CatalogListPro Indigo colors */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top bar */}
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {currentCompany?.name || 'CatalogListPro'}
              </h1>
              <p className="text-sm text-indigo-100 mt-1">
                {user?.email}
              </p>
            </div>
          </div>

          {/* Stats Cards - Single Row */}
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

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4">
        <div className="bg-white rounded-lg shadow-md">
          {/* Tab Navigation with Search and Filter */}
          <ScrollableTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabFilters={tabFilters}
            onSearch={handleSearch}
            onFilterChange={handleFilterChange}
          />

          {/* Tab Content */}
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
            {activeTab === 'reports' && (
              <ReportsAndTools />
            )}
          </div>
        </div>
      </div>

      {/* Sale Modal */}
      {showSaleModal && (
        <SaleModal
          sale={null}
          companyId={currentCompany?.id || ''}
          onClose={() => setShowSaleModal(false)}
          onSave={() => {
            setShowSaleModal(false);
            loadDashboardData();
          }}
        />
      )}
    </div>
  );
}