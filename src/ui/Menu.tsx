import { useEffect, useRef, useState, type ReactNode } from 'react';

interface MenuProps {
  /** Trigger button content. */
  label: ReactNode;
  className?: string;
  align?: 'left' | 'right';
  children: ReactNode;
}

/** A button that opens a small floating panel; closes on outside-click or Escape. */
export function Menu({ label, className, align = 'right', children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className={`menu-panel ${align === 'left' ? 'menu-panel-left' : 'menu-panel-right'}`} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A single row inside a `<Menu>` panel. */
export function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="menu-item" role="menuitem" onClick={onClick}>
      {children}
    </button>
  );
}
