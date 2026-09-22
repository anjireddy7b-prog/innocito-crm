import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { signupRequest } from '@/api/organizations';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage } from '@/lib/api';
import sdrReachOutLogoFull from '@/assets/sdr-reachout-logo-full.png';

const schema = z
  .object({
    organizationName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(200),
    firstName: z.string().trim().min(1, 'First name is required').max(100),
    lastName: z.string().trim().min(1, 'Last name is required').max(100),
    email: z.string().trim().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const { status, setSession } = useAuthStore();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const { accessToken, user, organization } = await signupRequest({
        organizationName: values.organizationName,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      });
      setSession(user, accessToken);
      navigate('/dashboard', { replace: true });
      toast.success(`Welcome to SDR ReachOut, ${user.firstName}! ${organization.name} is ready to go.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create your organization'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-purple-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-success/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src={sdrReachOutLogoFull} alt="SDR ReachOut" className="h-16 w-auto drop-shadow-sm" />
          <p className="text-sm text-muted-foreground">Set up your team's workspace</p>
        </div>

        <Card className="glass-panel border-white/60 shadow-glass-lg">
          <CardHeader>
            <CardTitle>Create your organization</CardTitle>
            <CardDescription>You'll be the first Admin — invite the rest of your team from Settings afterward.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="organizationName">Organization name</Label>
                <Input id="organizationName" autoComplete="organization" placeholder="Acme Inc." {...register('organizationName')} />
                {errors.organizationName && <p className="text-xs text-destructive">{errors.organizationName.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
                  {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" autoComplete="family-name" {...register('lastName')} />
                  {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" autoComplete="username" placeholder="you@yourcompany.com" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="new-password" placeholder="••••••••" {...register('password')} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input id="confirmPassword" type="password" autoComplete="new-password" placeholder="••••••••" {...register('confirmPassword')} />
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create organization
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
