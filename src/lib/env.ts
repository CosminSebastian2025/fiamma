export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  maxDeckDistanceKm: Number(process.env.EXPO_PUBLIC_MAX_DISTANCE_KM ?? 50),
} as const;

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
