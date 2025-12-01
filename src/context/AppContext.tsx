// src/context/AppContext.tsx
// MOBILE-FIRST: Added refreshActiveSalesData for comprehensive sync with progress tracking

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Company } from '../types';
import SyncService from '../services/SyncService';

interface RefreshProgress {
  stage: string;
  current: number;
  total: number;
  isRefreshing: boolean;
}

interface AppContextType {
  user: User | null;
  loading: boolean;
  currentCompany: Company | null;
  companies: Company[];
  setCurrentCompany: (company: Company) => void;
  companySwitched: boolean;
  setCompanySwitched: (switched: boolean) => void;
  refreshCompanies: () => Promise<void>;
  refreshActiveSalesData: () => Promise<void>;
  refreshProgress: RefreshProgress;
  signOut: () => Promise<void>;
  isPasswordRecovery: boolean;
  setIsPasswordRecovery: (isRecovery: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper: Wraps a promise with a timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySwitched, setCompanySwitched] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress>({
    stage: '',
    current: 0,
    total: 0,
    isRefreshing: false,
  });
  
  const loadingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const companiesLoadedRef = useRef(false);

  const loadCompanies = async (userId: string, isInitialLoad: boolean = false) => {
    try {
      console.log('[LOAD] Loading companies for user:', userId);
      
      if (companiesLoadedRef.current && !isInitialLoad) {
        console.log('[OK] Companies already loaded, skipping reload');
        return;
      }
      
      const [ownedResult, linkedResult] = await Promise.allSettled([
        withTimeout(
          (async () => {
            return await supabase
              .from('companies')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false });
          })(),
          5000,
          'Owned companies query timeout'
        ),
        
        withTimeout(
          (async () => {
            return await supabase
              .from('user_companies')
              .select('company_id, role, companies(*)')
              .eq('user_id', userId);
          })(),
          5000,
          'User companies query timeout'
        )
      ]);

      let ownedCompanies: Company[] = [];
      if (ownedResult.status === 'fulfilled') {
        const { data, error } = ownedResult.value;
        if (error) {
          console.error('âŒ Error loading owned companies:', error);
        } else if (data) {
          ownedCompanies = data;
          console.log('[OK] Owned companies:', ownedCompanies.length);
        }
      } else {
        console.error('âŒ Owned companies query failed:', ownedResult.reason);
      }

      const linkedCompanies: Company[] = [];
      if (linkedResult.status === 'fulfilled') {
        const { data, error } = linkedResult.value;
        if (error) {
          console.error('âŒ Error loading user_companies:', error);
        } else if (data) {
          data.forEach((uc: { companies?: Company | Company[] }) => {
            if (uc.companies && typeof uc.companies === 'object' && !Array.isArray(uc.companies)) {
              linkedCompanies.push(uc.companies as Company);
            }
          });
          console.log('[OK] User_companies relationships:', linkedCompanies.length);
        }
      } else {
        console.error('âŒ User companies query failed:', linkedResult.reason);
      }

      if (ownedCompanies.length === 0 && linkedCompanies.length === 0) {
        console.warn('[WARN] Both queries failed or returned no data - checking cache');
        
        const cachedCompanies = localStorage.getItem('cachedCompanies');
        if (cachedCompanies) {
          try {
            const parsed = JSON.parse(cachedCompanies);
            if (parsed && parsed.length > 0) {
              console.log('[OK] Using cached companies:', parsed.length);
              setCompanies(parsed);
              
              const savedCompanyId = localStorage.getItem('currentCompanyId');
              if (savedCompanyId) {
                const saved = parsed.find((c: Company) => c.id === savedCompanyId);
                if (saved) {
                  setCurrentCompanyState(saved);
                  console.log('[OK] Restored cached company:', saved.name);
                  companiesLoadedRef.current = true;
                  return;
                }
              }
              
              if (parsed.length > 0) {
                setCurrentCompanyState(parsed[0]);
                localStorage.setItem('currentCompanyId', parsed[0].id);
                console.log('[OK] Using first cached company:', parsed[0].name);
                companiesLoadedRef.current = true;
                return;
              }
            }
          } catch (e) {
            console.error('âŒ Failed to parse cached companies:', e);
          }
        }
        
        console.error('âŒ No companies loaded and no cache available');
        setCompanies([]);
        setCurrentCompanyState(null);
        localStorage.removeItem('currentCompanyId');
        return;
      }

      const allCompaniesMap = new Map<string, Company>();
      
      ownedCompanies.forEach(company => allCompaniesMap.set(company.id, company));
      linkedCompanies.forEach(company => allCompaniesMap.set(company.id, company));

      const companiesData = Array.from(allCompaniesMap.values())
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

      console.log('[OK] Total companies found:', companiesData.length);
      if (companiesData.length > 0) {
        console.log('   Companies:', companiesData.map(c => c.name).join(', '));
      }
      
      setCompanies(companiesData);
      companiesLoadedRef.current = true;

      try {
        localStorage.setItem('cachedCompanies', JSON.stringify(companiesData));
      } catch (e) {
        console.error('Failed to cache companies:', e);
      }

      const savedCompanyId = localStorage.getItem('currentCompanyId');
      
      if (savedCompanyId && companiesData.length > 0) {
        const saved = companiesData.find((c) => c.id === savedCompanyId);
        if (saved) {
          console.log('[OK] Setting saved company:', saved.name);
          setCurrentCompanyState(saved);
        } else {
          console.log('[WARN] Saved company not found, using first company');
          setCurrentCompanyState(companiesData[0]);
          localStorage.setItem('currentCompanyId', companiesData[0].id);
        }
      } else if (companiesData.length > 0) {
        console.log('[OK] Setting first company:', companiesData[0].name);
        setCurrentCompanyState(companiesData[0]);
        localStorage.setItem('currentCompanyId', companiesData[0].id);
      } else {
        console.log('[WARN] No companies found - showing setup');
        setCurrentCompanyState(null);
        localStorage.removeItem('currentCompanyId');
      }
    } catch (error) {
      console.error('âŒ Failed to load companies:', error);
      
      const cachedCompanies = localStorage.getItem('cachedCompanies');
      if (cachedCompanies) {
        try {
          const parsed = JSON.parse(cachedCompanies);
          if (parsed && parsed.length > 0) {
            console.log('[OK] Using cached companies after error:', parsed.length);
            setCompanies(parsed);
            
            const savedCompanyId = localStorage.getItem('currentCompanyId');
            if (savedCompanyId) {
              const saved = parsed.find((c: Company) => c.id === savedCompanyId);
              if (saved) {
                setCurrentCompanyState(saved);
                companiesLoadedRef.current = true;
                return;
              }
            }
            
            if (parsed.length > 0) {
              setCurrentCompanyState(parsed[0]);
              localStorage.setItem('currentCompanyId', parsed[0].id);
              companiesLoadedRef.current = true;
              return;
            }
          }
        } catch (e) {
          console.error('âŒ Failed to use cached companies:', e);
        }
      }
      
      setCompanies([]);
      setCurrentCompanyState(null);
      localStorage.removeItem('currentCompanyId');
    }
  };

  const setCurrentCompany = (company: Company) => {
    console.log('[SYNC] Switching to company:', company.name);
    setCurrentCompanyState(company);
    localStorage.setItem('currentCompanyId', company.id);
    setCompanySwitched(true);
  };

  const refreshCompanies = async () => {
    if (user) {
      console.log('[SYNC] Refreshing companies...');
      companiesLoadedRef.current = false;
      await loadCompanies(user.id, true);
    }
  };

  /**
   * MOBILE-FIRST: Comprehensive refresh of active sales data
   * Syncs: Sales, Lots, Photos, Contacts, Documents for active sales
   * Shows progress and handles offline scenarios
   */
  const refreshActiveSalesData = async () => {
    if (!currentCompany || !user) {
      console.warn('[WARN] No company selected or user not logged in');
      return;
    }

    try {
      console.log('[SYNC] Starting comprehensive refresh for active sales...');
      setRefreshProgress({
        stage: 'Starting refresh...',
        current: 0,
        total: 6,
        isRefreshing: true,
      });

      // Check internet connectivity
      const isOnline = navigator.onLine;
      if (!isOnline) {
        console.warn('[WARN] No internet connection - cannot refresh');
        setRefreshProgress({
          stage: 'No internet connection',
          current: 0,
          total: 0,
          isRefreshing: false,
        });
        
        // Show offline message for 2 seconds
        setTimeout(() => {
          setRefreshProgress({
            stage: '',
            current: 0,
            total: 0,
            isRefreshing: false,
          });
        }, 2000);
        return;
      }

      // Subscribe to sync progress
      const unsubscribe = SyncService.onProgressChange((progress) => {
        setRefreshProgress({
          stage: progress.stage,
          current: progress.current,
          total: progress.total,
          isRefreshing: true,
        });
      });

      // Step 1: Refresh company data
      setRefreshProgress({
        stage: 'Refreshing company data...',
        current: 1,
        total: 6,
        isRefreshing: true,
      });

      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', currentCompany.id)
        .single();

      if (companyError) {
        console.error('âŒ Error refreshing company:', companyError);
      } else if (companyData) {
        // Update current company in state
        setCurrentCompanyState(companyData as Company);
        
        // Update in companies list
        setCompanies(prev => 
          prev.map(c => c.id === companyData.id ? companyData as Company : c)
        );
        
        // Update cache
        const cachedCompanies = localStorage.getItem('cachedCompanies');
        if (cachedCompanies) {
          try {
            const parsed = JSON.parse(cachedCompanies);
            const updated = parsed.map((c: Company) => 
              c.id === companyData.id ? companyData : c
            );
            localStorage.setItem('cachedCompanies', JSON.stringify(updated));
          } catch (e) {
            console.error('Failed to update cached companies:', e);
          }
        }
        
        console.log('[OK] Company data refreshed');
      }

      // Step 2: Perform initial sync for active sales
      setRefreshProgress({
        stage: 'Syncing active sales...',
        current: 2,
        total: 6,
        isRefreshing: true,
      });

      await SyncService.performInitialSync(currentCompany.id);

      // Step 3: Refresh contacts
      setRefreshProgress({
        stage: 'Refreshing contacts...',
        current: 3,
        total: 6,
        isRefreshing: true,
      });

      const { data: salesData } = await supabase
        .from('sales')
        .select('id')
        .eq('company_id', currentCompany.id)
        .in('status', ['upcoming', 'active']);

      if (salesData && salesData.length > 0) {
        const saleIds = salesData.map(s => s.id);
        
        // Refresh contacts for active sales
        const { data: contacts } = await supabase
          .from('contacts')
          .select('*')
          .or(`company_id.eq.${currentCompany.id},sale_id.in.(${saleIds.join(',')})`);

        console.log(`[OK] Refreshed ${contacts?.length || 0} contacts`);
      }

      // Step 4: Refresh documents
      setRefreshProgress({
        stage: 'Refreshing documents...',
        current: 4,
        total: 6,
        isRefreshing: true,
      });

      if (salesData && salesData.length > 0) {
        const saleIds = salesData.map(s => s.id);
        
        // Refresh documents for active sales
        const { data: documents } = await supabase
          .from('documents')
          .select('*')
          .or(`company_id.eq.${currentCompany.id},sale_id.in.(${saleIds.join(',')})`);

        console.log(`[OK] Refreshed ${documents?.length || 0} documents`);
      }

      // Step 5: Refresh lookup categories
      setRefreshProgress({
        stage: 'Refreshing categories...',
        current: 5,
        total: 6,
        isRefreshing: true,
      });

      const { data: categories } = await supabase
        .from('lookup_categories')
        .select('*')
        .eq('company_id', currentCompany.id);

      console.log(`[OK] Refreshed ${categories?.length || 0} categories`);

      // Step 6: Complete
      setRefreshProgress({
        stage: 'Refresh complete!',
        current: 6,
        total: 6,
        isRefreshing: true,
      });

      // Unsubscribe from progress updates
      unsubscribe();

      console.log('[OK] Comprehensive refresh complete');

      // Clear progress after 2 seconds
      setTimeout(() => {
        setRefreshProgress({
          stage: '',
          current: 0,
          total: 0,
          isRefreshing: false,
        });
      }, 2000);

    } catch (error) {
      console.error('âŒ Failed to refresh active sales data:', error);
      
      setRefreshProgress({
        stage: 'Refresh failed',
        current: 0,
        total: 0,
        isRefreshing: false,
      });

      // Clear error message after 2 seconds
      setTimeout(() => {
        setRefreshProgress({
          stage: '',
          current: 0,
          total: 0,
          isRefreshing: false,
        });
      }, 2000);
    }
  };

  const signOut = async () => {
    console.log('[AUTH] Signing out...');
    
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setCurrentCompanyState(null);
      setCompanies([]);
      setIsPasswordRecovery(false);
      companiesLoadedRef.current = false;
      localStorage.removeItem('currentCompanyId');
      localStorage.removeItem('cachedCompanies');
      console.log('[OK] Signed out successfully');
    } catch (error) {
      console.error('âŒ Failed to sign out:', error);
      setUser(null);
      setCurrentCompanyState(null);
      setCompanies([]);
      setIsPasswordRecovery(false);
      companiesLoadedRef.current = false;
      localStorage.removeItem('currentCompanyId');
      localStorage.removeItem('cachedCompanies');
      throw error;
    }
  };

  useEffect(() => {
    loadingTimeoutRef.current = setTimeout(() => {
      console.warn('â° Master timeout (15s) - forcing app to load');
      setLoading(false);
    }, 15000);

    const checkAndCleanSession = async () => {
      try {
        console.log('[AUTH] Checking session...');
        
        const sessionResult = await withTimeout(
          (async () => {
            return await supabase.auth.getSession();
          })(),
          5000,
          'Session check timeout'
        );
        
        const { data: { session }, error } = sessionResult;
        
        if (error) {
          console.error('âŒ Session error:', error);
          
          const keys = Object.keys(localStorage);
          keys.forEach(key => {
            if (key.startsWith('sb-') || key.includes('supabase')) {
              localStorage.removeItem(key);
            }
          });
          
          setUser(null);
          setCurrentCompanyState(null);
          setCompanies([]);
        } else if (session?.user) {
          console.log('[OK] Session found for user:', session.user.email);
          setUser(session.user);
          
          console.log('[LOAD] Loading companies...');
          await loadCompanies(session.user.id, true);
        } else {
          console.log('[INFO] No session found');
          setUser(null);
          setCurrentCompanyState(null);
          setCompanies([]);
        }
      } catch (err) {
        console.error('âŒ Failed to check session:', err);
        
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase') || key === 'currentCompanyId') {
            localStorage.removeItem(key);
          }
        });
        
        setUser(null);
        setCurrentCompanyState(null);
        setCompanies([]);
      } finally {
        console.log('[OK] Session check complete, setting loading = false');
        
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        
        setLoading(false);
      }
    };

    checkAndCleanSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AUTH] Auth event:', event);

      if (event === 'SIGNED_IN') {
        console.log('[OK] User signed in:', session?.user?.email);
        setUser(session?.user ?? null);
        
        if (session?.user && !companiesLoadedRef.current) {
          console.log('[LOAD] Loading companies (initial sign in)');
          await loadCompanies(session.user.id, true);
        } else {
          console.log('[OK] Companies already loaded, skipping reload on token refresh');
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('[AUTH] User signed out');
        setUser(null);
        setCurrentCompanyState(null);
        setCompanies([]);
        setIsPasswordRecovery(false);
        companiesLoadedRef.current = false;
        localStorage.removeItem('currentCompanyId');
        localStorage.removeItem('cachedCompanies');
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('[OK] Token refreshed');
        setUser(session?.user ?? null);
        console.log('[OK] Token refreshed, keeping existing companies');
      } else if (event === 'USER_UPDATED') {
        console.log('[OK] User updated');
        setUser(session?.user ?? null);
        
        const isOnResetRoute = window.location.pathname.includes('/reset-password') || 
                               window.location.hash.includes('reset-password') ||
                               window.location.hash.includes('type=recovery');
        
        if (isPasswordRecovery || isOnResetRoute) {
          console.log('[AUTH] Skipping company load - password reset in progress');
        } else if (session?.user && !companiesLoadedRef.current) {
          console.log('[LOAD] Loading companies after user update');
          await loadCompanies(session.user.id, true);
        }
      } else if (event === 'PASSWORD_RECOVERY') {
        console.log('[AUTH] PASSWORD RECOVERY DETECTED');
        setIsPasswordRecovery(true);
        setUser(session?.user ?? null);
      } else if (event === 'INITIAL_SESSION') {
        console.log('[AUTH] Initial session event');
        setUser(session?.user ?? null);
      }
    });

    return () => {
      subscription.unsubscribe();
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (companies.length > 0) {
      try {
        localStorage.setItem('cachedCompanies', JSON.stringify(companies));
      } catch (e) {
        console.error('Failed to cache companies:', e);
      }
    }
  }, [companies]);

  return (
    <AppContext.Provider
      value={{
        user,
        loading,
        currentCompany,
        companies,
        setCurrentCompany,
        companySwitched,
        setCompanySwitched,
        refreshCompanies,
        refreshActiveSalesData,
        refreshProgress,
        signOut,
        isPasswordRecovery,
        setIsPasswordRecovery,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}