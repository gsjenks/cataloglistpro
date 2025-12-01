import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Search, Filter, X, ArrowUpDown } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface FilterOption {
  id: string;
  label: string;
  value: string;
}

interface SortOption {
  id: string;
  label: string;
  value: string;
}

interface TabFilters {
  searchPlaceholder?: string;
  filterOptions?: FilterOption[];
  sortOptions?: SortOption[];
  showSearch?: boolean;
  showFilter?: boolean;
  showSort?: boolean;
}

interface ScrollableTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabFilters?: Record<string, TabFilters>;
  onSearch?: (tabId: string, searchQuery: string) => void;
  onFilterChange?: (tabId: string, filterId: string) => void;
  onSortChange?: (tabId: string, sortId: string) => void;
}

export default function ScrollableTabs({ 
  tabs, 
  activeTab, 
  onTabChange,
  tabFilters = {},
  onSearch,
  onFilterChange,
  onSortChange
}: ScrollableTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('');
  const [selectedSort, setSelectedSort] = useState<string>('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const currentTabFilters = tabFilters[activeTab] || {
    searchPlaceholder: 'Search...',
    showSearch: true,
    showFilter: false,
    showSort: false,
  };

  const checkScrollPosition = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScrollPosition();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      window.addEventListener('resize', checkScrollPosition);
      
      return () => {
        container.removeEventListener('scroll', checkScrollPosition);
        window.removeEventListener('resize', checkScrollPosition);
      };
    }
  }, [tabs]);

  // Reset search, filter, and sort when tab changes
  useEffect(() => {
    setSearchQuery('');
    setSelectedFilter('');
    setSelectedSort('');
    setShowFilterDropdown(false);
    setShowSortDropdown(false);
  }, [activeTab]);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = 200;
    const targetScroll = direction === 'left' 
      ? container.scrollLeft - scrollAmount 
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (onSearch) {
      onSearch(activeTab, value);
    }
  };

  const handleFilterSelect = (filterId: string) => {
    setSelectedFilter(filterId);
    setShowFilterDropdown(false);
    if (onFilterChange) {
      onFilterChange(activeTab, filterId);
    }
  };

  const handleSortSelect = (sortId: string) => {
    setSelectedSort(sortId);
    setShowSortDropdown(false);
    if (onSortChange) {
      onSortChange(activeTab, sortId);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    if (onSearch) {
      onSearch(activeTab, '');
    }
  };

  const clearFilter = () => {
    setSelectedFilter('');
    if (onFilterChange) {
      onFilterChange(activeTab, '');
    }
  };

  const clearSort = () => {
    setSelectedSort('');
    if (onSortChange) {
      onSortChange(activeTab, '');
    }
  };

  const showSearchBar = currentTabFilters.showSearch !== false;
  const showFilterButton = currentTabFilters.showFilter && currentTabFilters.filterOptions && currentTabFilters.filterOptions.length > 0;
  const showSortButton = currentTabFilters.showSort && currentTabFilters.sortOptions && currentTabFilters.sortOptions.length > 0;

  return (
    <div className="border-b border-gray-200">
      <style>
        {`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>
      
      {/* Tabs Section */}
      <div className="relative">
        {/* Left Arrow */}
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 bg-gradient-to-r from-white via-white to-transparent px-2 flex items-center justify-center hover:from-gray-50"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
        )}

        {/* Scrollable Tabs Container */}
        <div
          ref={scrollContainerRef}
          className="flex overflow-x-auto scrollbar-hide scroll-smooth"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="flex gap-1 px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 whitespace-nowrap text-sm font-medium transition-all
                  border-b-2 -mb-px
                  ${activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }
                `}
              >
                {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`
                    px-2 py-0.5 rounded-full text-xs
                    ${activeTab === tab.id
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-gray-100 text-gray-600'
                    }
                  `}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right Arrow */}
        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 bg-gradient-to-l from-white via-white to-transparent px-2 flex items-center justify-center hover:from-gray-50"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        )}
      </div>

      {/* Dynamic Search, Filter, and Sort Bar */}
      {(showSearchBar || showFilterButton || showSortButton) && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center gap-3">
            {/* Search Input */}
            {showSearchBar && (
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={currentTabFilters.searchPlaceholder || 'Search...'}
                  className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Sort Dropdown */}
            {showSortButton && (
              <div className="relative">
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className={`
                    flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors
                    ${selectedSort
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <ArrowUpDown className="w-4 h-4" />
                  <span>
                    {selectedSort 
                      ? currentTabFilters.sortOptions?.find(s => s.id === selectedSort)?.label 
                      : 'Sort'}
                  </span>
                  {selectedSort && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSort();
                      }}
                      className="ml-1 hover:bg-indigo-100 rounded-full p-0.5 cursor-pointer inline-flex"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          clearSort();
                        }
                      }}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>

                {/* Sort Dropdown Menu */}
                {showSortDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                    <div className="py-1">
                      {currentTabFilters.sortOptions?.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => handleSortSelect(option.id)}
                          className={`
                            w-full text-left px-4 py-2 text-sm transition-colors
                            ${selectedSort === option.id
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
                )}
              </div>
            )}

            {/* Filter Dropdown */}
            {showFilterButton && (
              <div className="relative">
                <button
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className={`
                    flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors
                    ${selectedFilter
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <Filter className="w-4 h-4" />
                  <span>
                    {selectedFilter 
                      ? currentTabFilters.filterOptions?.find(f => f.id === selectedFilter)?.label 
                      : 'Filter'}
                  </span>
                  {selectedFilter && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        clearFilter();
                      }}
                      className="ml-1 hover:bg-indigo-100 rounded-full p-0.5 cursor-pointer inline-flex"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          clearFilter();
                        }
                      }}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>

                {/* Filter Dropdown Menu */}
                {showFilterDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                    <div className="py-1">
                      {currentTabFilters.filterOptions?.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => handleFilterSelect(option.id)}
                          className={`
                            w-full text-left px-4 py-2 text-sm transition-colors
                            ${selectedFilter === option.id
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
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}