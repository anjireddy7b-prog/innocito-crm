import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
  LineChart, Line, Legend,
} from 'recharts';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { humanizeEnum } from '@/lib/utils';
import { CATEGORICAL, CHART_INK } from '@/lib/chartColors';
import { REPORT_METRIC_LABELS, type ReportResult } from '@/api/reportBuilder';

/**
 * Renders a report's `rows` per its `chartType`. Rows come from an arbitrary, user-chosen groupBy
 * dimension (not a fixed known category set like LEAD_SOURCE_COLORS) so — per the dataviz skill's
 * "never a generated hue for a 9th series" rule — anything past the fixed 8-color categorical
 * palette folds into a single "Other" bucket rather than cycling colors. A time-series groupBy
 * (CREATED_MONTH/LEAD_RECEIVED_MONTH) is always a single series, so LINE uses one fixed hue rather
 * than the categorical palette at all.
 */
const MAX_CATEGORICAL_SLICES = CATEGORICAL.length;

function foldIntoOther(rows: ReportResult['rows']) {
  if (rows.length <= MAX_CATEGORICAL_SLICES) return rows;
  const head = rows.slice(0, MAX_CATEGORICAL_SLICES - 1);
  const rest = rows.slice(MAX_CATEGORICAL_SLICES - 1);
  const otherValue = rest.reduce((sum, r) => sum + r.value, 0);
  return [...head, { key: '__other__', label: `Other (${rest.length})`, value: otherValue }];
}

function displayLabel(groupBy: ReportResult['groupBy'], label: string) {
  if (groupBy === 'STATUS' || groupBy === 'PRIORITY' || groupBy === 'SOURCE') return humanizeEnum(label);
  return label;
}

function formatValue(metric: ReportResult['metric'], value: number) {
  if (metric === 'COUNT') return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function ReportResultView({ result }: { result: ReportResult }) {
  if (result.rows.length === 0) {
    return <EmptyState title="No data for this report" description="No leads match the current filters." />;
  }

  const metricLabel = REPORT_METRIC_LABELS[result.metric];
  const isTimeSeries = result.groupBy === 'CREATED_MONTH' || result.groupBy === 'LEAD_RECEIVED_MONTH';

  if (result.chartType === 'TABLE') {
    const rows = [...result.rows].sort((a, b) => b.value - a.value);
    return (
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">{metricLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{displayLabel(result.groupBy, r.label)}</TableCell>
                <TableCell className="text-right">{formatValue(result.metric, r.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (result.chartType === 'LINE') {
    const rows = isTimeSeries ? result.rows : [...result.rows].sort((a, b) => a.label.localeCompare(b.label));
    const data = rows.map((r) => ({ name: displayLabel(result.groupBy, r.label), value: r.value }));
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={false} tickLine={false} width={40} />
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatValue(result.metric, v), metricLabel]} />
          <Line type="monotone" dataKey="value" name={metricLabel} stroke={CATEGORICAL[0]} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const rows = foldIntoOther([...result.rows].sort((a, b) => b.value - a.value));
  const data = rows.map((r) => ({ name: displayLabel(result.groupBy, r.label), value: r.value }));

  if (result.chartType === 'PIE') {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2} strokeWidth={2} stroke={CHART_INK.surface}>
            {data.map((entry, i) => <Cell key={entry.name} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number, _n, item: any) => [formatValue(result.metric, v), item.payload.name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // BAR (default)
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid horizontal={false} stroke={CHART_INK.grid} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: CHART_INK.muted }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: CHART_INK.secondary }} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
        <Tooltip formatter={(v: number) => [formatValue(result.metric, v), metricLabel]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((entry, i) => <Cell key={entry.name} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
