import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, totalPages, onPageChange }: PaginationProps) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–<span className="font-medium text-foreground">{to}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPageChange(1)}>
          <ChevronsLeft />
        </Button>
        <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft />
        </Button>
        <span className="px-3 text-sm font-medium">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight />
        </Button>
        <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );
}
