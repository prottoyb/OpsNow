import { useRef } from 'react';
import type { ReactNode } from 'react';

export interface TabDefinition {
  id: string;
  label: string;
  panel: ReactNode;
}

export interface TabsProps {
  tabs: TabDefinition[];
  activeId: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. */
  label: string;
}

/**
 * A minimal ARIA tabs implementation: roving tabindex plus left/right/home/end
 * keys, so the control is fully keyboard operable rather than mouse-only.
 */
export function Tabs({ tabs, activeId, onChange, label }: TabsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusTab(index: number) {
    const target = tabs[(index + tabs.length) % tabs.length];
    onChange(target.id);
    tabRefs.current[target.id]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        focusTab(index + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusTab(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusTab(0);
        break;
      case 'End':
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 border-b border-slate-200"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                selected
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          tabIndex={0}
          hidden={tab.id !== activeId}
        >
          {/*
            Rendered unconditionally and hidden with `hidden`, which already
            removes the panel from both layout and the accessibility tree.
            Unmounting the inactive panel would additionally destroy its state
            — switching to History mid-sentence would discard a comment draft.
          */}
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
