import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Stroke icon set (24x24 grid, round caps). Add new icons here; keep them in this one visual style. */
const paths = {
  bell: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  plus: ['M12 5v14M5 12h14'],
  check: ['M20 6L9 17l-5-5'],
  x: ['M18 6L6 18M6 6l12 12'],
  chevronRight: ['M9 18l6-6-6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronDown: ['M6 9l6 6 6-6'],
  today: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4L12 14.01l-3-3'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'],
  chart: ['M18 20V10M12 20V4M6 20v-6'],
  bolt: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
  lock: ['M7 11V7a5 5 0 0 1 10 0v4'],
  trash: ['M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6', 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'],
  clock: ['M12 6v6l4 2'],
  calendar: ['M16 2v4M8 2v4M3 10h18'],
  tag: ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'],
  send: ['M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z'],
  search: ['M21 21l-4.35-4.35'],
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'],
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'],
  message: ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
  arrowRight: ['M5 12h14M12 5l7 7-7 7'],
  repeat: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
  more: ['M12 12h.01M19 12h.01M5 12h.01'],
  edit: ['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  mail: ['M22 6l-10 7L2 6'],
  smile: ['M8 14s1.5 2 4 2 4-2 4-2', 'M9 9h.01M15 9h.01'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  copy: ['M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  userPlus: ['M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M20 8v6M23 11h-6'],
} as const;

export type IconName = keyof typeof paths;

/** Extra primitives drawn beside the paths for some icons (rect/circle parts). */
function extras(name: IconName, color: string, sw: number) {
  switch (name) {
    case 'user': return <Circle cx={12} cy={7} r={4} stroke={color} strokeWidth={sw} fill="none" />;
    case 'users': return <Circle cx={9} cy={7} r={4} stroke={color} strokeWidth={sw} fill="none" />;
    case 'lock': return <Rect x={3} y={11} width={18} height={11} rx={2} stroke={color} strokeWidth={sw} fill="none" />;
    case 'clock': return <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={sw} fill="none" />;
    case 'calendar': return <Rect x={3} y={4} width={18} height={18} rx={2} stroke={color} strokeWidth={sw} fill="none" />;
    case 'tag': return <Circle cx={7} cy={7} r={1} stroke={color} strokeWidth={sw} fill="none" />;
    case 'search': return <Circle cx={11} cy={11} r={8} stroke={color} strokeWidth={sw} fill="none" />;
    case 'camera': return <Circle cx={12} cy={13} r={4} stroke={color} strokeWidth={sw} fill="none" />;
    case 'eye': return <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={sw} fill="none" />;
    case 'smile': return <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={sw} fill="none" />;
    case 'copy': return <Rect x={9} y={9} width={13} height={13} rx={2} stroke={color} strokeWidth={sw} fill="none" />;
    case 'userPlus': return <Circle cx={8.5} cy={7} r={4} stroke={color} strokeWidth={sw} fill="none" />;
    case 'mail': return <Rect x={2} y={4} width={20} height={16} rx={2} stroke={color} strokeWidth={sw} fill="none" />;
    default: return null;
  }
}

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Fill the shape (used for the active tab star / bolt). */
  filled?: boolean;
}

export function Icon({ name, size = 24, color, strokeWidth = 2.4, filled = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {extras(name, color, strokeWidth)}
      {paths[name].map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={filled ? color : 'none'}
        />
      ))}
    </Svg>
  );
}
