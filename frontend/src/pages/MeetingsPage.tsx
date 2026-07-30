import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Clock, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { MeetingStatusBadge } from '@/components/shared/StatusBadge';
import { useMeetings } from '@/api/meetings';
import { formatDateTime, humanizeEnum } from '@/lib/utils';
import type { Meeting } from '@/types';

type MeetingWithLead = Meeting & { lead?: { id: string; leadNumber: number; company?: { name: string } | null } | null };

export default function MeetingsPage() {
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const navigate = useNavigate();
  const query = useMemo(() => (upcomingOnly ? { upcoming: true } : {}), [upcomingOnly]);
  const { data: meetings, isLoading } = useMeetings(query) as { data?: MeetingWithLead[]; isLoading: boolean };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Meetings"
        description="Every discovery call, demo, and follow-up scheduled across your pipeline."
        actions={
          <div className="flex gap-2">
            <Button variant={upcomingOnly ? 'default' : 'outline'} size="sm" onClick={() => setUpcomingOnly(true)}>Upcoming</Button>
            <Button variant={!upcomingOnly ? 'default' : 'outline'} size="sm" onClick={() => setUpcomingOnly(false)}>All</Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !meetings?.length ? (
        <EmptyState icon={CalendarClock} title="No meetings found" description="Meetings scheduled from lead detail pages will show up here." />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Card key={m.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => m.lead && navigate(`/leads/${m.lead.id}`)}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.lead?.company?.name ?? 'Unlinked lead'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDateTime(m.scheduledAt)} · {m.durationMins}m</span>
                    {m.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{m.location}</span>}
                    <span>{humanizeEnum(m.type)}</span>
                  </div>
                </div>
                <MeetingStatusBadge status={m.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
