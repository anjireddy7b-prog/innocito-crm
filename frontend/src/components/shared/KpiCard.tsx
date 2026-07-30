import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; positive?: boolean };
  accent?: 'primary' | 'success' | 'warning' | 'destructive';
}

const ACCENTS: Record<NonNullable<KpiCardProps['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
};

export function KpiCard({ label, value, icon: Icon, trend, accent = 'primary' }: KpiCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          {trend && (
            <p className={cn('mt-1 text-xs font-medium', trend.positive ? 'text-success' : 'text-muted-foreground')}>{trend.value}</p>
          )}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', ACCENTS[accent])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
