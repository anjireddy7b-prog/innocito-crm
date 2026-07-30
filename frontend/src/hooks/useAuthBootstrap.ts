import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { refreshRequest, meRequest } from '@/api/auth';

/**
 * On first load, silently attempts to exchange the httpOnly refresh-token
 * cookie (if present) for a fresh access token, so a page reload doesn't
 * force the user back to the login screen.
 */
export function useAuthBootstrap() {
  const { setSession, setStatus, status } = useAuthStore();

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setStatus('loading');
      try {
        const { accessToken } = await refreshRequest();
        useAuthStore.setState({ accessToken });
        const user = await meRequest();
        if (!cancelled) setSession(user, accessToken);
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}
