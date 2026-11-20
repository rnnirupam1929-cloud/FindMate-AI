import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useAuth } from "@/hooks/useAuth";
import { resetPassword, usingSupabase } from "@/services/auth";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-stone">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

const loginSchema = z.object({ email: z.string().email("Enter a valid email address."), password: z.string().min(8, "Password must be at least 8 characters.") });

export function LoginPage() {
  const { signIn, user, sessionExpired } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string; expired?: boolean } };
  const [error, setError] = useState<string | null>(null);
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to={loc.state?.from ?? "/dashboard"} replace />;
  return (
    <Shell title="Welcome back" subtitle="Log in to track your reports and matches.">
      {(sessionExpired || loc.state?.expired) && <p className="mb-4 rounded-md bg-sun-100 px-3 py-2 text-sm" role="alert">Your session expired. Please log in again.</p>}
      <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => {
        setError(null);
        try { await signIn(v.email, v.password); nav(loc.state?.from ?? "/dashboard", { replace: true }); } catch (e) { setError((e as Error).message); }
      })}>
        <Input label="Email" type="email" autoComplete="email" error={f.formState.errors.email?.message} {...f.register("email")} />
        <Input label="Password" type="password" autoComplete="current-password" error={f.formState.errors.password?.message} {...f.register("password")} />
        {error && <p className="field-error" role="alert">{error}</p>}
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Log in</Button>
      </form>
      <p className="mt-4 flex justify-between text-sm"><Link to="/forgot-password" className="text-leaf hover:underline">Forgot password?</Link><Link to="/signup" className="font-semibold text-leaf hover:underline">Create account</Link></p>
    </Shell>
  );
}

const signupSchema = z.object({
  full_name: z.string().min(2, "Please enter your name.").max(120),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

export function SignupPage() {
  const { signUp, user } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const f = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema) });
  if (user) return <Navigate to="/dashboard" replace />;
  if (confirm) return (
    <Shell title="Check your email" subtitle={`We sent a confirmation link to ${confirm}.`}>
      <div className="flex items-start gap-3 rounded-md bg-mint p-4 text-sm"><MailCheck className="mt-0.5 h-5 w-5 text-leaf" aria-hidden /><p>Click the link in that email to verify your address, then log in.</p></div>
      <Button asChild className="mt-4 w-full" variant="secondary"><Link to="/login">Go to log in</Link></Button>
    </Shell>
  );
  return (
    <Shell title="Create your account" subtitle="Join your campus community. It takes a minute.">
      <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => {
        setError(null);
        try { const r = await signUp(v.email, v.password, v.full_name); if (r === "confirm-email") setConfirm(v.email); else nav("/dashboard", { replace: true }); } catch (e) { setError((e as Error).message); }
      })}>
        <Input label="Full name" autoComplete="name" error={f.formState.errors.full_name?.message} {...f.register("full_name")} />
        <Input label="Email" type="email" autoComplete="email" error={f.formState.errors.email?.message} {...f.register("email")} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." error={f.formState.errors.password?.message} {...f.register("password")} />
        {error && <p className="field-error" role="alert">{error}</p>}
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Sign up</Button>
      </form>
      <p className="mt-4 text-sm text-stone">Already have an account? <Link to="/login" className="font-semibold text-leaf hover:underline">Log in</Link></p>
    </Shell>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().email("Enter a valid email address.") })) });
  return (
    <Shell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {!usingSupabase && <p className="mb-4 rounded-md bg-sun-100 px-3 py-2 text-sm">Local development mode: password reset needs Supabase Auth to be configured.</p>}
      {sent ? <p className="rounded-md bg-mint p-4 text-sm" role="status">If an account exists for that email, a reset link is on its way.</p> : (
        <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => { setError(null); try { await resetPassword(v.email); setSent(true); } catch (e) { setError((e as Error).message); } })}>
          <Input label="Email" type="email" error={f.formState.errors.email?.message} {...f.register("email")} />
          {error && <p className="field-error" role="alert">{error}</p>}
          <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Send reset link</Button>
        </form>
      )}
      <p className="mt-4 text-sm"><Link to="/login" className="text-leaf hover:underline">Back to log in</Link></p>
    </Shell>
  );
}
