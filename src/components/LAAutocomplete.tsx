// LAAutocomplete.tsx
// Autocomplete dropdown for LiveAuctioneers category codes

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { LACodeItem } from '../services/LiveAuctioneersData';

interface LAAutocompleteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: LACodeItem[];
  placeholder?: string;
  className?: string;
}

export default function LAAutocomplete({
  label,
  value,
  onChange,
  items,
  placeholder = '',
  className = ''
}: LAAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredItems, setFilteredItems] = useState<LACodeItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Update filtered items when search term changes
  useEffect(() => {
    if (!searchTerm) {
      setFilteredItems(items.slice(0, 100)); // Show first 100 items
    } else {
      const lowerSearch = searchTerm.toLowerCase();
      const filtered = items.filter(item =>
        item.id.toString().includes(lowerSearch) ||
        item.name.toLowerCase().includes(lowerSearch)
      ).slice(0, 100); // Limit to 100 results
      setFilteredItems(filtered);
    }
    setHighlightedIndex(-1);
  }, [searchTerm, items]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-item]');
      const item = items[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleSelectItem = (item: LACodeItem) => {
    onChange(item.name);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setSearchTerm('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredItems.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredItems[highlightedIndex]) {
          handleSelectItem(filteredItems[highlightedIndex]);
        } else if (searchTerm) {
          // Allow custom override
          onChange(searchTerm);
          setSearchTerm('');
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchTerm('');
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
        />
        
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredItems.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              {searchTerm ? (
                <>
                  No matches. Press Enter to use "{searchTerm}"
                </>
              ) : (
                'Start typing to search...'
              )}
            </div>
          ) : (
            <>
              {/* Null/empty option */}
              <div
                data-item
                onClick={() => handleSelectItem({ id: 0, name: '' })}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${
                  highlightedIndex === -1 ? 'bg-indigo-50' : ''
                }`}
              >
                <span className="text-gray-400 italic">(None)</span>
              </div>
              
              {/* Items */}
              {filteredItems.map((item, index) => (
                <div
                  key={item.id}
                  data-item
                  onClick={() => handleSelectItem(item)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${
                    highlightedIndex === index ? 'bg-indigo-50' : ''
                  }`}
                >
                  <span className="font-medium text-gray-700">{item.id}</span>
                  <span className="text-gray-600"> - {item.name}</span>
                </div>
              ))}
              
              {items.length > filteredItems.length && (
                <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-200">
                  Showing {filteredItems.length} of {items.length} items
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}