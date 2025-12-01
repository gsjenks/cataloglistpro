import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Document } from '../types';
import { FileText, Plus, Download, X, Upload, Edit, Trash2, ExternalLink, Maximize2, Loader, AlertCircle, Filter, Search } from 'lucide-react';

interface DocumentsListProps {
  documents: Document[];
  companyId?: string;
  saleId?: string;
  onRefresh: () => void;
}

export default function DocumentsList({ documents, companyId, saleId, onRefresh }: DocumentsListProps) {
  const [showModal, setShowModal] = useState(false);
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string>('');
  const [loadingViewer, setLoadingViewer] = useState(false);
  const [viewerError, setViewerError] = useState<string>('');
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    document_type: 'other'
  });

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Determine document types based on context
  const isSaleLevel = !!saleId;
  const isCompanyLevel = !!companyId && !saleId;

  // Company-level document types
  const companyDocumentTypes = [
    { value: 'license', label: 'License' },
    { value: 'credential', label: 'Credential' },
    { value: 'contract', label: 'Contract' },
    { value: 'form', label: 'Form' },
    { value: 'other', label: 'Other' }
  ];

  // Sale-level document types
  const saleDocumentTypes = [
    { value: 'contract', label: 'Contract' },
    { value: 'authorization', label: 'Authorization' },
    { value: 'appraisal', label: 'Appraisal' },
    { value: 'agreement', label: 'Agreement' },
    { value: 'other', label: 'Other' }
  ];

  // Company-level filter options
  const companyFilterOptions = [
    { id: 'all', label: 'All Documents', value: '' },
    { id: 'license', label: 'License', value: 'license' },
    { id: 'credential', label: 'Credential', value: 'credential' },
    { id: 'contract', label: 'Contract', value: 'contract' },
    { id: 'form', label: 'Form', value: 'form' },
    { id: 'other', label: 'Other', value: 'other' }
  ];

  // Sale-level filter options
  const saleFilterOptions = [
    { id: 'all', label: 'All Documents', value: '' },
    { id: 'contract', label: 'Contract', value: 'contract' },
    { id: 'authorization', label: 'Authorization', value: 'authorization' },
    { id: 'appraisal', label: 'Appraisal', value: 'appraisal' },
    { id: 'agreement', label: 'Agreement', value: 'agreement' },
    { id: 'other', label: 'Other', value: 'other' }
  ];

  // Select appropriate types and filters based on context
  const documentTypes = isSaleLevel ? saleDocumentTypes : companyDocumentTypes;
  const filterOptions = isSaleLevel ? saleFilterOptions : companyFilterOptions;

  // Helper function to format document type label
  const getDocumentTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      license: 'License',
      credential: 'Credential',
      contract: 'Contract',
      form: 'Form',
      authorization: 'Authorization',
      appraisal: 'Appraisal',
      agreement: 'Agreement',
      other: 'Other'
    };
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Filter and search documents
  const filteredDocuments = useMemo(() => {
    let filtered = documents;

    // Filter by type
    if (selectedTypeFilter) {
      filtered = filtered.filter(doc => doc.document_type === selectedTypeFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.name?.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.file_name?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [documents, selectedTypeFilter, searchQuery]);

  const openAddModal = () => {
    setEditingDocument(null);
    setFormData({
      name: '',
      description: '',
      document_type: 'other'
    });
    setFile(null);
    setShowModal(true);
  };

  const openEditModal = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    setEditingDocument(doc);
    setFormData({
      name: doc.name || '',
      description: doc.description || '',
      document_type: doc.document_type || 'other'
    });
    setFile(null);
    setShowModal(true);
  };

  const openViewModal = async (doc: Document) => {
    setViewingDocument(doc);
    setShowViewerModal(true);
    setLoadingViewer(true);
    setViewerError('');
    setViewerUrl('');

    try {
      if (doc.file_path) {
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 3600);

        if (error) {
          console.error('Error creating signed URL:', error);
          if (doc.file_url) {
            setViewerUrl(doc.file_url);
          } else {
            throw new Error('Unable to access document.');
          }
        } else if (data?.signedUrl) {
          setViewerUrl(data.signedUrl);
        }
      } else if (doc.file_url) {
        setViewerUrl(doc.file_url);
      } else {
        throw new Error('No file path or URL available');
      }
    } catch (error: unknown) {
      console.error('Error loading document:', error);
      setViewerError(error instanceof Error ? error.message : 'Failed to load document');
    } finally {
      setLoadingViewer(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      if (!formData.name) {
        setFormData(prev => ({
          ...prev,
          name: selectedFile.name
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingDocument && !file) {
      alert('Please select a file to upload');
      return;
    }

    setUploading(true);

    try {
      if (editingDocument) {
        const { error: dbError } = await supabase
          .from('documents')
          .update({
            name: formData.name,
            description: formData.description || null,
            document_type: formData.document_type
          })
          .eq('id', editingDocument.id);

        if (dbError) throw dbError;
      } else {
        if (!file) return;

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${companyId || 'general'}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        const { error: dbError } = await supabase
          .from('documents')
          .insert([{
            name: formData.name,
            file_name: file.name,
            description: formData.description || null,
            file_type: file.type || 'application/octet-stream',
            file_path: filePath,
            file_url: urlData.publicUrl,
            file_size: file.size,
            document_type: formData.document_type,
            company_id: companyId,
            sale_id: saleId || null
          }]);

        if (dbError) throw dbError;
      }

      setFormData({
        name: '',
        description: '',
        document_type: 'other'
      });
      setFile(null);
      setShowModal(false);
      setEditingDocument(null);
      onRefresh();
    } catch (error: unknown) {
      console.error('Error saving document:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('storage')) {
        alert('Storage bucket not found. Please set up the "documents" storage bucket in Supabase first.');
      } else {
        alert('Failed to save document: ' + message);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete "${doc.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([doc.file_path]);

        if (storageError) {
          console.warn('Error deleting file from storage:', storageError);
        }
      }

      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;

      if (viewingDocument?.id === doc.id) {
        setShowViewerModal(false);
      }

      onRefresh();
    } catch (error: unknown) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleDownload = async (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();

    try {
      let downloadUrl = '';
      
      if (doc.file_path) {
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 60);

        if (error) {
          console.error('Error creating download URL:', error);
          if (doc.file_url) {
            downloadUrl = doc.file_url;
          } else {
            throw error;
          }
        } else if (data?.signedUrl) {
          downloadUrl = data.signedUrl;
        }
      } else if (doc.file_url) {
        downloadUrl = doc.file_url;
      }

      if (!downloadUrl) {
        throw new Error('No download URL available');
      }

      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name || doc.name || 'download';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('Failed to download document');
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return 'ðŸ“„';
    if (fileType.includes('image')) return 'ðŸ–¼ï¸';
    if (fileType.includes('word') || fileType.includes('document')) return 'ðŸ“';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'ðŸ“Š';
    if (fileType.includes('video')) return 'ðŸŽ¥';
    return 'ðŸ“Ž';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const openInNewTab = () => {
    if (viewerUrl) {
      window.open(viewerUrl, '_blank');
    }
  };

  const isPdfFile = (fileType: string) => {
    return fileType?.toLowerCase().includes('pdf');
  };

  const isImageFile = (fileType: string) => {
    return fileType?.toLowerCase().includes('image');
  };

  const renderDocumentPreview = () => {
    if (loadingViewer) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50">
          <Loader className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
          <p className="text-gray-600">Loading document...</p>
        </div>
      );
    }

    if (viewerError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <p className="text-red-600 text-center mb-4">{viewerError}</p>
          <button
            onClick={openInNewTab}
            disabled={!viewerUrl}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Try Opening in New Tab
          </button>
        </div>
      );
    }

    if (!viewerUrl || !viewingDocument) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-50">
          <p className="text-gray-500">Unable to load document preview</p>
        </div>
      );
    }

    if (isPdfFile(viewingDocument.file_type || '')) {
      return (
        <iframe
          src={viewerUrl}
          className="w-full h-full border-0"
          title={viewingDocument.name}
        />
      );
    }

    if (isImageFile(viewingDocument.file_type || '')) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-50 p-4">
          <img
            src={viewerUrl}
            alt={viewingDocument.name}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
        <div className="text-6xl mb-4">{getFileIcon(viewingDocument.file_type || '')}</div>
        <p className="text-gray-600 text-center mb-6">
          Preview not available for this file type
        </p>
        <div className="flex gap-3">
          <button
            onClick={openInNewTab}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <ExternalLink className="w-4 h-4" />
            Open in New Tab
          </button>
          <button
            onClick={(e) => viewingDocument && handleDownload(e, viewingDocument)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </div>
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTypeFilter('');
  };

  const hasActiveFilters = searchQuery || selectedTypeFilter;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Documents
        </h2>
        <button
        data-add-document         // â† ADD THIS LINE
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by name, description, or filename..."
              className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Type Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`
                flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap
                ${selectedTypeFilter
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              <Filter className="w-4 h-4" />
              <span>
                {selectedTypeFilter 
                  ? filterOptions.find(f => f.value === selectedTypeFilter)?.label 
                  : 'Filter by Type'}
              </span>
              {selectedTypeFilter && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTypeFilter('');
                  }}
                  className="ml-1 hover:bg-indigo-100 rounded-full p-0.5"
                  role="button"
                  tabIndex={0}
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </button>

            {/* Filter Dropdown Menu */}
            {showFilterDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowFilterDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                  <div className="py-1">
                    {filterOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => {
                          setSelectedTypeFilter(option.value);
                          setShowFilterDropdown(false);
                        }}
                        className={`
                          w-full text-left px-4 py-2 text-sm transition-colors
                          ${selectedTypeFilter === option.value
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-50'
                          }
                        `}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Results Count */}
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <span>
            Showing {filteredDocuments.length} of {documents.length} documents
          </span>
          {hasActiveFilters && (
            <span className="text-indigo-600">
              {searchQuery && `"${searchQuery}"`}
              {searchQuery && selectedTypeFilter && ' â€¢ '}
              {selectedTypeFilter && filterOptions.find(f => f.value === selectedTypeFilter)?.label}
            </span>
          )}
        </div>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FileText className="w-12 h-12 text-gray-400 mb-4" />
          {documents.length === 0 ? (
            <>
              <p className="text-sm text-gray-600 mb-4">No documents yet</p>
              <button
                onClick={openAddModal}
                className="text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
              >
                Upload your first document
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-2">No documents match your filters</p>
              <button
                onClick={clearFilters}
                className="text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
              >
                Clear filters to see all documents
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              onClick={() => openViewModal(doc)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer group relative"
            >
              {/* Action buttons */}
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openViewModal(doc);
                  }}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shadow-sm"
                  aria-label="View document"
                  title="View"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDownload(e, doc)}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-all shadow-sm"
                  aria-label="Download document"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => openEditModal(e, doc)}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shadow-sm"
                  aria-label="Edit document"
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, doc)}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-all shadow-sm"
                  aria-label="Delete document"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-start gap-3 mb-3">
                <div className="text-3xl flex-shrink-0">{getFileIcon(doc.file_type || '')}</div>
                <div className="flex-1 min-w-0 pr-20">
                  <h3 className="font-semibold text-gray-900 text-base truncate hover:text-indigo-600 transition-colors">
                    {doc.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {doc.file_name && doc.file_name !== doc.name && (
                      <span className="block truncate">{doc.file_name}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-block px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                    {getDocumentTypeLabel(doc.document_type || 'other')}
                  </span>
                  {doc.file_size && (
                    <span className="text-gray-500">
                      {formatFileSize(doc.file_size)}
                    </span>
                  )}
                </div>

                {doc.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {doc.description}
                  </p>
                )}

                {doc.created_at && (
                  <p className="text-xs text-gray-500">
                    Uploaded {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document Viewer Modal */}
      {showViewerModal && viewingDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-white rounded-t-lg flex-shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-2xl">{getFileIcon(viewingDocument.file_type || '')}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 truncate">
                    {viewingDocument.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="capitalize">{getDocumentTypeLabel(viewingDocument?.document_type || 'other')}</span>
                    {viewingDocument.file_size && (
                      <>
                        <span>â€¢</span>
                        <span>{formatFileSize(viewingDocument.file_size)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <button
                  onClick={openInNewTab}
                  disabled={!viewerUrl}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => handleDownload(e, viewingDocument)}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowViewerModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {renderDocumentPreview()}
            </div>

            {viewingDocument.description && !loadingViewer && !viewerError && (
              <div className="border-t border-gray-200 px-6 py-3 bg-gray-50 rounded-b-lg flex-shrink-0">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Description:</span> {viewingDocument.description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Document Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingDocument ? 'Edit Document' : 'Upload Document'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setFile(null);
                  setEditingDocument(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {!editingDocument && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select File *
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      required
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <Upload className="w-10 h-10 text-gray-400 mb-2" />
                      {file ? (
                        <div className="text-sm">
                          <p className="font-medium text-gray-900">{file.name}</p>
                          <p className="text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                      ) : (
                        <div className="text-sm">
                          <p className="text-indigo-600 font-medium">Click to upload</p>
                          <p className="text-gray-500">or drag and drop</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}

              {editingDocument && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Current File:</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getFileIcon(editingDocument.file_type || '')}</span>
                    <div>
                      <p className="font-medium text-gray-900">{editingDocument.file_name}</p>
                      {editingDocument.file_size && (
                        <p className="text-sm text-gray-500">{formatFileSize(editingDocument.file_size)}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Note: To replace the file, delete this document and upload a new one.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Sales Agreement, Invoice, Photo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type *
                </label>
                <select
                  value={formData.document_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, document_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {documentTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {isSaleLevel && 'Sale-level documents: Contract, Authorization, Appraisal, Agreement, Other'}
                  {isCompanyLevel && 'Company-level documents: License, Credential, Contract, Form, Other'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Optional description or notes about this document..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFile(null);
                    setEditingDocument(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || (!editingDocument && !file)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {uploading ? (editingDocument ? 'Saving...' : 'Uploading...') : (editingDocument ? 'Update' : 'Upload')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * âœ… STANDALONE VERSION - NO EXTERNAL UTILS NEEDED
 * 
 * This version includes everything inline:
 * - Document type definitions
 * - Filter options
 * - Helper functions
 * - Search and filter logic
 * 
 * Just replace your DocumentsList.tsx with this file and it will work!
 */