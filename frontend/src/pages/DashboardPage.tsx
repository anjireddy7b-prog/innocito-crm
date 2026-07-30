import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts';
import { Target, CheckCircle2, CalendarClock, TrendingUp, Trophy, XCircle, Percent } from 'lucide-react';
import { useDashboardSummary } from '@/api/dashboard';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { humanizeEnum } from '@/lib/utils';
import { CATEGORICAL, CHART_INK, LEAD_SOURCE_COLORS, pipelineColor, STATUS } from '@/lib/chartColors';

export default function DashboardPage() {
  const { data, isLoading } = useDashboardSummary();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Real-time visibility into pipeline health and team performance." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const { kpis, pipelineByStatus, leadSourceAnalytics, countryDistribution, campaignPerformance, representativePerformance, monthlyTrends } = data;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Real-time visibility into pipeline health, campaigns, and team performance." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <KpiCard label="Total Leads" value={kpis.totalLeads} icon={Target} accent="primary" />
        <KpiCard label="Qualified" value={kpis.qualifiedLeads} icon={CheckCircle2} accent="primary" />
        <KpiCard label="Meetings" value={kpis.meetingsCount} icon={CalendarClock} accent="primary" />
        <KpiCard label="Opportunities" value={kpis.opportunities} icon={TrendingUp} accent="warning" />
        <KpiCard label="Wins" value={kpis.wins} icon={Trophy} accent="success" />
        <KpiCard label="Losses" value={kpis.losses} icon={XCircle} accent="destructive" />
        <KpiCard label="Conversion Rate" value={`${kpis.conversionRate}%`} icon={Percent} accent="primary" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={pipelineByStatus} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid horizontal={false} stroke={CHART_INK.grid} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="status"
                  width={130}
                  tickFormatter={(v) => humanizeEnum(v)}
                  tick={{ fontSize: 12, fill: CHART_INK.secondary }}
                  axisLine={{ stroke: CHART_INK.axis }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [value, 'Leads']}
                  labelFormatter={(label) => humanizeEnum(String(label))}
                  contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_INK.grid}`, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {pipelineByStatus.map((entry) => (
                    <Cell key={entry.status} fill={pipelineColor(entry.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Source Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={leadSourceAnalytics}
                  dataKey="count"
                  nameKey="source"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                  strokeWidth={2}
                  stroke={CHART_INK.surface}
                >
                  {leadSourceAnalytics.map((entry) => (
                    <Cell key={entry.source} fill={LEAD_SOURCE_COLORS[entry.source] ?? CATEGORICAL[7]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, _n, item) => [value, humanizeEnum(String(item.payload.source))]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend formatter={(value) => <span className="text-xs text-muted-foreground">{humanizeEnum(String(value))}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Lead Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyTrends}>
                <defs>
                  <linearGradient id="monthlyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CATEGORICAL[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CATEGORICAL[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" name="New Leads" stroke={CATEGORICAL[0]} strokeWidth={2} fill="url(#monthlyFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Country Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={countryDistribution} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid horizontal={false} stroke={CHART_INK.grid} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
                <YAxis type="category" dataKey="country" width={90} tick={{ fontSize: 12, fill: CHART_INK.secondary }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="Companies" fill={CATEGORICAL[0]} radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {campaignPerformance.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No campaign activity yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={campaignPerformance}>
                <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Bar dataKey="won" name="Won" fill={STATUS.good} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="lost" name="Lost" fill={STATUS.critical} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Representative Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Representative</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">In Progress</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Lost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {representativePerformance.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No assigned leads yet.
                  </TableCell>
                </TableRow>
              )}
              {representativePerformance.map((rep) => (
                <TableRow key={rep.userId}>
                  <TableCell className="font-medium">{rep.name}</TableCell>
                  <TableCell className="text-muted-foreground">{humanizeEnum(rep.role)}</TableCell>
                  <TableCell className="text-right">{rep.totalLeads}</TableCell>
                  <TableCell className="text-right">{rep.inProgress}</TableCell>
                  <TableCell className="text-right font-medium text-success">{rep.won}</TableCell>
                  <TableCell className="text-right font-medium text-destructive">{rep.lost}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
