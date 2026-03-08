import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';
import type { UpstreamModel } from '../lib/systemConfigApi';

interface ModelSelectProps {
  value: string;
  onChange: (value: string) => void;
  models: UpstreamModel[];
  placeholder?: string;
}

/**
 * Filterable model selector.
 * When models list is non-empty, typing filters the dropdown.
 * When models list is empty, behaves as a plain text input.
 */
export function ModelSelect({ value, onChange, models, placeholder = 'gpt-4o-mini' }: ModelSelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return models;
    const lower = query.toLowerCase();
    return models.filter((m) => m.id.toLowerCase().includes(lower));
  }, [models, query]);

  const handleInputChange = (text: string) => {
    setQuery(text);
    onChange(text);
    if (models.length > 0) {
      setOpen(true);
    }
  };

  const handleSelect = (id: string) => {
    setQuery(id);
    onChange(id);
    setOpen(false);
  };

  // No models fetched — plain input
  if (models.length === 0) {
    return (
      <Input
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {filtered.map((m) => (
            <li
              key={m.id}
              className={cn(
                'cursor-pointer select-none rounded-sm px-2 py-1.5 text-sm outline-none',
                'hover:bg-accent hover:text-accent-foreground',
                m.id === value && 'bg-accent text-accent-foreground'
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on input
                handleSelect(m.id);
              }}
            >
              {m.id}
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md">
          无匹配模型
        </div>
      )}
    </div>
  );
}
