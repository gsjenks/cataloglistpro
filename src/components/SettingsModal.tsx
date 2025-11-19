// src/components/SettingsModal.tsx
// MOBILE-FIRST: Settings modal with comprehensive data refresh feature and progress indicator

import { useState } from 'react';
import { X, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'companies' | 'team' | 'profile';

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { refreshActiveSalesData, refreshProgress, currentCompany } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('companies');
  const [isOnline] = useState(navigator.onLine);

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
              
              {currentCompany && (
                <div className="border border-indigo-600 rounded-lg p-4 bg-indigo-50">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{currentCompany.name}</h4>
                    <span className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded">
                      Active
                    </span>
                  </div>
                  
                  {currentCompany.address && (
                    <p className="text-sm text-gray-600 mb-2">{currentCompany.address}</p>
                  )}
                  
                  <div className="flex gap-4 text-sm text-gray-600">
                    <span>Currency: {currentCompany.currency || 'USD'}</span>
                    <span>Units: {currentCompany.units || 'imperial'}</span>
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
            disabled={refreshProgress.isRefreshing}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;