import React, { useEffect } from 'react';
import type { StyleProp, ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from './motion';

/**
 * The coach's poses (transparent sticker art, 512px). Pick by state, not by taste:
 *   blowing      calling you out / welcome / push to act
 *   cheer        list cleared, big win, level up
 *   clipboard    plans, recaps, "here is your list"
 *   disappointed missed day, error, broke streak
 *   flex         workout logged, strong streak
 *   proud        done well, thumbs up, small win
 *   sleepy       empty / nothing yet / quiet hours
 *   waiting      waiting for you (login wait, pending, loading something slow)
 */
export type CoachPose = 'blowing' | 'cheer' | 'clipboard' | 'disappointed' | 'flex' | 'proud' | 'sleepy' | 'waiting';

const sources: Record<CoachPose, number> = {
  blowing: require('../../assets/stickers/blowing.webp'),
  cheer: require('../../assets/stickers/cheer.webp'),
  clipboard: require('../../assets/stickers/clipboard.webp'),
  disappointed: require('../../assets/stickers/disappointed.webp'),
  flex: require('../../assets/stickers/flex.webp'),
  proud: require('../../assets/stickers/proud.webp'),
  sleepy: require('../../assets/stickers/sleepy.webp'),
  waiting: require('../../assets/stickers/waiting.webp'),
};

export const coachPoses = Object.keys(sources) as CoachPose[];

export interface CoachStickerProps {
  pose: CoachPose;
  size?: number;
  /** Gentle idle bob. Off when Reduce Motion is on. */
  animated?: boolean;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

export function CoachSticker({ pose, size = 160, animated = false, style, accessibilityLabel }: CoachStickerProps) {
  const reduce = useReduceMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!animated || reduce) {
      y.value = 0;
      return;
    }
    y.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [animated, reduce, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={anim}>
      <Image
        source={sources[pose]}
        style={[{ width: size, height: size }, style]}
        contentFit="contain"
        accessibilityLabel={accessibilityLabel ?? `Coach, ${pose}`}
        transition={0}
      />
    </Animated.View>
  );
}
