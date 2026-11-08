import { useEffect, useId, useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import s from './ui.module.css';

type ButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost'; block?: boolean };

export function Button({ variant = 'secondary', block = false, className, type = 'button', ...rest }: ButtonProps) {
  const cls = [s.button, variant === 'primary' ? s.primary : variant === 'ghost' ? s.ghost : '', block ? s.block : '', className ?? ''].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}

export function ChoiceGroup<T extends string | number | null>({ legend, name, options, value, onChange }: {
  legend: string; name: string; options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void;
}) {
  return (
    <fieldset className={s.choiceGroup}>
      <legend className={s.choiceLegend}>{legend}</legend>
      <div className={s.choices}>
        {options.map((o) => (
          <label key={String(o.value)} className={s.choice}>
            <input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Modal confirmation with focus trap. Initial focus is on the safe action; Escape chooses it;
 * focus returns to the previously focused element on close.
 */
export function ConfirmDialog({ title, body, safeLabel, dangerLabel, onSafe, onDanger }: {
  title: string; body: string; safeLabel: string; dangerLabel: string; onSafe: () => void; onDanger: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    safeRef.current?.focus();
    return () => { previous?.focus?.(); };
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onSafe(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>('button')];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className={s.backdrop} onKeyDown={onKeyDown}>
      <div ref={ref} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        <div className={s.dialogActions}>
          <Button ref={safeRef} variant="primary" onClick={onSafe}>{safeLabel}</Button>
          <Button onClick={onDanger}>{dangerLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[s.card, className ?? ''].join(' ')}>{children}</div>;
}

export const uiStyles = s;
