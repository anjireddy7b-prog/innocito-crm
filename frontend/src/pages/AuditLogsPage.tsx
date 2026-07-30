import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuditLogs } from '@/api/auditLogs';
import { formatDateTime, humanizeEnum } from '@/lib/utils';
import type { AuditLogEntry } from '@/types';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'ASSIGN', 'STATUS_CHANGE'];
const ENTITY_TYPES = ['Lead', 'Company', 'Contact', 'Campaign', 'Meeting', 'Task', 'Document', 'User', 'Comment'];

const ACTION_STYLES: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  LOGIN: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  LOGOUT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  EXPORT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ASSIGN: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  STATUS_CHANGE: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

export default function AuditLogsPage() {
  const [params, setParams] = useSearchParams();
  const [userIdSearch, setUserIdSearch] = useState('');

  const page = Number(params.get('page') ?? 1);
  const query = useMemo(
    () => ({
      page,
      pageSize: 25,
      entityType: params.get('entityType') || undefined,
      action: params.get('action') || undefined,
    }),
    [page, params]
  );
  const { data, isLoading } = useAuditLogs(query);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  const columns: DataTableColumn<AuditLogEntry>[] = [
    { key: 'createdAt', header: 'Timestamp', cell: (l) => formatDateTime(l.createdAt) },
    { key: 'action', header: 'Action', cell: (l) => <Badge className={`border-transparent font-medium ${ACTION_STYLES[l.action] ?? ''}`}>{humanizeEnum(l.action)}</Badge> },
    { key: 'entityType', header: 'Entity', cell: (l) => l.entityType },
    { key: 'user', header: 'User', cell: (l) => l.user ? `${l.user.firstName} ${l.user.lastName}` : 'System' },
    { key: 'ipAddress', header: 'IP Address', cell: (l) => l.ipAddress ?? '—' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Logs" description="A complete, tamper-evident record of every create, update, delete, and access action." />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={params.get('action') ?? '__all__'} onValueChange={(v) => updateParam('action', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All actions</SelectItem>
            {ACTIONS.map((a) => <SelectItem key={a} value={a}>{humanizeEnum(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={params.get('entityType') ?? '__all__'} onValueChange={(v) => updateParam('entityType', v === '__all__' ? null : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All entities</SelectItem>
            {ENTITY_TYPES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by user ID…"
          className="w-56"
          value={userIdSearch}
          onChange={(e) => setUserIdSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && updateParam('userId', userIdSearch || null)}
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(l) => l.id}
        emptyTitle="No audit log entries"
        emptyDescription="System activity will be recorded here as users interact with the CRM."
      />

      {data?.meta && (
        <Pagination
          page={data.meta.page}
          pageSize={data.meta.pageSize}
          total={data.meta.total}
          totalPages={data.meta.totalPages}
          onPageChange={(p) => updateParam('page', String(p))}
        />
      )}
    </div>
  );
}
