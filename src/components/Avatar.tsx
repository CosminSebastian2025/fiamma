import { Image, StyleSheet, Text, View } from 'react-native';
import { initials } from '../lib/format';
import { colors } from '../lib/theme';

interface Props {
  name: string;
  uri?: string | null;
  size?: number;
}

export function Avatar({ name, uri, size = 48 }: Props) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimension]} />;
  }
  return (
    <View style={[styles.fallback, dimension]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name) || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceAlt },
  fallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: colors.text, fontWeight: '700' },
});
