import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, AreaChart, Area,
} from 'recharts';
import { ArrowLeft, Building2, Users, Target, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePlatformMetrics } from '@/api/platformAdmin';
import { CATEGORICAL, CHART_INK } from '@/lib/chartColors';

// Phase 13 (super admin), slice 3 — platform-wide metrics. Only reachable by a caller with
// isPlatformAdmin (see App.tsx's route guard) via a button on PlatformOrganizationsPage.tsx —
// this is a second view of the same console, not a separately-navigable module.

// Fixed per-plan colors, same "assign categorical hues in fixed order, never cycled" discipline
// as chartColors.ts's own LEAD_SOURCE_COLORS — kept local to this page rather than added to that
// shared file since plan identity is only ever broken out by color here.
const PLAN_COLORS: Record<string, string> = { FREE: CATEGORICAL[0], PRO: CATEGORICAL[1], ENTERPRISE: CATEGORICAL[2] };

export default function PlatformMetricsPage() {
  const { data, isLoading } = usePlatformMetrics();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Platform Metrics" description="Aggregate growth and usage across every organization." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const { totals, organizationsByPlan, signupTrend } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Metrics"
        description="Aggregate growth and usage across every organization on the platform."
        actions={
          <Button variant="outline" asChild>
            <Link to="/platform-admin/organizations">
              <ArrowLeft /> Organizations
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="Organizations" value={totals.organizations} icon={Building2} accent="primary" />
        <KpiCard label="Active" value={totals.activeOrganizations} icon={CheckCircle2} accent="success" />
        <KpiCard label="Suspended" value={totals.suspendedOrganizations} icon={XCircle} accent="destructive" />
        <KpiCard label="Total Users" value={totals.users} icon={Users} accent="primary" />
        <KpiCard label="Total Leads" value={totals.leads} icon={Target} accent="primary" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organizations by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={organizationsByPlan} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid horizontal={false} stroke={CHART_INK.grid} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
                <YAxis type="category" dataKey="planName" width={90} tick={{ fontSize: 12, fill: CHART_INK.secondary }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="Organizations" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {organizationsByPlan.map((p) => (
                    <Cell key={p.planId} fill={PLAN_COLORS[p.planId] ?? CHART_INK.muted} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New Organizations (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={signupTrend}>
                <defs>
                  <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CATEGORICAL[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CATEGORICAL[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" name="New Organizations" stroke={CATEGORICAL[0]} strokeWidth={2} fill="url(#signupFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
