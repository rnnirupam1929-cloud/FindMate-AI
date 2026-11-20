import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link to="/" className={cn("flex items-center gap-2 font-extrabold tracking-tight", light ? "text-white" : "text-forest", className)} aria-label="FindMate AI home">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden><rect width="32" height="32" rx="7" fill={light ? "#DFF2E7" : "#153C32"} /><circle cx="14" cy="14" r="6" fill="none" stroke={light ? "#153C32" : "#DFF2E7"} strokeWidth="2.6" /><path d="M18.6 18.6 24 24" stroke="#E8C979" strokeWidth="2.8" strokeLinecap="round" /></svg>
      <span className="text-lg">FindMate <span className={light ? "text-sun" : "text-leaf"}>AI</span></span>
    </Link>
  );
}
