import { LinearGradient } from 'expo-linear-gradient';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';
import { Avatar } from './Avatar';
import { Button } from './Button';

interface Props {
  visible: boolean;
  name: string;
  photoUrl?: string | null;
  onClose: () => void;
  onChat: () => void;
}

export function MatchModal({ visible, name, photoUrl, onClose, onChat }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <LinearGradient
          colors={[colors.accentDark, colors.bg]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.panel}
        >
          <Text style={styles.kicker}>È UN MATCH</Text>
          <Avatar name={name} uri={photoUrl} size={96} />
          <Text style={styles.title}>Tu e {name}</Text>
          <Text style={styles.body}>
            Vi siete piaciuti a vicenda. È il momento giusto per rompere il ghiaccio.
          </Text>
          <View style={styles.actions}>
            <Button label="Scrivi un messaggio" onPress={onChat} />
            <Button label="Continua a scoprire" variant="ghost" onPress={onClose} />
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  kicker: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  title: { color: '#fff', fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  body: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
});
