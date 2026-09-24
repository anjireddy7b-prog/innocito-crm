import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loginRequest, mfaLoginVerifyRequest } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage } from '@/lib/api';
import sdrReachOutLogoFull from '@/assets/sdr-reachout-logo-full.png';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

const mfaSchema = z.object({
  code: z.string().trim().min(1, 'Enter the code from your authenticator app'),
});
type MfaFormValues = z.infer<typeof mfaSchema>;

export default function LoginPage() {
  const { status, setSession } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  // Phase 15 (security hardening) — TOTP-based MFA. Set only when login()'s response comes back
  // with mfaRequired: true (see api/auth.ts's LoginResult) — the password step is already done at
  // that point, so this component never re-collects or re-sends it; the challenge token alone is
  // what mfaLoginVerifyRequest exchanges for a real session.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const {
    register: registerMfa,
    handleSubmit: handleMfaSubmit,
    formState: { errors: mfaErrors },
    setFocus: setMfaFocus,
  } = useForm<MfaFormValues>({ resolver: zodResolver(mfaSchema) });

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  function completeLogin(user: Parameters<typeof setSession>[0], accessToken: string) {
    setSession(user, accessToken);
    const dest = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard';
    navigate(dest, { replace: true });
    toast.success(`Welcome back, ${user.firstName}!`);
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const result = await loginRequest(values.email, values.password);
      if (result.mfaRequired) {
        setChallengeToken(result.challengeToken);
        setTimeout(() => setMfaFocus('code'), 0);
        return;
      }
      completeLogin(result.user, result.accessToken);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Invalid email or password'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onMfaSubmit(values: MfaFormValues) {
    if (!challengeToken) return;
    setSubmitting(true);
    try {
      const { accessToken, user } = await mfaLoginVerifyRequest(challengeToken, values.code);
      completeLogin(user, accessToken);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Invalid or expired code'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Soft, blurred color fields behind the glass card — the same "light shining through
          frosted glass" impression as Apple's own marketing pages, built from flat gradients
          rather than a photo so it never distracts from the form. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-purple-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-success/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src={sdrReachOutLogoFull} alt="SDR ReachOut" className="h-16 w-auto drop-shadow-sm" />
          <p className="text-sm text-muted-foreground">Internal Lead Management Platform</p>
        </div>

        <Card className="glass-panel border-white/60 shadow-glass-lg">
          {challengeToken ? (
            <>
              <CardHeader>
                <CardTitle>Enter your verification code</CardTitle>
                <CardDescription>Open your authenticator app and enter the current 6-digit code, or use one of your backup codes.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleMfaSubmit(onMfaSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Verification code</Label>
                    <Input
                      id="code"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      autoFocus
                      {...registerMfa('code')}
                    />
                    {mfaErrors.code && <p className="text-xs text-destructive">{mfaErrors.code.message}</p>}
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Verify
                  </Button>
                  <button
                    type="button"
                    onClick={() => setChallengeToken(null)}
                    className="w-full text-center text-xs text-muted-foreground hover:underline"
                  >
                    Back to sign in
                  </button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Sign in</CardTitle>
                <CardDescription>
                  Use the credentials your Admin provided, or{' '}
                  <Link to="/signup" className="font-medium text-primary hover:underline">
                    create your organization
                  </Link>{' '}
                  if your team is new here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" type="email" autoComplete="username" placeholder="you@sdrreachout.com" {...register('email')} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" {...register('password')} />
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sign in
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Forgot your password? Contact your SDR ReachOut Administrator to reset it.
        </p>
      </div>
    </div>
  );
}
