import { AlertCircle, Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/Button";

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-stone" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{label}…</div>
);

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-mint p-3 text-leaf"><Icon className="h-6 w-6" aria-hidden /></div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-stone">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center" role="alert">
      <AlertCircle className="mb-2 h-6 w-6 text-danger" aria-hidden />
      <p className="text-sm font-semibold">{error instanceof Error ? error.message : "Something went wrong."}</p>
      {retry && <Button className="mt-3" variant="secondary" size="sm" onClick={retry}>Try again</Button>}
    </div>
  );
}

const TONES: Record<string, string> = {
  open: "bg-mint text-forest", draft: "bg-stone-200 text-ink", closed: "bg-stone-200 text-ink", recovered: "bg-forest text-white", matched: "bg-sun-100 text-ink",
  pending: "bg-sun-100 text-ink", under_review: "bg-sun-100 text-ink", approved: "bg-mint text-forest", rejected: "bg-[#f4dcd9] text-danger", completed: "bg-forest text-white",
  suggested: "bg-mint text-forest", verifying: "bg-sun-100 text-ink", confirmed: "bg-forest text-white", dismissed: "bg-stone-200 text-ink", flagged: "bg-[#f4dcd9] text-danger",
  lost: "bg-[#f4e6d4] text-[#7a4a12]", found: "bg-mint text-forest",
};
export const StatusBadge = ({ value, className, children }: { value: string; className?: string; children?: ReactNode }) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", TONES[value] ?? "bg-stone-200", className)}>{children ?? value.replace("_", " ")}</span>
);

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-stone">{subtitle}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);
