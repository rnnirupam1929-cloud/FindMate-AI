import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="bg-forest text-white/80">
      <div className="container-page grid gap-8 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-3 max-w-xs text-sm">Lost something? Let AI find it. A recovery platform that connects lost and found reports, with a human deciding every handover.</p>
          <p className="mt-4 text-xs text-white/60">Pilot: Dayananda Sagar University, Bengaluru.</p>
        </div>
        <nav aria-label="Product" className="text-sm">
          <p className="mb-3 font-bold text-white">Product</p>
          <ul className="space-y-2">
            <li><Link className="hover:text-white" to="/report/lost">Report a lost item</Link></li>
            <li><Link className="hover:text-white" to="/report/found">I found something</Link></li>
            <li><a className="hover:text-white" href="/#how">How it works</a></li>
            <li><a className="hover:text-white" href="/#faq">FAQ</a></li>
          </ul>
        </nav>
        <nav aria-label="Account" className="text-sm">
          <p className="mb-3 font-bold text-white">Account</p>
          <ul className="space-y-2">
            <li><Link className="hover:text-white" to="/login">Log in</Link></li>
            <li><Link className="hover:text-white" to="/signup">Create account</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">© {new Date().getFullYear()} FindMate AI. Match scores are leads, never proof of ownership.</div>
    </footer>
  );
}
