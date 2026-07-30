import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  cell: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (key: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  skeletonRows?: number;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  rowKey,
  onRowClick,
  sortBy,
  sortDir,
  onSortChange,
  emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your filters or search terms.',
  skeletonRows = 8,
}: DataTableProps<T>) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.sortable ? (
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => onSortChange?.(col.key)}
                  >
                    {col.header}
                    {sortBy === col.key ? (
                      sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <Skeleton className="h-4 w-full max-w-[160px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isLoading &&
            data.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {!isLoading && data.length === 0 && <EmptyState title={emptyTitle} description={emptyDescription} />}
    </div>
  );
}
