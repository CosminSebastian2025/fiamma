import { LinearGradient } from 'expo-linear-gradient';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ageFromBirthdate, distanceLabel, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import type { DeckProfile, SwipeDecision } from '@/lib/types';

export interface SwipeCardHandle {
  swipe: (decision: SwipeDecision) => void;
}

interface Props {
  profile: DeckProfile;
  onDecision: (decision: SwipeDecision) => void;
  isTop: boolean;
}

export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard(
  { profile, onDecision, isTop },
  ref,
) {
  const { width } = useWindowDimensions();
  const position = useRef(new Animated.ValueXY()).current;
  const animating = useRef(false);

  const fling = useCallback(
    (decision: SwipeDecision) => {
      if (animating.current) return;
      animating.current = true;
      Animated.timing(position, {
        toValue: { x: decision === 'like' ? width * 1.5 : -width * 1.5, y: 0 },
        duration: 230,
        useNativeDriver: false,
      }).start(() => {
        animating.current = false;
        position.setValue({ x: 0, y: 0 });
        onDecision(decision);
      });
    },
    [onDecision, position, width],
  );

  useImperativeHandle(ref, () => ({ swipe: fling }), [fling]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          isTop && (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6),
        onPanResponderMove: Animated.event(
          [null, { dx: position.x, dy: position.y }],
          { useNativeDriver: false },
        ),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > 110) fling('like');
          else if (gesture.dx < -110) fling('pass');
          else {
            Animated.spring(position, {
              toValue: { x: 0, y: 0 },
              friction: 6,
              tension: 60,
              useNativeDriver: false,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        },
      }),
    [fling, isTop, position],
  );

  const rotate = position.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-11deg', '0deg', '11deg'],
    extrapolate: 'clamp',
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [30, 110],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const passOpacity = position.x.interpolate({
    inputRange: [-110, -30],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const photo = profile.photoUrls[0];
  const age = ageFromBirthdate(profile.birthdate);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { rotate },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={[colors.surfaceAlt, colors.surface]}
          style={[StyleSheet.absoluteFill, styles.placeholder]}
        >
          <Text style={styles.placeholderInitials}>{initials(profile.display_name)}</Text>
        </LinearGradient>
      )}

      <LinearGradient
        colors={['rgba(13,12,17,0.05)', 'rgba(13,12,17,0.35)', 'rgba(13,12,17,0.96)']}
        locations={[0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.stamp, styles.likeStamp, { opacity: likeOpacity }]}>
        <Text style={styles.likeStampText}>MI PIACE</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.passStamp, { opacity: passOpacity }]}>
        <Text style={styles.passStampText}>PASSA</Text>
      </Animated.View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {profile.display_name}
          {age ? <Text style={styles.age}>, {age}</Text> : null}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {distanceLabel(profile.distance_km)}
          {profile.job_title ? ` · ${profile.job_title}` : ''}
        </Text>
        {profile.bio ? (
          <Text style={styles.bio} numberOfLines={2}>
            {profile.bio}
          </Text>
        ) : null}
        {profile.interests.length > 0 ? (
          <View style={styles.interests}>
            {profile.interests.slice(0, 4).map((interest) => (
              <View key={interest} style={styles.interestChip}>
                <Text style={styles.interestLabel}>{interest}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.lg + 4,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderInitials: {
    color: 'rgba(255,255,255,0.18)',
    fontSize: 96,
    fontWeight: '800',
  },
  stamp: {
    position: 'absolute',
    top: 28,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 3,
    transform: [{ rotate: '-12deg' }],
  },
  likeStamp: { left: 22, borderColor: colors.success, transform: [{ rotate: '-12deg' }] },
  passStamp: { right: 22, borderColor: colors.accentSoft, transform: [{ rotate: '12deg' }] },
  likeStampText: {
    color: colors.success,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  passStampText: {
    color: colors.accentSoft,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  info: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: 6,
  },
  name: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  age: { fontWeight: '500', color: 'rgba(255,255,255,0.86)' },
  meta: { color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '600' },
  bio: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, marginTop: 2 },
  interests: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  interestChip: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  interestLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
