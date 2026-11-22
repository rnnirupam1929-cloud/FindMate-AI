import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ImageUpload } from "@/components/ImageUpload";
import { MatchCard } from "@/components/MatchCard";
import { RequireRole } from "@/components/Guards";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { ToastProvider } from "@/hooks/useToast";
import { ResetPasswordPage } from "@/pages/Auth";
import type { Match, Report } from "@/types";

const getSessionMock = vi.hoisted(() => vi.fn());
const updatePasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "1", role: "student", email: "a@b.c", full_name: "A" }, loading: false }) }));
vi.mock("@/services/auth", () => ({
  resetPassword: vi.fn(),
  supabase: { auth: { getSession: getSessionMock } },
  updatePassword: updatePasswordMock,
  usingSupabase: true,
}));

const report = (kind: "lost" | "found", over: Partial<Report> = {}): Report => ({
  id: kind, kind, title: `${kind} bottle`, category: "water_bottles", description: "d", color: "blue", brand: null, location_name: "Library", latitude: null, longitude: null,
  event_date: "2026-03-04T10:00:00Z", approx_time: null, additional_details: null, status: "open", is_flagged: false, is_hidden: false, is_mine: true,
  created_at: "2026-03-04T10:00:00Z", updated_at: "2026-03-04T10:00:00Z", images: [], match_count: 1, private_clues: null, verification_questions: null, ...over,
});
const match = (over: Partial<Match> = {}): Match => ({
  id: "m1", score: 72.4, breakdown: { visual: null, description: 0.6, category: 1, location: 0.9, date: 1 }, reasons: ["Same category (water bottles)."], status: "suggested",
  created_at: "2026-03-04T10:00:00Z", lost_report: report("lost"), found_report: report("found", { is_mine: false }), my_side: "lost", verification_id: null, verification_status: null, ...over,
});
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter></QueryClientProvider>);

describe("MatchCard", () => {
  it("shows the score as a lead, never as proof, and marks missing parts honestly", () => {
    wrap(<MatchCard match={match()} detailed />);
    expect(screen.getByLabelText("Match score 72 out of 100")).toBeInTheDocument();
    expect(screen.getByText("A match score is a lead, not proof of ownership.")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument(); // visual similarity missing, no fake number
  });
  it("lets the owner start verification but not the finder", () => {
    const { unmount } = wrap(<MatchCard match={match()} />);
    expect(screen.getByRole("button", { name: /This is mine/ })).toBeInTheDocument();
    unmount();
    wrap(<MatchCard match={match({ my_side: "found" })} />);
    expect(screen.queryByRole("button", { name: /This is mine/ })).not.toBeInTheDocument();
  });
  it("hides claim and dismiss actions once verification has started", () => {
    wrap(<MatchCard match={match({ status: "verifying", verification_id: "v1", verification_status: "pending" })} />);
    expect(screen.queryByRole("button", { name: /Not a match/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open verification/ })).toHaveAttribute("href", "/verifications/v1");
  });
});

describe("ImageUpload", () => {
  it("rejects unsupported files and shows why", async () => {
    const onFiles = vi.fn();
    wrap(<ImageUpload files={[]} onFiles={onFiles} />);
    await userEvent.setup({ applyAccept: false }).upload(screen.getByTestId("image-input"), new File(["x"], "a.txt", { type: "text/plain" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Unsupported file type/);
    expect(onFiles).toHaveBeenCalledWith([]);
  });
});

describe("ConfirmDialog", () => {
  it("requires an explicit confirm and can be cancelled", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    wrap(<ConfirmDialog open onOpenChange={onOpenChange} title="Delete?" description="Really?" onConfirm={onConfirm} confirmLabel="Delete" destructive />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("RequireRole", () => {
  it("blocks users without the role", () => {
    render(<MemoryRouter initialEntries={["/admin"]}><Routes><Route element={<RequireRole roles={["admin"]} />}><Route path="/admin" element={<p>secret</p>} /></Route></Routes></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Access restricted");
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});

describe("ResetPasswordPage", () => {
  it("updates the password only when a recovery session is present", async () => {
    getSessionMock.mockResolvedValue({ data: { session: {} }, error: null });
    updatePasswordMock.mockClear();
    updatePasswordMock.mockResolvedValue(undefined);
    wrap(<ResetPasswordPage />);

    await userEvent.type(await screen.findByLabelText("New password"), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => expect(updatePasswordMock).toHaveBeenCalledWith("new-password-123"));
  });

  it("does not show the password form when the recovery session is missing", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    updatePasswordMock.mockClear();
    wrap(<ResetPasswordPage />);

    expect(await screen.findByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(updatePasswordMock).not.toHaveBeenCalled();
  });
});
