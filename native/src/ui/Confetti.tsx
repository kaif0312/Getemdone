import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from './motion';
import { brand } from './theme';

const COLORS = [brand.orange, brand.sun, brand.purple, brand.green, '#FF8FB8', '#5AA9FF'];
const PARTICLES = 44;
const DURATION = 1500;

interface Particle {
  vx: number;
  vy: number;
  rot: number;
  size: number;
  color: string;
  round: boolean;
  delay: number;
}
interface Burst {
  id: number;
  x: number;
  y: number;
  particles: Particle[];
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLES }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const speed = 260 + Math.random() * 420;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: (Math.random() - 0.5) * 900,
      size: 7 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.35,
      delay: Math.random() * 60,
    };
  });
}

function ParticleView({ p }: { p: Particle }) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    t.value = withDelay(p.delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }));
  }, [p.delay, t]);
  const style = useAnimatedStyle(() => {
    const s = t.value * (DURATION / 1000);
    return {
      opacity: t.value < 0.72 ? 1 : 1 - (t.value - 0.72) / 0.28,
      transform: [
        { translateX: p.vx * s * 0.55 },
        { translateY: p.vy * s * 0.55 + 0.5 * 1500 * s * s * 0.45 },
        { rotate: `${p.rot * t.value}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: p.size, height: p.round ? p.size : p.size * 0.55, borderRadius: p.round ? p.size : 2, backgroundColor: p.color },
        style,
      ]}
    />
  );
}

interface ConfettiApi {
  /** Burst from a point (screen coords). Default: upper third, centre. No-op under Reduce Motion. */
  fire: (origin?: { x: number; y: number }) => void;
}
const ConfettiContext = createContext<ConfettiApi>({ fire: () => {} });

export function useConfetti(): ConfettiApi {
  return useContext(ConfettiContext);
}

/** Mount once near the root (app/_layout.tsx). Screens call `useConfetti().fire()` e.g. when the list is cleared. */
export function ConfettiProvider({ children }: { children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const next = useRef(1);

  const fire = useCallback(
    (origin?: { x: number; y: number }) => {
      if (reduce) return;
      const id = next.current++;
      const burst: Burst = { id, x: origin?.x ?? width / 2, y: origin?.y ?? height * 0.38, particles: makeParticles() };
      setBursts((b) => [...b, burst]);
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), DURATION + 400);
    },
    [reduce, width, height],
  );

  const api = useMemo(() => ({ fire }), [fire]);
  return (
    <ConfettiContext.Provider value={api}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {bursts.map((b) => (
          <View key={b.id} style={{ position: 'absolute', left: b.x, top: b.y }}>
            {b.particles.map((p, i) => (
              <ParticleView key={i} p={p} />
            ))}
          </View>
        ))}
      </View>
    </ConfettiContext.Provider>
  );
}
