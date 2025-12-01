// src/components/Header.tsx
// MOBILE-FIRST: Header component with StatusBar safe zone and Settings modal trigger

import { useState } from 'react';
import { Settings, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext';
import SettingsModal from './SettingsModal';
import StatusBar from './StatusBar';

function Header() {
  const { currentCompany, companies, setCurrentCompany, signOut } = useApp();
  const [showSettings, setShowSettings] = useState(false);
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);

  const handleSignOut = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await signOut();
    }
  };

  return (
    <>
      {/* Safe Zone Status Bar */}
      <StatusBar />
      
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-indigo-600">CatalogListPro</h1>
            
            {/* Company Selector */}
            {currentCompany && companies.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowCompanyMenu(!showCompanyMenu)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="hidden sm:inline">{currentCompany.name}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Company Dropdown */}
                {showCompanyMenu && companies.length > 1 && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    <div className="py-1">
                      {companies.map((company) => (
                        <button
                          key={company.id}
                          onClick={() => {
                            setCurrentCompany(company);
                            setShowCompanyMenu(false);
                          }}
                          className={`
                            w-full text-left px-4 py-2 text-sm hover:bg-gray-50
                            ${company.id === currentCompany.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}
                          `}
                        >
                          {company.name}
                          {company.id === currentCompany.id && (
                            <span className="ml-2 text-xs">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />

      {/* Overlay for company menu */}
      {showCompanyMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowCompanyMenu(false)}
        />
      )}
    </>
  );
}

export default Header;