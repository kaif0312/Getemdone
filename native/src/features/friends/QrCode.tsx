import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrMatrix } from './qr';

/** QR code as one SVG path. Always dark on white (scanners need contrast), whatever the theme. */
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  if (!m) return null;
  const n = m.length;
  const quiet = 2;
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!m[y][x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < n && m[y][x + run]) run++;
      d += `M${x + quiet} ${y + quiet}h${run}v1h${-run}z`;
      x += run;
    }
  }
  const box = n + quiet * 2;
  return (
    <View accessibilityLabel="QR code of your friend code" style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
        <Rect width={box} height={box} fill="#FFFFFF" />
        <Path d={d} fill="#1E1433" />
      </Svg>
    </View>
  );
}
