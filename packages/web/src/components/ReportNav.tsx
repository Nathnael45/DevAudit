'use client';

import { useEffect, useState } from 'react';

export interface NavItem {
  id: string;
  label: string;
  count?: number;
  // Tailwind bg-* class for a severity dot.
  dotClass?: string;
  // Sub-items (e.g. severities under "Findings") are indented.
  indent?: boolean;
}

// How far below the viewport top a section must reach to count as "current".
const ACTIVE_OFFSET_PX = 120;

function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  // The reasoning section is a collapsed <details>; jumping to it should open it.
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
}

// Section menu for the report page: a sticky sidebar on wide screens, a sticky
// scrollable tab strip on phones. Highlights the section currently in view.
export default function ReportNav({ items, variant }: { items: NavItem[]; variant: 'sidebar' | 'bar' }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // The current section is the last one whose top has scrolled past the offset.
      let current = items[0]?.id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= ACTIVE_OFFSET_PX) current = item.id;
      }
      // At the very bottom, short final sections can't scroll up to the offset.
      // (Only once scrolled — a page too short to scroll is "at the bottom" from the start.)
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
        current = items[items.length - 1]?.id ?? current;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  const link = (item: NavItem, base: string, activeCls: string, idleCls: string) => (
    <a
      key={item.id}
      href={`#${item.id}`}
      aria-current={active === item.id ? 'location' : undefined}
      onClick={(e) => { e.preventDefault(); jumpTo(item.id); setActive(item.id); }}
      className={`${base} ${active === item.id ? activeCls : idleCls}`}
    >
      {item.dotClass && <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${item.dotClass}`} />}
      <span className="truncate">{item.label}</span>
      {item.count != null && <span className="ml-auto pl-2 text-xs tabular-nums opacity-70">{item.count}</span>}
    </a>
  );

  if (variant === 'bar') {
    return (
      <nav aria-label="Report sections"
           className="lg:hidden sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-terminal-bg/95 backdrop-blur
                      border-b border-terminal-border overflow-x-auto scrollbar-thin">
        <div className="flex gap-2 w-max">
          {items.map(item => link(item,
            'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs border transition-colors',
            'border-terminal-green text-terminal-green bg-terminal-green/10',
            'border-terminal-border text-terminal-muted hover:text-terminal-text'))}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Report sections" className="hidden lg:block sticky top-8 self-start">
      <p className="text-[11px] uppercase tracking-widest text-terminal-muted mb-3 px-3">On this page</p>
      <div className="flex flex-col gap-0.5 border-l border-terminal-border">
        {items.map(item => link(item,
          `flex items-center gap-2 -ml-px border-l-2 py-1.5 pr-2 text-sm transition-colors ${item.indent ? 'pl-6' : 'pl-3'}`,
          'border-terminal-green text-terminal-text bg-terminal-surface/60',
          'border-transparent text-terminal-muted hover:text-terminal-text hover:border-terminal-muted'))}
      </div>
    </nav>
  );
}
