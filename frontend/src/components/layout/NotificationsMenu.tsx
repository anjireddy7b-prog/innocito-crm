import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/api/notifications';
import { formatRelativeTime } from '@/lib/utils';
import { EmptyState } from '@/components/shared/EmptyState';

export function NotificationsMenu() {
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const unreadCount = Number((data?.meta as { unreadCount?: number } | undefined)?.unreadCount ?? 0);
  const notifications = data?.data ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => markAllRead.mutate()}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {notifications.length === 0 && <EmptyState title="You're all caught up" description="No notifications yet." />}
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.isRead) markRead.mutate(n.id);
                if (n.leadId) navigate(`/leads/${n.leadId}`);
              }}
              className="flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                <p className="text-sm font-medium">{n.title}</p>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
              <p className="text-[11px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
