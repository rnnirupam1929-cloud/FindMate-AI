import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

export function PublicLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const links = [["How it works", "#how"], ["Safety", "#safety"], ["FAQ", "#faq"]];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-stone-300/70 bg-paper/95 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-7 text-sm font-semibold md:flex">
            {links.map(([l, h]) => <a key={h} href={h} className="hover:text-leaf">{l}</a>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? <Button asChild><Link to="/dashboard">Open dashboard</Link></Button> : <><Button variant="ghost" asChild><Link to="/login">Log in</Link></Button><Button asChild><Link to="/signup">Get started</Link></Button></>}
          </div>
          <Button variant="ghost" size="sm" className="md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button>
        </div>
        {open && (
          <div className="container-page flex flex-col gap-1 border-t border-stone-200 pb-4 pt-2 md:hidden">
            {links.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)} className="rounded px-2 py-2.5 font-semibold hover:bg-mint">{l}</a>)}
            {user ? <Button asChild className="mt-2"><Link to="/dashboard">Open dashboard</Link></Button> : <div className="mt-2 flex gap-2"><Button variant="secondary" asChild className="flex-1"><Link to="/login">Log in</Link></Button><Button asChild className="flex-1"><Link to="/signup">Get started</Link></Button></div>}
          </div>
        )}
      </header>
      <Outlet />
      <Footer />
    </div>
  );
}
