import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import {
  filterCommands,
  moveSelection,
  type PaletteCommand,
  type CommandMatch,
} from '../../utils/commandPalette';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: readonly PaletteCommand[];
}

/** Highlights the characters of `title` that matched the query. */
const HighlightedTitle: React.FC<{ title: string; indices: number[] }> = ({
  title,
  indices,
}) => {
  if (indices.length === 0) return <>{title}</>;

  const marked = new Set(indices);
  return (
    <>
      {Array.from(title).map((char, index) =>
        marked.has(index) ? (
          <span key={index} className="text-indigo-600 dark:text-indigo-400 font-bold">
            {char}
          </span>
        ) : (
          <span key={index}>{char}</span>
        ),
      )}
    </>
  );
};

/**
 * A flat, searchable overlay listing every layout and build action.
 *
 * Keyboard-first by design: arrows move, Enter runs, Escape closes. The list
 * is rebuilt on every keystroke and the selection is clamped back into range,
 * so filtering can never leave the highlight pointing past the end.
 */
const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo<CommandMatch[]>(
    () => filterCommands(commands, query),
    [commands, query],
  );

  // Reset each time the palette opens, so it never reappears mid-search.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // Focus after paint, otherwise the input is not yet in the document.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Filtering can shrink the list under the current selection.
  useEffect(() => {
    setSelected((current) => (current >= matches.length ? 0 : current));
  }, [matches.length]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    const container = listRef.current;
    const row = container?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    // Not every environment implements scrollIntoView (jsdom, for one), and
    // failing to scroll must never take the palette down with it.
    if (typeof row?.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, [selected, open]);

  if (!open) return null;

  const runSelected = () => {
    const match = matches[selected];
    if (!match) return;
    if (match.command.enabled === false) return;
    onClose();
    match.command.run();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => moveSelection(current, 1, matches.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => moveSelection(current, -1, matches.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runSelected();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/40 pt-[12vh] px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-4">
          <Search className="h-4 w-4 flex-shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands and snippets…"
            aria-label="Search commands"
            aria-controls="command-palette-list"
            className="h-12 w-full bg-transparent text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
          />
        </div>

        <div
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-[52vh] overflow-y-auto py-1"
        >
          {matches.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">
              No matching commands
            </div>
          ) : (
            matches.map((match, index) => {
              const disabled = match.command.enabled === false;
              const isSelected = index === selected;
              return (
                <div
                  key={match.command.id}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={disabled}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => {
                    setSelected(index);
                    if (!disabled) {
                      onClose();
                      match.command.run();
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${
                    isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  <span className="w-16 flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {match.command.group}
                  </span>
                  <span className="flex-1 truncate text-zinc-900 dark:text-zinc-100">
                    <HighlightedTitle
                      title={match.command.title}
                      indices={match.matchedIndices}
                    />
                  </span>
                  {match.command.hint && (
                    <span className="flex-shrink-0 text-[11px] text-zinc-400">
                      {match.command.hint}
                    </span>
                  )}
                  {isSelected && !disabled && (
                    <CornerDownLeft className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-zinc-200 dark:border-zinc-800 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-400">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
