// Document Type Filters Utility
// Use this to get the correct filter options based on context

export interface DocumentTypeFilter {
  id: string;
  label: string;
  value: string;
}

/**
 * Company-level document type filters
 * Types: License, Credential, Contract, Form, Other
 */
export const COMPANY_DOCUMENT_TYPE_FILTERS: DocumentTypeFilter[] = [
  { id: 'all', label: 'All Documents', value: '' },
  { id: 'license', label: 'License', value: 'license' },
  { id: 'credential', label: 'Credential', value: 'credential' },
  { id: 'contract', label: 'Contract', value: 'contract' },
  { id: 'form', label: 'Form', value: 'form' },
  { id: 'other', label: 'Other', value: 'other' }
];

/**
 * Sale-level document type filters
 * Types: Contract, Authorization, Appraisal, Agreement, Other
 */
export const SALE_DOCUMENT_TYPE_FILTERS: DocumentTypeFilter[] = [
  { id: 'all', label: 'All Documents', value: '' },
  { id: 'contract', label: 'Contract', value: 'contract' },
  { id: 'authorization', label: 'Authorization', value: 'authorization' },
  { id: 'appraisal', label: 'Appraisal', value: 'appraisal' },
  { id: 'agreement', label: 'Agreement', value: 'agreement' },
  { id: 'other', label: 'Other', value: 'other' }
];

/**
 * Get the appropriate document type filters based on context
 * @param isSaleLevel - Whether this is for sale-level documents
 * @returns Array of filter options
 */
export const getDocumentTypeFilters = (isSaleLevel: boolean): DocumentTypeFilter[] => {
  return isSaleLevel ? SALE_DOCUMENT_TYPE_FILTERS : COMPANY_DOCUMENT_TYPE_FILTERS;
};

/**
 * Company-level document types (for dropdowns)
 */
export const COMPANY_DOCUMENT_TYPES = [
  { value: 'license', label: 'License' },
  { value: 'credential', label: 'Credential' },
  { value: 'contract', label: 'Contract' },
  { value: 'form', label: 'Form' },
  { value: 'other', label: 'Other' }
];

/**
 * Sale-level document types (for dropdowns)
 */
export const SALE_DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contract' },
  { value: 'authorization', label: 'Authorization' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'other', label: 'Other' }
];

/**
 * Get the appropriate document types for dropdown based on context
 * @param isSaleLevel - Whether this is for sale-level documents
 * @returns Array of document type options
 */
export const getDocumentTypes = (isSaleLevel: boolean) => {
  return isSaleLevel ? SALE_DOCUMENT_TYPES : COMPANY_DOCUMENT_TYPES;
};

/**
 * Get a formatted label for a document type
 * @param type - The document type value
 * @returns Formatted label
 */
export const getDocumentTypeLabel = (type: string): string => {
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

/**
 * Filter documents by type
 * @param documents - Array of documents to filter
 * @param filterValue - The filter value (empty string = all documents)
 * @returns Filtered documents
 */
export const filterDocumentsByType = <T extends { document_type?: string }>(
  documents: T[],
  filterValue: string
): T[] => {
  if (!filterValue) return documents;
  return documents.filter(doc => doc.document_type === filterValue);
};

/**
 * Get document count by type
 * @param documents - Array of documents
 * @param type - The document type to count
 * @returns Count of documents with that type
 */
export const getDocumentCountByType = <T extends { document_type?: string }>(
  documents: T[],
  type: string
): number => {
  if (!type) return documents.length;
  return documents.filter(doc => doc.document_type === type).length;
};

/**
 * Get document statistics by type
 * @param documents - Array of documents
 * @returns Object with counts for each type
 */
export const getDocumentStats = <T extends { document_type?: string }>(
  documents: T[]
): Record<string, number> => {
  return documents.reduce((stats, doc) => {
    const type = doc.document_type || 'other';
    stats[type] = (stats[type] || 0) + 1;
    return stats;
  }, {} as Record<string, number>);
};

// Export all at once for convenience
export default {
  COMPANY_DOCUMENT_TYPE_FILTERS,
  SALE_DOCUMENT_TYPE_FILTERS,
  COMPANY_DOCUMENT_TYPES,
  SALE_DOCUMENT_TYPES,
  getDocumentTypeFilters,
  getDocumentTypes,
  getDocumentTypeLabel,
  filterDocumentsByType,
  getDocumentCountByType,
  getDocumentStats
};