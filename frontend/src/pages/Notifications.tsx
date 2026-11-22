import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui/misc";
import { useToast } from "@/hooks/useToast";
import { Api } from "@/services/endpoints";
import type { AppNotification } from "@/types";
import { cn } from "@/utils/cn";
import { timeAgo } from "@/utils/format";

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ["notifications", unreadOnly ? "unread-list" : "all"], queryFn: () => Api.notifications(unreadOnly) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: (id: string) => Api.markRead(id), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const readAll = useMutation({ mutationFn: Api.markAllRead, onSuccess: () => { toast.success("All notifications marked as read."); refresh(); }, onError: (e: Error) => toast.error(e.message) });

  function open(n: AppNotification) {
    if (!n.is_read) read.mutate(n.id);
    if (n.link) nav(n.link);
  }

  return (
    <div>
      <PageHeader title="Notifications" subtitle={q.data ? `${q.data.unread} unread` : undefined} actions={<Button variant="secondary" disabled={!q.data?.unread} loading={readAll.isPending} onClick={() => readAll.mutate()}><CheckCheck className="h-4 w-4" />Mark all as read</Button>} />
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-4 w-4 accent-[#287A5B]" />Show unread only</label>
      {q.isLoading ? <Spinner label="Loading notifications" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data!.items.length === 0 ? (
        <EmptyState icon={Bell} title={unreadOnly ? "You're all caught up" : "No notifications yet"} text="You'll hear about new possible matches, verification requests and completed recoveries here." />
      ) : (
        <ul className="divide-y divide-stone-200 border-y border-stone-300" data-testid="notification-list">
          {q.data!.items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 py-3.5", !n.is_read && "bg-mint/50")} data-unread={!n.is_read}>
              <span className={cn("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-leaf")} aria-hidden />
              <button onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                <p className={cn("text-sm", !n.is_read ? "font-bold" : "font-semibold")}>{n.title}{!n.is_read && <span className="sr-only"> (unread)</span>}</p>
                {n.body && <p className="mt-0.5 text-sm text-ink/80">{n.body}</p>}
                <p className="mt-0.5 text-xs text-stone">{timeAgo(n.created_at)}</p>
              </button>
              {!n.is_read && <Button size="sm" variant="ghost" onClick={() => read.mutate(n.id)} aria-label={`Mark "${n.title}" as read`}>Mark read</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
