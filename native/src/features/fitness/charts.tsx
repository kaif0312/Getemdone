/**
 * Small hand-drawn charts (react-native-svg + Reanimated; no chart library).
 *   <Sparkline values kind="line"|"bars" goal color />   one series over N days, null = no data that day
 *   <GroupedBars a b labels />                          this week vs last week
 * Both measure their own width (onLayout) and animate in (line draws, bars grow). Reduce Motion: instant.
 */
import React, { useEffect, useId, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReduceMotion, useTheme } from '@/ui';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function useWidth() {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== w) setW(next);
  };
  return [w, onLayout] as const;
}

/** 0 -> 1 once on mount (instant with Reduce Motion). */
function useGrow(delay = 0, duration = 650) {
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? 1 : withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [reduce, delay, duration, p]);
  return p;
}

function Bar({ x, w, h, base, fill, delay, radius = 4 }: { x: number; w: number; h: number; base: number; fill: string; delay: number; radius?: number }) {
  const p = useGrow(delay);
  const props = useAnimatedProps(() => ({ y: base - h * p.value, height: Math.max(0, h * p.value) }));
  return <AnimatedRect x={x} width={w} rx={radius} fill={fill} animatedProps={props} />;
}

export interface SparklineProps {
  values: (number | null)[];
  kind?: 'line' | 'bars';
  color: string;
  height?: number;
  /** Dashed target line. */
  goal?: number;
  /** Floor of the y range (bars start at 0; lines auto-fit). */
  min?: number;
}

export function Sparkline({ values, kind = 'line', color, height = 64, goal, min }: SparklineProps) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const gid = 'sp' + useId().replace(/[^A-Za-z0-9]/g, '');
  const n = values.length;
  const known = values.filter((v): v is number => v !== null);

  const geo = useMemo(() => {
    if (!width || !known.length) return null;
    const padX = 6;
    const padY = 8;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    let lo = kind === 'bars' ? 0 : Math.min(...known, ...(goal !== undefined ? [goal] : []));
    let hi = Math.max(...known, ...(goal !== undefined ? [goal] : []));
    if (min !== undefined && kind === 'bars') lo = min;
    if (hi === lo) {
      hi += 1;
      if (kind === 'line') lo -= 1;
    }
    if (kind === 'line') {
      const span = hi - lo;
      lo -= span * 0.12;
      hi += span * 0.12;
    }
    const xAt = (i: number) => padX + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
    const yAt = (v: number) => padY + innerH - ((v - lo) / (hi - lo)) * innerH;
    const pts = values.map((v, i) => (v === null ? null : { x: xAt(i), y: yAt(v), v, i }));
    const have = pts.filter((p): p is { x: number; y: number; v: number; i: number } => p !== null);
    let d = '';
    let len = 0;
    have.forEach((p, i) => {
      if (i === 0) d = `M ${p.x} ${p.y}`;
      else {
        const q = have[i - 1];
        const mx = (q.x + p.x) / 2;
        d += ` C ${mx} ${q.y} ${mx} ${p.y} ${p.x} ${p.y}`;
        len += Math.hypot(p.x - q.x, p.y - q.y);
      }
    });
    const area = have.length > 1 ? `${d} L ${have[have.length - 1].x} ${height - padY} L ${have[0].x} ${height - padY} Z` : '';
    return { have, d, area, len: len * 1.15 + 4, yAt, innerW, padX, padY, innerH };
  }, [width, known, values, n, kind, goal, min, height]);

  const reduce = useReduceMotion();
  const draw = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    draw.value = reduce ? 1 : withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [reduce, draw]);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: (geo?.len ?? 0) * (1 - draw.value) }));

  return (
    <View onLayout={onLayout} style={{ height }}>
      {geo && width ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {goal !== undefined ? (
            <Line x1={geo.padX} x2={width - geo.padX} y1={geo.yAt(goal)} y2={geo.yAt(goal)} stroke={colors.textFaint} strokeWidth={1.5} strokeDasharray="4 5" />
          ) : null}
          {kind === 'bars'
            ? (() => {
                const slot = geo.innerW / n;
                const bw = Math.max(2, Math.min(10, slot * 0.62));
                return geo.have.map((p) => {
                  const h = Math.max(3, height - geo.padY - p.y);
                  const hit = goal !== undefined && p.v >= goal;
                  return (
                    <Bar
                      key={p.i}
                      x={geo.padX + p.i * slot + (slot - bw) / 2}
                      w={bw}
                      h={h}
                      base={height - geo.padY}
                      fill={hit ? colors.success : color}
                      delay={p.i * 14}
                      radius={Math.min(4, bw / 2)}
                    />
                  );
                });
              })()
            : (
              <>
                {geo.area ? <Path d={geo.area} fill={`url(#${gid})`} /> : null}
                {geo.have.length > 1 ? (
                  <AnimatedPath
                    d={geo.d}
                    stroke={color}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray={`${geo.len} ${geo.len}`}
                    animatedProps={lineProps}
                  />
                ) : null}
                {geo.have.map((p, i) =>
                  i === geo.have.length - 1 ? (
                    <React.Fragment key={p.i}>
                      <Circle cx={p.x} cy={p.y} r={7} fill={color} opacity={0.22} />
                      <Circle cx={p.x} cy={p.y} r={4.5} fill={color} stroke={colors.surface} strokeWidth={2} />
                    </React.Fragment>
                  ) : geo.have.length < 12 ? (
                    <Circle key={p.i} cx={p.x} cy={p.y} r={3} fill={color} />
                  ) : null,
                )}
              </>
            )}
        </Svg>
      ) : null}
    </View>
  );
}

export interface GroupedBarsProps {
  /** This period (solid). */
  a: number[];
  /** Previous period (faded). */
  b: number[];
  labels: string[];
  /** Highlighted label index (today). */
  todayIndex?: number;
  colorA: string;
  colorB: string;
  height?: number;
}

export function GroupedBars({ a, b, labels, todayIndex, colorA, colorB, height = 120 }: GroupedBarsProps) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const n = labels.length;
  const labelH = 20;
  const top = 16;
  const chartH = height - labelH;
  const max = Math.max(1, ...a, ...b);
  const slot = width / n;
  const bw = Math.min(14, slot * 0.3);
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={chartH} y2={chartH} stroke={colors.border} strokeWidth={2} />
          {labels.map((label, i) => {
            const cx = slot * i + slot / 2;
            const ha = (a[i] / max) * (chartH - top);
            const hb = (b[i] / max) * (chartH - top);
            return (
              <React.Fragment key={i}>
                <Bar x={cx - bw - 2} w={bw} h={Math.max(a[i] > 0 ? 4 : 0, hb)} base={chartH} fill={colorB} delay={i * 40} />
                <Bar x={cx + 2} w={bw} h={Math.max(a[i] > 0 ? 4 : 0, ha)} base={chartH} fill={colorA} delay={i * 40 + 80} />
                {a[i] > 0 ? (
                  <SvgText x={cx + 2 + bw / 2} y={chartH - Math.max(4, ha) - 5} fontSize={11} fontWeight="800" fill={colors.textMuted} textAnchor="middle">
                    {a[i]}
                  </SvgText>
                ) : null}
                <SvgText
                  x={cx}
                  y={height - 4}
                  fontSize={12}
                  fontWeight="800"
                  fill={i === todayIndex ? colors.primary : colors.textFaint}
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
