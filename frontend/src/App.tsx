import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireRole } from "@/components/Guards";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/misc";
import { AppLayout } from "@/layouts/AppLayout";
import { PublicLayout } from "@/layouts/PublicLayout";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "@/pages/Auth";
import { LandingPage } from "@/pages/Landing";

// Heavier pages (maps, admin tables) are split out so the landing page loads fast.
const LostWizard = lazy(() => import("@/pages/ReportWizard").then((m) => ({ default: m.LostWizard })));
const FoundWizard = lazy(() => import("@/pages/ReportWizard").then((m) => ({ default: m.FoundWizard })));
const ReportWizard = lazy(() => import("@/pages/ReportWizard").then((m) => ({ default: m.ReportWizard })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.DashboardPage })));
const MyReports = lazy(() => import("@/pages/MyReports").then((m) => ({ default: m.MyReportsPage })));
const ReportDetail = lazy(() => import("@/pages/ReportDetail").then((m) => ({ default: m.ReportDetailPage })));
const Matches = lazy(() => import("@/pages/Matches").then((m) => ({ default: m.MatchesPage })));
const MatchDetail = lazy(() => import("@/pages/Matches").then((m) => ({ default: m.MatchDetailPage })));
const Verifications = lazy(() => import("@/pages/Verifications").then((m) => ({ default: m.VerificationsPage })));
const VerificationDetail = lazy(() => import("@/pages/Verifications").then((m) => ({ default: m.VerificationDetailPage })));
const MapPage = lazy(() => import("@/pages/MapPage").then((m) => ({ default: m.MapPage })));
const Notifications = lazy(() => import("@/pages/Notifications").then((m) => ({ default: m.NotificationsPage })));
const Admin = lazy(() => import("@/pages/Admin").then((m) => ({ default: m.AdminPage })));

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-sm font-bold text-leaf">404</p>
      <h1 className="mt-1 text-2xl font-extrabold">We couldn't find that page</h1>
      <p className="mt-2 text-sm text-stone">The link may be old, or the page may have moved.</p>
      <Button asChild className="mt-5"><Link to="/">Back to home</Link></Button>
    </div>
  );
}

export function App() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<PublicLayout />}><Route path="/" element={<LandingPage />} /></Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/report/lost" element={<LostWizard />} />
              <Route path="/report/found" element={<FoundWizard />} />
              <Route path="/reports" element={<MyReports />} />
              <Route path="/reports/:id" element={<ReportDetail />} />
              <Route path="/reports/:id/edit" element={<ReportWizard />} />
              <Route path="/matches" element={<Matches />} />
              <Route path="/matches/:id" element={<MatchDetail />} />
              <Route path="/verifications" element={<Verifications />} />
              <Route path="/verifications/:id" element={<VerificationDetail />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route element={<RequireRole roles={["admin", "verification_agent"]} />}>
                <Route path="/admin" element={<Admin />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
