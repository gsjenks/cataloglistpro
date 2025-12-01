// src/components/CompanySetup.tsx
// CORRECTED: Creates company in BOTH companies table AND user_companies join table

import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { Building2, ArrowRight } from 'lucide-react';

export default function CompanySetup() {
  const { user, refreshCompanies } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    currency: 'USD',
    units: 'imperial',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be logged in to create a company');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🏢 Creating company:', formData.name);

      // Step 1: Create the company with user_id
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert([
          {
            name: formData.name,
            address: formData.address || null,
            phone: formData.phone || null,
            currency: formData.currency,
            units: formData.units,
            user_id: user.id, // Set the owner
          },
        ])
        .select()
        .single();

      if (companyError) {
        console.error('❌ Error creating company:', companyError);
        throw companyError;
      }

      console.log('✅ Company created:', company.id);

      // Step 2: Create entry in user_companies join table
      const { error: userCompanyError } = await supabase
        .from('user_companies')
        .insert([
          {
            user_id: user.id,
            company_id: company.id,
            role: 'owner', // User who creates is owner
          },
        ]);

      if (userCompanyError) {
        console.error('❌ Error creating user_company link:', userCompanyError);
        // This is critical - if this fails, we should clean up the company
        
        // Try to delete the company we just created
        await supabase.from('companies').delete().eq('id', company.id);
        
        throw new Error('Failed to link company to user. Please try again.');
      }

      console.log('✅ User-company link created');

      // Step 3: Refresh companies to load the new one
      console.log('🔄 Refreshing companies...');
      await refreshCompanies();

      console.log('✅ Company setup complete!');
    } catch (err: unknown) {
      console.error('❌ Failed to create company:', err);
      setError(err instanceof Error ? err.message : 'Failed to create company. Please try again.');
      setLoading(false);
    }
    // Note: Don't setLoading(false) on success - let the app redirect
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 pt-12 pb-32 px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl mb-4 shadow-lg">
            <Building2 className="w-10 h-10 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            Welcome to CatalogListPro!
          </h1>
          <p className="text-indigo-100 text-lg">
            Let's set up your first company
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className="max-w-md mx-auto px-4 -mt-20">
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Create Your Company
            </h2>
            <p className="text-gray-600">
              You can add more companies later from settings
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-2xl text-sm font-medium bg-red-50 text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Company Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900 placeholder-gray-400"
                placeholder="e.g., ABC Auction House"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                Address (Optional)
              </label>
              <input
                id="address"
                name="address"
                type="text"
                value={formData.address}
                onChange={handleChange}
                className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900 placeholder-gray-400"
                placeholder="123 Main St, City, State ZIP"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone (Optional)
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900 placeholder-gray-400"
                placeholder="(555) 123-4567"
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-2">
                  Currency
                </label>
                <select
                  id="currency"
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900"
                  disabled={loading}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (•)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
              </div>

              <div>
                <label htmlFor="units" className="block text-sm font-medium text-gray-700 mb-2">
                  Units
                </label>
                <select
                  id="units"
                  name="units"
                  value={formData.units}
                  onChange={handleChange}
                  className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900"
                  disabled={loading}
                >
                  <option value="imperial">Imperial</option>
                  <option value="metric">Metric</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-4 rounded-2xl font-bold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 mt-6"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating Company...</span>
                </div>
              ) : (
                <>
                  <span>Create Company</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-6">
            Signed in as: <strong>{user?.email}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}