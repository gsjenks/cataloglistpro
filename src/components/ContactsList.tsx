import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Contact } from '../types';
import { Users, Plus, Mail, Phone, X, Edit, Trash2, MapPin, Building2, Briefcase } from 'lucide-react';

interface ContactsListProps {
  contacts: Contact[];
  companyId?: string;
  saleId?: string;
  onRefresh: () => void;
}

export default function ContactsList({ contacts, companyId, saleId, onRefresh }: ContactsListProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    prefix: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    business_name: '',
    role: '',
    contact_type: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    notes: ''
  });

  const openAddModal = () => {
    setEditingContact(null);
    setFormData({
      prefix: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      suffix: '',
      business_name: '',
      role: '',
      contact_type: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip_code: '',
      notes: ''
    });
    setShowModal(true);
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      prefix: contact.prefix || '',
      first_name: contact.first_name || '',
      middle_name: contact.middle_name || '',
      last_name: contact.last_name || '',
      suffix: contact.suffix || '',
      business_name: contact.business_name || '',
      role: contact.role || '',
      contact_type: (contact as any).contact_type || '',
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
      city: contact.city || '',
      state: contact.state || '',
      zip_code: contact.zip_code || '',
      notes: contact.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingContact) {
        // UPDATE existing contact
        const { error } = await supabase
          .from('contacts')
          .update(formData)
          .eq('id', editingContact.id);

        if (error) throw error;
      } else {
        // CREATE new contact
        const contactData = {
          ...formData,
          company_id: companyId,
          sale_id: saleId || null
        };

        const { error } = await supabase
          .from('contacts')
          .insert([contactData]);

        if (error) throw error;
      }

      // Reset form and close modal
      setFormData({
        prefix: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        suffix: '',
        business_name: '',
        role: '',
        contact_type: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zip_code: '',
        notes: ''
      });
      setShowModal(false);
      setEditingContact(null);
      onRefresh();
    } catch (error) {
      console.error('Error saving contact:', error);
      alert('Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    const contactName = getContactName(contact);
    if (!confirm(`Are you sure you want to delete "${contactName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contact.id);

      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('Failed to delete contact');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // Helper function to format contact name
  const getContactName = (contact: Contact) => {
    const nameParts = [
      contact.prefix,
      contact.first_name,
      contact.middle_name,
      contact.last_name,
      contact.suffix
    ].filter(Boolean);
    
    return nameParts.join(' ');
  };

  // Helper function to format address
  const getFullAddress = (contact: Contact) => {
    const parts = [];
    if (contact.address) parts.push(contact.address);
    
    const cityStateZip = [contact.city, contact.state, contact.zip_code]
      .filter(Boolean)
      .join(', ');
    
    if (cityStateZip) parts.push(cityStateZip);
    
    return parts.join(', ');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-all"
          onClick={openAddModal}
        >
          <Plus className="w-4 h-4" />
          New Contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Users className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 mb-4">No contacts yet</p>
          <button
          data-add-contact
            className="text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
            onClick={openAddModal}
          >
            Add your first contact
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow group relative"
            >
              {/* Action buttons - Top Right */}
              <div className="absolute top-4 right-4 flex items-center gap-1 z-10">
                <button
                  onClick={() => openEditModal(contact)}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shadow-sm"
                  aria-label="Edit contact"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(contact)}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-all shadow-sm"
                  aria-label="Delete contact"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Contact Details */}
              <div className="space-y-3 pr-20">
                {/* Name */}
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">
                      {getContactName(contact) || 'Unnamed Contact'}
                    </p>
                  </div>
                </div>

                {/* Business Info */}
                {(contact.business_name || (contact as any).contact_type || contact.role) && (
                  <div className="space-y-2">
                    {contact.business_name && (
                      <div className="flex items-center gap-3 text-sm">
                        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-700">{contact.business_name}</span>
                      </div>
                    )}
                    {(contact as any).contact_type && (
                      <div className="flex items-center gap-3 text-sm">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                          {(contact as any).contact_type.charAt(0).toUpperCase() + (contact as any).contact_type.slice(1)}
                        </span>
                      </div>
                    )}
                    {contact.role && (
                      <div className="flex items-center gap-3 text-sm">
                        <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-600">{contact.role}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Contact Methods */}
                {(contact.email || contact.phone) && (
                  <div className="space-y-2">
                    {contact.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <a 
                          href={`mailto:${contact.email}`}
                          className="text-indigo-600 hover:text-indigo-700 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {contact.email}
                        </a>
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-3 text-sm">
                        <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <a 
                          href={`tel:${contact.phone}`}
                          className="text-gray-700 hover:text-indigo-600"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {contact.phone}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Address */}
                {getFullAddress(contact) && (
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-600">{getFullAddress(contact)}</span>
                  </div>
                )}

                {/* Notes */}
                {contact.notes && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-sm text-gray-600 italic">{contact.notes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingContact ? 'Edit Contact' : 'New Contact'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingContact(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Personal Name */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Personal Information</h4>
                <div className="grid grid-cols-6 gap-3">
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prefix
                    </label>
                    <select
                      name="prefix"
                      value={formData.prefix}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-</option>
                      <option value="Mr.">Mr.</option>
                      <option value="Mrs.">Mrs.</option>
                      <option value="Ms.">Ms.</option>
                      <option value="Dr.">Dr.</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Middle
                    </label>
                    <input
                      type="text"
                      name="middle_name"
                      value={formData.middle_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Business Information */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Business Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Business Name
                    </label>
                    <input
                      type="text"
                      name="business_name"
                      value={formData.business_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Type
                    </label>
                    <select
                      name="contact_type"
                      value={formData.contact_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select type...</option>
                      {saleId ? (
                        // Sale level options
                        <>
                          <option value="client">Client</option>
                          <option value="realtor">Realtor</option>
                          <option value="appraiser">Appraiser</option>
                          <option value="executor">Executor</option>
                          <option value="contractor">Contractor</option>
                          <option value="emergency">Emergency</option>
                          <option value="other">Other</option>
                        </>
                      ) : (
                        // Business level options
                        <>
                          <option value="staff">Staff</option>
                          <option value="buyer">Buyer</option>
                          <option value="contractor">Contractor</option>
                          <option value="appraiser">Appraiser</option>
                          <option value="attorney">Attorney</option>
                          <option value="other">Other</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role/Title
                    </label>
                    <input
                      type="text"
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      placeholder="e.g., Estate Executor, Buyer"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Contact Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Address</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        maxLength={2}
                        placeholder="GA"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Zip Code
                      </label>
                      <input
                        type="text"
                        name="zip_code"
                        value={formData.zip_code}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Additional notes about this contact..."
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingContact(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : editingContact ? 'Update Contact' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}