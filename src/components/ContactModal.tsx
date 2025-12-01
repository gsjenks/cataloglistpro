import React, { useState, useEffect } from 'react';
import type { Contact } from '../types';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

interface ContactModalProps {
  contact: Contact | null;
  companyId?: string;
  saleId?: string;
  onClose: () => void;
  onSave: () => void;
}

export default function ContactModal({ contact, companyId, saleId, onClose, onSave }: ContactModalProps) {
  const [formData, setFormData] = useState({
    prefix: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    business_name: '',
    role: '',
    contact_type: 'other',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (contact) {
      setFormData({
        prefix: contact.prefix || '',
        first_name: contact.first_name || '',
        middle_name: contact.middle_name || '',
        last_name: contact.last_name || '',
        suffix: contact.suffix || '',
        business_name: contact.business_name || '',
        role: contact.role || '',
        contact_type: (contact as any).contact_type || 'other',
        email: contact.email || '',
        phone: contact.phone || '',
        address: contact.address || '',
        city: contact.city || '',
        state: contact.state || '',
        zip_code: contact.zip_code || '',
        notes: contact.notes || '',
      });
    }
  }, [contact]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validation
    if (!formData.first_name && !formData.business_name) {
      setError('Please provide either a first name or business name');
      setLoading(false);
      return;
    }

    try {
      const contactData = {
        ...formData,
        company_id: companyId || null,
        sale_id: saleId || null,
      };

      if (contact) {
        // Update existing contact
        const { error: updateError } = await supabase
          .from('contacts')
          .update({
            ...contactData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contact.id);

        if (updateError) throw updateError;
      } else {
        // Create new contact
        const { error: insertError } = await supabase
          .from('contacts')
          .insert(contactData);

        if (insertError) throw insertError;
      }

      onSave();
    } catch (err: any) {
      console.error('Error saving contact:', err);
      setError(err.message || 'Failed to save contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {contact ? 'Edit Contact' : 'New Contact'}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(90vh-130px)] overflow-y-auto">
          {/* Name Fields */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-2">
              <label htmlFor="prefix" className="block text-sm font-medium text-gray-700 mb-1">
                Prefix
              </label>
              <input
                id="prefix"
                name="prefix"
                type="text"
                value={formData.prefix}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="Mr."
              />
            </div>
            <div className="col-span-4">
              <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                value={formData.first_name}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="John"
              />
            </div>
            <div className="col-span-3">
              <label htmlFor="middle_name" className="block text-sm font-medium text-gray-700 mb-1">
                Middle
              </label>
              <input
                id="middle_name"
                name="middle_name"
                type="text"
                value={formData.middle_name}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="M."
              />
            </div>
            <div className="col-span-3">
              <label htmlFor="suffix" className="block text-sm font-medium text-gray-700 mb-1">
                Suffix
              </label>
              <input
                id="suffix"
                name="suffix"
                type="text"
                value={formData.suffix}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="Jr."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                value={formData.last_name}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="Smith"
              />
            </div>
            <div>
              <label htmlFor="business_name" className="block text-sm font-medium text-gray-700 mb-1">
                Business Name
              </label>
              <input
                id="business_name"
                name="business_name"
                type="text"
                value={formData.business_name}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="Acme Corp"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="contact_type" className="block text-sm font-medium text-gray-700 mb-1">
                Contact Type *
              </label>
              <select
                id="contact_type"
                name="contact_type"
                value={formData.contact_type}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
              >
                <option value="staff">Staff</option>
                <option value="buyer">Buyer</option>
                <option value="contractor">Contractor</option>
                <option value="appraiser">Appraiser</option>
                <option value="attorney">Attorney</option>
                <option value="executor">Executor</option>
                <option value="real_estate_agent">Real Estate Agent</option>
                <option value="house_manager">House Manager</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <input
                id="role"
                name="role"
                type="text"
                value={formData.role}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="Project Manager"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <input
              id="address"
              name="address"
              type="text"
              value={formData.address}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                value={formData.city}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="Atlanta"
              />
            </div>
            <div className="col-span-1">
              <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                id="state"
                name="state"
                type="text"
                value={formData.state}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="GA"
                maxLength={2}
              />
            </div>
            <div className="col-span-1">
              <label htmlFor="zip_code" className="block text-sm font-medium text-gray-700 mb-1">
                Zip Code
              </label>
              <input
                id="zip_code"
                name="zip_code"
                type="text"
                value={formData.zip_code}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                placeholder="30301"
              />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all resize-none"
              placeholder="Additional notes..."
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}