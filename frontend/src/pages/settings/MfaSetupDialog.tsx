import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setupMfaRequest, enableMfaRequest, type MfaSetup } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage } from '@/lib/api';

const schema = z.object({ code: z.string().trim().min(1, 'Enter the 6-digit code from your app') });
type FormValues = z.infer<typeof schema>;

/**
 * Phase 15 (security hardening) — TOTP-based MFA, self-service setup. Three steps, none of which
 * can be skipped or reordered: (1) fetch a fresh secret + QR code from the server (setupMfaRequest
 * — this only STAGES the secret server-side, see backend/src/modules/auth/auth.service.ts's
 * setupMfa comment; MFA isn't actually on yet), (2) prove the app was set up correctly by
 * confirming a live code from it (enableMfaRequest — this is the point MFA actually turns on),
 * (3) show the 8 backup codes exactly once, the same "shown once, never again" treatment
 * ApiKeyFormDialog.tsx gives a freshly-created API key secret.
 */
export function MfaSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const updateUser = useAuthStore((s) => s.updateUser);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    setSetup(null);
    setBackupCodes(null);
    setCopied(false);
    reset({ code: '' });
    setLoadingSetup(true);
    setupMfaRequest()
      .then(setSetup)
      .catch((err) => {
        toast.error(apiErrorMessage(err, 'Failed to start MFA setup'));
        onOpenChange(false);
      })
      .finally(() => setLoadingSetup(false));
    // onOpenChange is stable (setState-derived from the parent) — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    setConfirming(true);
    try {
      const result = await enableMfaRequest(values.code);
      setBackupCodes(result.backupCodes);
      updateUser({ mfaEnabled: true });
      toast.success('MFA enabled');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'That code is incorrect or expired'));
    } finally {
      setConfirming(false);
    }
  }

  async function handleCopyAll() {
    if (!backupCodes) return;
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      toast.success('Copied to clipboard');
    } catch {
      toast.error("Couldn't copy — select and copy the codes manually");
    }
  }

  if (backupCodes) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Save your backup codes</DialogTitle>
            <DialogDescription>
              Each code can be used once, in place of your authenticator app, if you ever lose access to it. They're shown only this once — store them somewhere safe now.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-secondary/40 p-4">
              {backupCodes.map((code) => (
                <code key={code} className="text-sm">{code}</code>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={handleCopyAll}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy all codes
            </Button>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Generating new backup codes later (by re-running setup) replaces this entire set — these ones stop working.</span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Enable two-factor authentication</DialogTitle>
          <DialogDescription>Scan this code with an authenticator app (Google Authenticator, 1Password, Authy, ...), then enter the 6-digit code it shows.</DialogDescription>
        </DialogHeader>

        {loadingSetup || !setup ? (
          <p className="text-sm text-muted-foreground">Generating your secret…</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <img src={setup.qrCodeDataUrl} alt="Scan with your authenticator app" className="h-44 w-44 rounded-lg border border-border/60 bg-white p-2" />
              <p className="text-center text-xs text-muted-foreground">
                Can't scan it? Enter this code manually: <code className="font-medium">{setup.secret}</code>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">6-digit code</Label>
              <Input id="mfa-code" autoFocus autoComplete="one-time-code" placeholder="123456" {...register('code')} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" loading={confirming}>Confirm & Enable</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
