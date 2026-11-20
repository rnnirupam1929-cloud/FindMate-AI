import { Backpack, Cable, CreditCard, Key, Package, Shirt, Smartphone, BookOpen, Watch, GlassWater, Trophy, IdCard, type LucideIcon } from "lucide-react";
import type { Report } from "@/types";
import { cn } from "@/utils/cn";

const ICONS: Record<string, LucideIcon> = {
  electronics: Smartphone, wallet_cards: CreditCard, keys: Key, bags: Backpack, clothing: Shirt, books_stationery: BookOpen,
  accessories: Watch, id_documents: IdCard, water_bottles: GlassWater, sports: Trophy, other: Package,
};
export const CategoryIcon = ({ category, className }: { category: string; className?: string }) => {
  const I = ICONS[category] ?? Cable;
  return <I className={className} aria-hidden />;
};

export function ReportThumb({ report, className }: { report: Pick<Report, "images" | "category" | "title">; className?: string }) {
  const img = report.images[0];
  return img ? (
    <img src={img.url} alt={report.title} loading="lazy" className={cn("rounded-md object-cover", className)} />
  ) : (
    <div className={cn("flex items-center justify-center rounded-md bg-mint text-leaf", className)} aria-label="No photo"><CategoryIcon category={report.category} className="h-1/3 w-1/3" /></div>
  );
}
