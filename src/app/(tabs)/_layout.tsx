import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { Splash } from '@/components/Splash';
import { useAuth } from '@/lib/auth-context';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { loading, session, profile } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile?.is_onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Scopri',
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="flame"
              size={size}
              color={focused ? colors.accent : colors.muted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Match',
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="chatbubbles"
              size={size}
              color={focused ? colors.accent : colors.muted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profilo',
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="person-circle"
              size={size}
              color={focused ? colors.accent : colors.muted}
            />
          ),
        }}
      />
    </Tabs>
  );
}
