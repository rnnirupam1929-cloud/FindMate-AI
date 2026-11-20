import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

const base = "w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-ink placeholder:text-stone focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/25 disabled:bg-stone-200/50";

interface Wrap { label: string; error?: string; hint?: string; required?: boolean }

function Wrapper({ id, label, error, hint, required, children }: Wrap & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}{required && <span aria-hidden className="text-danger"> *</span>}</label>
      {children}
      {hint && !error && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}
const aria = (id: string, error?: string, hint?: string) => ({ "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-err` : hint ? `${id}-hint` : undefined });

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Wrap>(({ label, error, hint, required, className, ...p }, ref) => {
  const id = useId();
  return <Wrapper {...{ id, label, error, hint, required }}><input id={id} ref={ref} className={cn(base, "h-10", error && "border-danger", className)} {...aria(id, error, hint)} {...p} /></Wrapper>;
});
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Wrap>(({ label, error, hint, required, className, ...p }, ref) => {
  const id = useId();
  return <Wrapper {...{ id, label, error, hint, required }}><textarea id={id} ref={ref} rows={4} className={cn(base, "py-2", error && "border-danger", className)} {...aria(id, error, hint)} {...p} /></Wrapper>;
});
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Wrap>(({ label, error, hint, required, className, children, ...p }, ref) => {
  const id = useId();
  return <Wrapper {...{ id, label, error, hint, required }}><select id={id} ref={ref} className={cn(base, "h-10", error && "border-danger", className)} {...aria(id, error, hint)} {...p}>{children}</select></Wrapper>;
});
Select.displayName = "Select";
