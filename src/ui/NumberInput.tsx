import { useEffect, useState } from 'react';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}

/**
 * A numeric input that can be momentarily emptied and retyped without snapping to
 * 0/NaN (the pervasive `+e.target.value` bug). Commits parsed values while typing
 * and clamps to [min, max] on blur.
 */
export function NumberInput({ value, onChange, min, max, ...rest }: Props) {
  const [text, setText] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  // Reflect external changes only while the field isn't being edited.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const clamp = (n: number) => {
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  };

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '' || raw === '-') return; // allow intermediate states
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(clamp(n));
      }}
      onBlur={() => {
        setFocused(false);
        const n = text === '' || Number.isNaN(Number(text)) ? clamp(min ?? 0) : clamp(Number(text));
        onChange(n);
        setText(String(n));
      }}
    />
  );
}
