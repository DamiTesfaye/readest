import { useEffect, useState } from 'react';
import { getSession, onSessionChange, type StoredSession } from '@/services/ampleread/auth/session';

export const useAmpleReadSession = (): StoredSession | null => {
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    let active = true;
    getSession().then((stored) => {
      if (active) setSession(stored);
    });
    const unsubscribe = onSessionChange(setSession);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return session;
};
