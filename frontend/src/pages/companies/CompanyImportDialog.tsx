import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useImportCompanies, type CompanyImportResult } from '@/api/companies';
import { apiErrorMessage } from '@/lib/api';

// Mirrors LeadImportDialog.tsx's structure exactly — same drag/click file picker, same
// result-summary layout — just for CompanyImportResult's field names instead of LeadImportResult's.
export function CompanyImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CompanyImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importCompanies = useImportCompanies();

  function reset() {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  async function handleImport() {
    if (!file) return;
    try {
      const data = await importCompanies.mutateAsync(file);
      setResult(data);
      if (data.companiesCreated > 0 || data.contactsCreated > 0) {
        toast.success(`Imported ${data.companiesCreated} compan${data.companiesCreated === 1 ? 'y' : 'ies'} and ${data.contactsCreated} contact${data.contactsCreated === 1 ? '' : 's'}`);
      } else {
        toast.info('No new companies or contacts were added — see details below.');
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Import failed'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Import Companies</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel (.xlsx) file to add companies — and, optionally, one contact per row — in bulk.
            Existing companies are matched by name and reused rather than duplicated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!result && (
            <>
              <div
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center hover:border-primary/50"
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <>
                    <FileSpreadsheet className="h-8 w-8 text-primary" />
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">Click to choose a different file</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Click to choose a .csv or .xlsx file</p>
                    <p className="text-xs text-muted-foreground">Expected columns: Company, Industry, Website, Contact Name, Email, …</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </>
          )}

          {result && (
            <div className="space-y-3 rounded-lg border border-border p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Import finished
              </div>
              <dl className="grid grid-cols-2 gap-y-1.5">
                <dt className="text-muted-foreground">Rows in file</dt>
                <dd className="text-right font-medium">{result.totalDataRows}</dd>
                <dt className="text-muted-foreground">Companies created</dt>
                <dd className="text-right font-medium text-success">{result.companiesCreated}</dd>
                <dt className="text-muted-foreground">Contacts created</dt>
                <dd className="text-right font-medium text-success">{result.contactsCreated}</dd>
                <dt className="text-muted-foreground">Skipped — contact already existed</dt>
                <dd className="text-right font-medium">{result.skippedDuplicateContacts}</dd>
                <dt className="text-muted-foreground">Skipped — missing Company</dt>
                <dd className="text-right font-medium">{result.skippedInvalidRows}</dd>
              </dl>
              {result.errors.length > 0 && (
                <div className="space-y-1 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
                  <div className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> {result.errors.length} row(s) had errors</div>
                  <ul className="max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4">
                    {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={reset}>Import Another File</Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleImport} loading={importCompanies.isPending} disabled={!file}>Import</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
