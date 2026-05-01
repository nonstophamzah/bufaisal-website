'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  /** The option label that triggers the "manual entry" input (e.g. "OTHER"). */
  otherLabel?: string;
}

/**
 * Mobile-friendly searchable select.
 * - Type to filter (case-insensitive)
 * - Tap an option to select
 * - Shows all options when focused (scrollable)
 * - Clear button to reset
 * - When the "Other" option is selected, shows a text input for manual entry
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Search...',
  otherLabel,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [isOther, setIsOther] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // If parent sets a value that isn't in the options list, treat it as custom ("Other") input.
  useEffect(() => {
    if (!value) {
      setIsOther(false);
      setCustomValue('');
      return;
    }
    if (otherLabel && value === otherLabel) {
      setIsOther(true);
      return;
    }
    if (!options.includes(value)) {
      setIsOther(true);
      setCustomValue(value);
    }
  }, [value, options, otherLabel]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const handleSelect = (option: string) => {
    onChange(option);
    setQuery('');
    setOpen(false);
    if (otherLabel && option === otherLabel) {
      setIsOther(true);
      setCustomValue('');
    } else {
      setIsOther(false);
      setCustomValue('');
    }
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setIsOther(false);
    setCustomValue('');
    setOpen(false);
  };

  const handleCustomChange = (v: string) => {
    setCustomValue(v);
    onChange(v);
  };

  const displayValue = isOther
    ? (otherLabel || 'Other')
    : value || '';

  return (
    <div ref={containerRef} className="relative">
      {/* Selector input */}
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <Search size={18} />
        </div>
        <input
          type="text"
          value={open ? query : displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-11 pr-20 py-4 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow bg-white"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {(value || query) && (
            <button
              type="button"
              onClick={handleClear}
              className="p-2 text-gray-400 active:scale-95"
              aria-label="Clear"
            >
              <X size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="p-2 text-gray-500 active:scale-95"
            aria-label="Toggle dropdown"
          >
            <ChevronDown
              size={18}
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-gray-400">No matches</div>
          ) : (
            filtered.map((option) => {
              const selected = value === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`w-full text-left px-4 py-3.5 text-base font-semibold border-b border-gray-100 last:border-b-0 active:bg-yellow/30 ${
                    selected ? 'bg-black text-yellow' : 'bg-white text-black'
                  }`}
                >
                  {option}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Manual entry when Other is selected */}
      {isOther && (
        <input
          type="text"
          value={customValue}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Type manually..."
          className="mt-2 w-full px-4 py-4 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
        />
      )}
    </div>
  );
}
