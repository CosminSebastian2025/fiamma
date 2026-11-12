import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getProfile } from './api';
import { isConfigured } from './env';
import { getSupabase } from './supabase';
import type { Profile } from './types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const next = await getProfile(userId);
      if (mounted.current) setProfile(next);
    } catch {
      if (mounted.current) setProfile(null);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!isConfigured) {
      setLoading(false);
      return () => {
        mounted.current = false;
      };
    }

    const supabase = getSupabase();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted.current) return;
        setSession(data.session);
        if (data.session?.user) {
          void loadProfile(data.session.user.id).finally(() => {
            if (mounted.current) setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted.current) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        // Defer: evita chiamate Supabase dentro il callback di auth.
        setTimeout(() => {
          if (mounted.current) void loadProfile(nextSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted.current = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    const { data } = await getSupabase().auth.getUser();
    if (data.user) await loadProfile(data.user.id);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      configured: isConfigured,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return context;
}
