import { useEffect, useRef, useState, type ReactNode } from 'react';
import { InfoIcon } from './icons';

/** A small "i" icon that toggles a popover with longer help text, so panels don't have to show it inline. */
export function InfoHint({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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
    <span className="info-hint-wrap" ref={ref}>
      <button
        type="button"
        className="info-hint"
        aria-label="More information"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <InfoIcon size={13} />
      </button>
      {open && (
        <div className="info-popover help" role="tooltip">
          {children}
        </div>
      )}
    </span>
  );
}
