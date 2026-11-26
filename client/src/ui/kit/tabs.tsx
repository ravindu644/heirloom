import { useId } from 'preact/hooks';
import { cx } from './cx.ts';
import css from './tabs.module.css';

export interface Tab {
  id: string;
  label: string;
  /** Waiting things, said as a small circle after the label: none at 0, "9+" past nine. */
  count?: number;
  /** The tab's name with its count, for a screen reader: "Notes, 2 new". */
  said?: string;
}

/**
 * The bottom bar's rule one level down: labels in a row, the chosen one in ink over a line, the
 * others muted, a hair under the row. A tablist to a screen reader, moved through with the arrow
 * keys, Home and End; each panel names its tab with `tabPanel`.
 */
export function Tabs({ tabs, at, onChoose, label, base }: { tabs: Tab[]; at: string; onChoose: (id: string) => void; label: string; base: string }) {
  const key = (event: KeyboardEvent) => {
    const i = tabs.findIndex((tab) => tab.id === at);
    const to = event.key === 'ArrowRight' ? i + 1 : event.key === 'ArrowLeft' ? i - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length]!;
    onChoose(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  };
  return (
    <div class={css.tabs} role="tablist" aria-label={label} onKeyDown={key}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${base}-tab-${tab.id}`}
          aria-selected={tab.id === at}
          aria-controls={`${base}-panel-${tab.id}`}
          aria-label={tab.said}
          tabIndex={tab.id === at ? 0 : -1}
          onClick={() => onChoose(tab.id)}
        >
          <span class={css.label}>
            {tab.label}
            {/* Hung outside the label, so neither it nor the tab moves when the count comes or goes. */}
            <b class={cx(css.count, !tab.count && css.none)} aria-hidden="true">
              {tab.count ? (tab.count > 9 ? '9+' : tab.count) : ''}
            </b>
          </span>
        </button>
      ))}
    </div>
  );
}

/** The panel a tab shows. */
export const tabPanel = (base: string, id: string) => ({ role: 'tabpanel', id: `${base}-panel-${id}`, 'aria-labelledby': `${base}-tab-${id}` }) as const;

/** An id for one set of tabs. */
export const useTabsId = () => useId();
