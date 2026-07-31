import { useState } from 'react';
import { FileSpreadsheet, FileText, FileDown, Target, Trophy, XCircle, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useDashboardSummary } from '@/api/dashboard';
import { humanizeEnum } from '@/lib/utils';
import { downloadFile } from '@/lib/download';
import { apiErrorMessage } from '@/lib/api';
import { PeriodFilter, type PeriodFilterValue } from '@/components/shared/PeriodFilter';

export default function ReportsPage() {
  const [period, setPeriod] = useState<PeriodFilterValue>({ period: 'all' });
  const { data, isLoading } = useDashboardSummary(period);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'xlsx' | 'pdf' | null>(null);

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    setExportingFormat(format);
    try {
      await downloadFile(`/reports/leads/export.${format}`, `leads-export.${format}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to export leads'));
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={
          data?.appliedPeriod && data.appliedPeriod.period !== 'all'
            ? `Showing ${data.appliedPeriod.label} — pipeline, campaign, and team performance.`
            : 'Pipeline, campaign, and team performance reports with exportable lead data.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <Button variant="outline" onClick={() => handleExport('csv')} loading={exportingFormat === 'csv'}>
              <FileDown /> CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport('xlsx')} loading={exportingFormat === 'xlsx'}>
              <FileSpreadsheet /> Excel
            </Button>
            <Button variant="outline" onClick={() => handleExport('pdf')} loading={exportingFormat === 'pdf'}>
              <FileText /> PDF
            </Button>
          </div>
        }
      />

      {isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="Total Leads" value={data.kpis.totalLeads} icon={Target} accent="primary" />
            <KpiCard label="Wins" value={data.kpis.wins} icon={Trophy} accent="success" />
            <KpiCard label="Losses" value={data.kpis.losses} icon={XCircle} accent="destructive" />
            <KpiCard label="Conversion Rate" value={`${data.kpis.conversionRate}%`} icon={Percent} accent="primary" />
          </div>

          <Card>
            <CardHeader><CardTitle>Campaign Performance</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Total Leads</TableHead>
                    <TableHead className="text-right">Won</TableHead>
                    <TableHead className="text-right">Lost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.campaignPerformance.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No campaign activity yet.</TableCell></TableRow>
                  )}
                  {data.campaignPerformance.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right">{c.totalLeads}</TableCell>
                      <TableCell className="text-right font-medium text-success">{c.won}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">{c.lost}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Representative Performance</CardTitle></CardHeader>
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
                  {data.representativePerformance.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No assigned leads yet.</TableCell></TableRow>
                  )}
                  {data.representativePerformance.map((rep) => (
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

          <Card>
            <CardHeader><CardTitle>Lead Source Analytics</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Source</TableHead><TableHead className="text-right">Leads</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {data.leadSourceAnalytics.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell className="font-medium">{humanizeEnum(s.source)}</TableCell>
                      <TableCell className="text-right">{s.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
