// A small in-app replacement for window.confirm / window.prompt so destructive actions and
// text entry use an accessible, themeable modal instead of a native browser dialog.
//
// Usage: wrap the tree in <DialogProvider>, then in any component:
//   const { confirm, promptText } = useDialogs();
//   if (await confirm('Delete X?', { danger: true })) { ... }
//   const name = await promptText('Name this preset:');

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmOpts {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Pending =
  | { kind: 'confirm'; message: string; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; message: string; opts: ConfirmOpts; resolve: (v: string | null) => void };

interface DialogApi {
  confirm: (message: string, opts?: ConfirmOpts) => Promise<boolean>;
  promptText: (message: string, defaultValue?: string, opts?: ConfirmOpts) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used within a DialogProvider');
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');

  const confirm = (message: string, opts: ConfirmOpts = {}) =>
    new Promise<boolean>((resolve) => setPending({ kind: 'confirm', message, opts, resolve }));

  const promptText = (message: string, defaultValue = '', opts: ConfirmOpts = {}) =>
    new Promise<string | null>((resolve) => {
      setText(defaultValue);
      setPending({ kind: 'prompt', message, opts, resolve });
    });

  const settle = (result: boolean | string | null) => {
    if (!pending) return;
    if (pending.kind === 'confirm') pending.resolve(Boolean(result));
    else pending.resolve(result as string | null);
    setPending(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, promptText }}>
      {children}
      {pending && (
        <DialogModal
          pending={pending}
          text={text}
          setText={setText}
          onCancel={() => settle(pending.kind === 'prompt' ? null : false)}
          onConfirm={() => settle(pending.kind === 'prompt' ? text : true)}
        />
      )}
    </DialogContext.Provider>
  );
}

function DialogModal({
  pending,
  text,
  setText,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  text: string;
  setText: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = 'dialog-title';

  useEffect(() => {
    // Focus the input for prompts, otherwise the confirm button.
    if (pending.kind === 'prompt') inputRef.current?.focus();
    else confirmRef.current?.focus();
  }, [pending.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const { opts } = pending;
  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role={pending.kind === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="dialog-title">{opts.title ?? (pending.kind === 'prompt' ? 'Enter a value' : 'Please confirm')}</h3>
        <p className="dialog-message">{pending.message}</p>
        {pending.kind === 'prompt' && (
          <input
            ref={inputRef}
            className="dialog-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(); } }}
            aria-label={pending.message}
          />
        )}
        <div className="dialog-actions">
          <button className="secondary" onClick={onCancel}>{opts.cancelLabel ?? 'Cancel'}</button>
          <button
            ref={confirmRef}
            className={opts.danger ? 'danger' : ''}
            onClick={onConfirm}
            disabled={pending.kind === 'prompt' && text.trim() === ''}
          >
            {opts.confirmLabel ?? (pending.kind === 'prompt' ? 'Save' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
