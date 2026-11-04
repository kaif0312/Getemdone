/**
 * Extra stroke icons used by the task screens (same 24x24 round-cap style as @/ui Icon). Kept here so the shared Icon set
 * is not edited by several feature branches at once; fold into ui/Icon.tsx when merging.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const paths = {
  paperclip: ['M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  reply: ['M9 14L4 9l5-5', 'M20 20v-7a4 4 0 0 0-4-4H4'],
  moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
  undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-15-6.7L3 13'],
  note: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6M8 13h8M8 17h5'],
  list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
  image: ['M21 15l-5-5L5 21'],
  globe: ['M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
  userCheck: ['M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M17 11l2 2 4-4'],
  whatsapp: ['M3 21l1.65-4.2A8.5 8.5 0 1 1 8 19.6L3 21z'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  minus: ['M5 12h14'],
} as const;

export type XIconName = keyof typeof paths;

function extras(name: XIconName, color: string, sw: number) {
  switch (name) {
    case 'image': return (
      <>
        <Rect x={3} y={3} width={18} height={18} rx={2} stroke={color} strokeWidth={sw} fill="none" />
        <Circle cx={8.5} cy={8.5} r={1.5} stroke={color} strokeWidth={sw} fill="none" />
      </>
    );
    case 'globe': return <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={sw} fill="none" />;
    case 'userCheck': return <Circle cx={8.5} cy={7} r={4} stroke={color} strokeWidth={sw} fill="none" />;
    default: return null;
  }
}

export function XIcon({ name, size = 20, color, strokeWidth = 2.4 }: { name: XIconName; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {extras(name, color, strokeWidth)}
      {paths[name].map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
    </Svg>
  );
}
