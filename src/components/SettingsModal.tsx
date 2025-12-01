// src/components/SettingsModal.tsx
// MOBILE-FIRST: Settings modal with comprehensive data refresh feature and progress indicator

import { useState } from 'react';
import { X, RefreshCw, Wifi, WifiOff, Edit2, Upload, Building2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'companies' | 'team' | 'profile';

interface CompanyFormData {
  name: string;
  address: string;
  phone: string;
  currency: string;
  units: string;
  logo_url: string;
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { refreshActiveSalesData, refreshProgress, currentCompany, refreshCompanies } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('companies');
  const [isOnline] = useState(navigator.onLine);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [formData, setFormData] = useState<CompanyFormData>({
    name: '',
    address: '',
    phone: '',
    currency: 'USD',
    units: 'imperial',
    logo_url: ''
  });

  if (!isOpen) return null;

  const handleRefresh = async () => {
    if (!currentCompany) {
      alert('No company selected');
      return;
    }

    await refreshActiveSalesData();
  };

  const getProgressPercentage = () => {
    if (refreshProgress.total === 0) return 0;
    return Math.round((refreshProgress.current / refreshProgress.total) * 100);
  };

  const handleEditClick = () => {
    if (currentCompany) {
      setFormData({
        name: currentCompany.name || '',
        address: currentCompany.address || '',
        phone: currentCompany.phone || '',
        currency: currentCompany.currency || 'USD',
        units: currentCompany.units || 'imperial',
        logo_url: currentCompany.logo_url || ''
      });
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData({
      name: '',
      address: '',
      phone: '',
      currency: 'USD',
      units: 'imperial',
      logo_url: ''
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentCompany) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    setIsUploadingLogo(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentCompany.id}-${Date.now()}.${fileExt}`;
      const filePath = `company-logos/${fileName}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);

      setFormData({ ...formData, logo_url: urlData.publicUrl });
      alert('Logo uploaded successfully!');
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo: ' + error.message);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSaveCompany = async () => {
    if (!currentCompany) return;

    if (!formData.name.trim()) {
      alert('Company name is required');
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: formData.name.trim(),
          address: formData.address.trim(),
          phone: formData.phone.trim(),
          currency: formData.currency,
          units: formData.units,
          logo_url: formData.logo_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentCompany.id);

      if (error) throw error;

      // Refresh companies to get updated data
      await refreshCompanies();
      
      setIsEditing(false);
      alert('Company updated successfully!');
    } catch (error: any) {
      console.error('Error updating company:', error);
      alert('Failed to update company: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col m-4">
        {/* Header with Refresh Button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
            
            {/* Connection Status Indicator */}
            <div className="flex items-center gap-2">
              {isOnline ? (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <Wifi className="w-4 h-4" />
                  <span className="hidden sm:inline">Online</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-red-600">
                  <WifiOff className="w-4 h-4" />
                  <span className="hidden sm:inline">Offline</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={refreshProgress.isRefreshing || !currentCompany}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                transition-all duration-200
                ${refreshProgress.isRefreshing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                }
                ${!currentCompany ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title="Refresh all active sales data"
            >
              <RefreshCw 
                className={`w-4 h-4 ${refreshProgress.isRefreshing ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">
                {refreshProgress.isRefreshing ? 'Refreshing...' : 'Refresh Data'}
              </span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              disabled={refreshProgress.isRefreshing}
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {refreshProgress.isRefreshing && (
          <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-indigo-900">
                {refreshProgress.stage}
              </span>
              <span className="text-sm text-indigo-600">
                {getProgressPercentage()}%
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
            
            <p className="text-xs text-indigo-600 mt-2">
              Step {refreshProgress.current} of {refreshProgress.total}
            </p>
          </div>
        )}

        {/* Success/Error Message */}
        {!refreshProgress.isRefreshing && refreshProgress.stage && (
          <div className={`
            px-6 py-3 border-b
            ${refreshProgress.stage.includes('complete') || refreshProgress.stage.includes('success')
              ? 'bg-green-50 border-green-100 text-green-800'
              : refreshProgress.stage.includes('failed') || refreshProgress.stage.includes('error')
              ? 'bg-red-50 border-red-100 text-red-800'
              : refreshProgress.stage.includes('No internet')
              ? 'bg-yellow-50 border-yellow-100 text-yellow-800'
              : 'bg-gray-50 border-gray-100 text-gray-800'
            }
          `}>
            <p className="text-sm font-medium">
              {refreshProgress.stage}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          <button
            onClick={() => setActiveTab('companies')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${activeTab === 'companies'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Companies
          </button>
          
          <button
            onClick={() => setActiveTab('team')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${activeTab === 'team'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Team
          </button>
          
          <button
            onClick={() => setActiveTab('profile')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${activeTab === 'profile'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Profile
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'companies' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Your Companies</h3>
                <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
                  + New Company
                </button>
              </div>
              
              {currentCompany && !isEditing && (
                <div className="border border-indigo-600 rounded-lg p-4 bg-indigo-50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      {/* Logo */}
                      <div className="flex-shrink-0">
                        {formData.logo_url || currentCompany.logo_url ? (
                          <img 
                            src={formData.logo_url || currentCompany.logo_url} 
                            alt="Company logo"
                            className="w-16 h-16 rounded-lg object-cover border border-indigo-200"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-indigo-100 flex items-center justify-center">
                            <Building2 className="w-8 h-8 text-indigo-600" />
                          </div>
                        )}
                      </div>

                      {/* Company Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 mb-1">{currentCompany.name}</h4>
                        {currentCompany.address && (
                          <p className="text-sm text-gray-600 mb-2">{currentCompany.address}</p>
                        )}
                        <div className="flex gap-4 text-sm text-gray-600">
                          <span>Currency: {currentCompany.currency || 'USD'}</span>
                          <span>Units: {currentCompany.units || 'imperial'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded">
                        Active
                      </span>
                      <button
                        onClick={handleEditClick}
                        className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors"
                        title="Edit company"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit Form */}
              {currentCompany && isEditing && (
                <div className="border border-indigo-600 rounded-lg p-6 bg-white">
                  <h4 className="font-semibold text-gray-900 mb-4">Edit Company</h4>
                  
                  <div className="space-y-4">
                    {/* Logo Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Company Logo
                      </label>
                      <div className="flex items-center gap-4">
                        {formData.logo_url ? (
                          <img 
                            src={formData.logo_url} 
                            alt="Company logo"
                            className="w-20 h-20 rounded-lg object-cover border border-gray-300"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-300">
                            <Building2 className="w-10 h-10 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1">
                          <label className="cursor-pointer">
                            <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors">
                              <Upload className="w-4 h-4" />
                              {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoUpload}
                              disabled={isUploadingLogo}
                              className="hidden"
                            />
                          </label>
                          <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 2MB</p>
                        </div>
                      </div>
                    </div>

                    {/* Company Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Company Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter company name"
                      />
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Address
                      </label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter company address"
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter company phone"
                      />
                    </div>

                    {/* Currency */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Currency
                      </label>
                      <select
                        value={formData.currency}
                        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="CAD">CAD ($)</option>
                        <option value="AUD">AUD ($)</option>
                      </select>
                    </div>

                    {/* Units */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Measurement Units
                      </label>
                      <select
                        value={formData.units}
                        onChange={(e) => setFormData({ ...formData, units: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="imperial">Imperial (inches, pounds)</option>
                        <option value="metric">Metric (cm, kg)</option>
                      </select>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleSaveCompany}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">About Data Refresh</h4>
                <p className="text-sm text-blue-800">
                  The <strong>Refresh Data</strong> button syncs all data for active sales including:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-blue-800">
                  <li>• Company information</li>
                  <li>• Active sales and lots</li>
                  <li>• Photos and metadata</li>
                  <li>• Contacts</li>
                  <li>• Documents</li>
                  <li>• Category lookups</li>
                </ul>
                <p className="mt-2 text-xs text-blue-700">
                  Note: Requires internet connection. Data is synced mobile-first with conflict resolution based on most recent timestamp.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Management</h3>
              <p className="text-sm text-gray-600">
                Team management features coming soon. Add team members, assign roles, and manage permissions.
              </p>
            </div>
          )}

          {activeTab === 'profile' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">User Profile</h3>
              <p className="text-sm text-gray-600">
                Profile settings coming soon. Update your personal information, preferences, and password.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={refreshProgress.isRefreshing || isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:cursor-not-allowed"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;