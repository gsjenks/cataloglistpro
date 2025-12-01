import React, { useState, useEffect } from 'react';
import type { Document } from '../types';
import { supabase } from '../lib/supabase';
import { X, Upload } from 'lucide-react';

interface DocumentModalProps {
  document: Document | null;
  companyId?: string;
  saleId?: string;
  onClose: () => void;
  onSave: () => void;
}

export default function DocumentModal({ document, companyId, saleId, onClose, onSave }: DocumentModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    document_type: 'other',
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (document) {
      setFormData({
        name: document.name || '',
        description: document.description || '',
        document_type: document.document_type || 'other',
      });
    }
  }, [document]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validation
    if (!formData.name) {
      setError('Please provide a document name');
      setLoading(false);
      return;
    }

    if (!document && !file) {
      setError('Please select a file to upload');
      setLoading(false);
      return;
    }

    try {
      let uploadedFilePath = document?.file_path;
      let uploadedFileName = document?.file_name;
      let uploadedFileType = document?.file_type;
      let uploadedFileSize = document?.file_size;

      // Upload file if new file selected
      if (file) {
        setUploading(true);
        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `${Date.now()}.${fileExt}`;
        uploadedFilePath = `documents/${uniqueFileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(uploadedFilePath, file);

        if (uploadError) throw uploadError;

        uploadedFileName = file.name;
        uploadedFileType = file.type;
        uploadedFileSize = file.size;
        setUploading(false);
      }

      const documentData = {
        ...formData,
        company_id: companyId || null,
        sale_id: saleId || null,
        file_path: uploadedFilePath,
        file_name: uploadedFileName,
        file_type: uploadedFileType,
        file_size: uploadedFileSize,
      };

      if (document) {
        // Update existing document
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            ...documentData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', document.id);

        if (updateError) throw updateError;
      } else {
        // Create new document
        const { error: insertError } = await supabase
          .from('documents')
          .insert(documentData);

        if (insertError) throw insertError;
      }

      onSave();
    } catch (err: any) {
      console.error('Error saving document:', err);
      setError(err.message || 'Failed to save document');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {document ? 'Edit Document' : 'New Document'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 text-red-600 rounded-md border border-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Document Name *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
              placeholder="Contract Agreement"
            />
          </div>

          <div>
            <label htmlFor="document_type" className="block text-sm font-medium text-gray-700 mb-1">
              Document Type *
            </label>
            <select
              id="document_type"
              name="document_type"
              value={formData.document_type}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
            >
              <option value="contract">Contract</option>
              <option value="invoice">Invoice</option>
              <option value="receipt">Receipt</option>
              <option value="report">Report</option>
              <option value="insurance">Insurance</option>
              <option value="license">License</option>
              <option value="will">Will</option>
              <option value="form">Form</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all resize-none"
              placeholder="Additional details about this document..."
            />
          </div>

          {/* File Upload */}
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-1">
              {document ? 'Replace File (optional)' : 'File *'}
            </label>
            <div className="relative">
              <input
                id="file"
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
              />
              <label
                htmlFor="file"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-md hover:border-indigo-400 transition-all cursor-pointer bg-gray-50 hover:bg-gray-100"
              >
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {file ? file.name : document ? document.file_name : 'Click to select file'}
                </span>
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Supported: PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG
            </p>
          </div>

          {/* Current file info for edit mode */}
          {document && !file && (
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
              <p className="text-xs text-gray-600 mb-1">Current file:</p>
              <p className="text-sm font-medium text-gray-900">{document.file_name}</p>
              {document.file_size && (
                <p className="text-xs text-gray-500 mt-1">
                  Size: {(document.file_size / 1024).toFixed(2)} KB
                </p>
              )}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              {uploading ? 'Uploading...' : loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}