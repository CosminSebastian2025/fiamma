import { Redirect } from 'expo-router';
import { Splash } from '@/components/Splash';
import { useAuth } from '@/lib/auth-context';

export default function Index() {
  const { loading, session, profile } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile?.is_onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/discover" />;
}
