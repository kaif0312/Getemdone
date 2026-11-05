// Calendar images for WhatsApp: a month grid and a week agenda, drawn with next/og (satori + resvg) in Nudge's colours.
// Satori rules: every element with more than one child needs display:flex; no grid; inline styles only.
import { ImageResponse } from 'next/og';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CSSProperties, ReactElement } from 'react';
import { DOW_SHORT, MONTH_NAMES, type CalDay, type CalEvent, type MonthModel, type WeekModel } from './events';

const C = {
  bg: '#FFF6E9',
  card: '#FFFFFF',
  ink: '#1B1B1F',
  mute: '#8C8576',
  faint: '#C9BFAB',
  line: '#EFE4CF',
  tang: '#FF5A1F',
  tangSoft: '#FFE3D6',
  purple: '#5B3A9E',
  purpleSoft: '#E9E1F7',
  green: '#2E9E6B',
  greenSoft: '#DDF3E7',
  red: '#D6453D',
  redSoft: '#FBE0DD',
};
const FONT = 'Inter, NotoArabic, NotoMalayalam, sans-serif';

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: 'normal' };
let fontCache: Font[] | null = null;
function fonts(): Font[] {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), 'lib', 'calendar', 'fonts');
  const f = (name: string, file: string, weight: Font['weight']): Font => ({ name, data: readFileSync(path.join(dir, file)), weight, style: 'normal' });
  fontCache = [
    f('Inter', 'inter-latin-400-normal.woff', 400),
    f('Inter', 'inter-latin-600-normal.woff', 600),
    f('Inter', 'inter-latin-700-normal.woff', 700),
    f('Inter', 'inter-latin-800-normal.woff', 800),
    f('NotoArabic', 'arabic-400.woff', 400),
    f('NotoArabic', 'arabic-700.woff', 700),
    f('NotoMalayalam', 'malayalam-400.woff', 400),
    f('NotoMalayalam', 'malayalam-700.woff', 700),
  ];
  return fontCache;
}

const clip = (s: string, n: number) => {
  const a = Array.from(s.replace(/\s+/g, ' ').trim());
  return a.length <= n ? a.join('') : a.slice(0, n - 1).join('').trimEnd() + '…';
};
const t12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
const tone = (e: CalEvent, past = false) =>
  e.done ? { fg: C.green, bg: C.greenSoft }
    : past && !e.recurring ? { fg: C.red, bg: C.redSoft }
    : e.kind === 'deadline' ? { fg: C.purple, bg: C.purpleSoft }
    : { fg: C.tang, bg: C.tangSoft };

/** A check mark drawn with borders (the font has no check glyph, and satori's emoji fallback needs the network). */
function Check({ size, color }: { size: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size / 2, background: color }}>
      <div style={{ display: 'flex', width: size * 0.27, height: size * 0.5, borderRight: `${Math.max(2, size * 0.12)}px solid #fff`, borderBottom: `${Math.max(2, size * 0.12)}px solid #fff`, transform: 'rotate(45deg) translate(-8%, -10%)' }} />
    </div>
  );
}

/** The little "n" mark: black lowercase n on tangerine, like the WhatsApp profile picture. */
function Mark({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size * 0.28, background: C.tang, color: C.ink, fontSize: size * 0.72, fontWeight: 800, lineHeight: 1, paddingBottom: size * 0.06 }}>
      n
    </div>
  );
}

function Legend() {
  const item = (color: string, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', marginRight: 26 }}>
      <div style={{ width: 14, height: 14, borderRadius: 7, background: color, marginRight: 9 }} />
      <div style={{ display: 'flex', fontSize: 20, color: C.mute, fontWeight: 600 }}>{label}</div>
    </div>
  );
  return <div style={{ display: 'flex' }}>{item(C.tang, 'Task')}{item(C.purple, 'Deadline')}{item(C.green, 'Done')}</div>;
}

function Footer({ undated }: { undated: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Legend />
        {undated > 0 ? (
          <div style={{ display: 'flex', fontSize: 19, color: C.mute, marginTop: 10 }}>
            {`+ ${undated} open ${undated === 1 ? 'task' : 'tasks'} with no date`}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Mark size={40} />
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: C.ink, marginLeft: 12, letterSpacing: -0.5 }}>Nudge</div>
      </div>
    </div>
  );
}

function Pill({ children, bg, fg }: { children: string; bg: string; fg: string }) {
  return (
    <div style={{ display: 'flex', background: bg, color: fg, fontSize: 22, fontWeight: 700, padding: '9px 20px', borderRadius: 40, marginLeft: 10 }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- month

const W = 1080;
const PAD = 48;
const GRID_W = W - PAD * 2; // 984
const CELL_W = GRID_W / 7;

function MonthCell({ day, last }: { day: CalDay; last: boolean }) {
  const n = Number(day.date.slice(8));
  // Habits (recurring) would flood the grid, so they become dots; one-off tasks and deadlines get chips.
  const evs = day.events.filter((e) => !e.recurring);
  const habits = day.events.filter((e) => e.recurring);
  const shown = evs.slice(0, habits.length ? 2 : 3);
  const more = evs.length - shown.length;
  const allDone = day.events.length > 0 && day.events.every((e) => e.done);
  const dim = !day.inMonth;
  const wk = day.dow >= 5;
  const base: CSSProperties = {
    display: 'flex', flexDirection: 'column', width: CELL_W, height: 154, padding: '9px 7px 7px',
    borderRight: last ? 'none' : `1px solid ${C.line}`, borderTop: `1px solid ${C.line}`,
    background: day.isToday ? '#FFF1E6' : wk && !dim ? '#FFFBF4' : C.card,
  };
  return (
    <div style={base}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, height: 34, borderRadius: 17,
            background: day.isToday ? C.tang : 'transparent', color: day.isToday ? '#FFFFFF' : dim ? C.faint : C.ink,
            fontSize: 21, fontWeight: day.isToday ? 800 : 700,
          }}
        >
          {String(n)}
        </div>
        {allDone ? <Check size={24} color={C.green} /> : null}
      </div>
      {shown.map((e, i) => {
        const t = tone(e, day.isPast);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 29, opacity: dim ? 0.5 : 1, marginBottom: 4, background: t.bg, borderRadius: 7, borderLeft: `4px solid ${t.fg}`, paddingLeft: 6, paddingRight: 4, overflow: 'hidden' }}>
            <div style={{ display: 'flex', fontSize: 15, fontWeight: 600, color: e.done ? C.mute : C.ink, textDecoration: e.done ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>
              {clip(e.text, 13)}
            </div>
          </div>
        );
      })}
      {more > 0 && !habits.length ? <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, color: C.mute, paddingLeft: 3 }}>{`+${more} more`}</div> : null}
      {habits.length ? (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', paddingLeft: 3, paddingRight: 3, opacity: dim ? 0.5 : 1 }}>
          {habits.slice(0, 6).map((h, i) => (
            <div key={i} style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, marginRight: 5, background: h.done ? C.green : 'transparent', border: `2.5px solid ${h.done ? C.green : C.faint}` }} />
          ))}
          {more > 0 ? <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 15, fontWeight: 700, color: C.mute }}>{`+${more}`}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function MonthCard({ m }: { m: MonthModel }) {
  const [name, year] = m.title.split(' ');
  const left = m.total - m.done;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: W, background: C.bg, padding: `${PAD}px ${PAD}px 40px`, fontFamily: FONT, color: C.ink }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', fontSize: 78, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>{name}</div>
          <div style={{ display: 'flex', fontSize: 78, fontWeight: 400, letterSpacing: -3, lineHeight: 1, color: C.faint, marginLeft: 18 }}>{year}</div>
        </div>
        <div style={{ display: 'flex', paddingBottom: 8 }}>
          {m.total > 0 ? (
            <>
              <Pill bg={C.tangSoft} fg={C.tang}>{`${left} to go`}</Pill>
              <Pill bg={C.greenSoft} fg={C.green}>{`${m.done} done`}</Pill>
            </>
          ) : (
            <Pill bg={C.line} fg={C.mute}>Nothing planned</Pill>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', background: C.card, borderRadius: 28, overflow: 'hidden', border: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', background: C.ink }}>
          {DOW_SHORT.map((d, i) => (
            <div key={d} style={{ display: 'flex', width: CELL_W, justifyContent: 'center', padding: '13px 0', fontSize: 19, fontWeight: 700, letterSpacing: 1.5, color: i >= 5 ? C.tang : '#F4EBDD', textTransform: 'uppercase' }}>
              {d}
            </div>
          ))}
        </div>
        {m.weeks.map((w, wi) => (
          <div key={wi} style={{ display: 'flex' }}>
            {w.map((d, di) => <MonthCell key={d.date} day={d} last={di === 6} />)}
          </div>
        ))}
      </div>
      <Footer undated={m.undated} />
    </div>
  );
}

// ---------------------------------------------------------------- week

const MAX_PER_DAY = 5;

function WeekRow({ day }: { day: CalDay }) {
  const n = Number(day.date.slice(8));
  const evs = day.events.slice(0, MAX_PER_DAY);
  const more = day.events.length - evs.length;
  const free = day.events.length === 0;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'stretch', marginBottom: 14, borderRadius: 26, overflow: 'hidden', minHeight: 100,
        background: day.isToday ? '#FFF1E6' : C.card, border: `${day.isToday ? 3 : 1}px solid ${day.isToday ? C.tang : C.line}`,
        opacity: day.isPast && !day.isToday ? 0.72 : 1,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 132, background: day.isToday ? C.tang : day.dow >= 5 ? '#F7EEDC' : '#FBF5EA' }}>
        <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: day.isToday ? '#FFE3D6' : C.mute }}>{DOW_SHORT[day.dow]}</div>
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: day.isToday ? '#FFFFFF' : C.ink }}>{String(n)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '16px 26px' }}>
        {free ? (
          <div style={{ display: 'flex', fontSize: 25, color: C.faint, fontWeight: 600 }}>{day.isToday ? 'Nothing planned today' : 'Free'}</div>
        ) : (
          evs.map((e, i) => {
            const t = tone(e, day.isPast);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', height: 42, marginBottom: i === evs.length - 1 && !more ? 0 : 4 }}>
                <div style={{ display: 'flex', width: 128, fontSize: 21, fontWeight: 700, color: e.time ? t.fg : C.faint }}>{e.time ? t12(e.time) : 'Anytime'}</div>
                <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: t.fg, marginRight: 16 }} />
                <div style={{ display: 'flex', fontSize: 27, fontWeight: 600, color: e.done ? C.mute : C.ink, textDecoration: e.done ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>
                  {clip(e.text, 34)}
                </div>
                {e.kind === 'deadline' && !e.done ? (
                  <div style={{ display: 'flex', marginLeft: 14, fontSize: 16, fontWeight: 800, letterSpacing: 1, color: C.purple, background: C.purpleSoft, padding: '3px 10px', borderRadius: 8 }}>DUE</div>
                ) : null}
                {e.recurring ? <div style={{ display: 'flex', marginLeft: 14, fontSize: 16, fontWeight: 800, letterSpacing: 1, color: C.mute, background: C.line, padding: '3px 10px', borderRadius: 8 }}>HABIT</div> : null}
              </div>
            );
          })
        )}
        {more > 0 ? <div style={{ display: 'flex', fontSize: 21, fontWeight: 700, color: C.mute, marginTop: 4, paddingLeft: 140 }}>{`+${more} more`}</div> : null}
      </div>
    </div>
  );
}

function WeekCard({ w }: { w: WeekModel }) {
  const left = w.total - w.done;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: W, background: C.bg, padding: `${PAD}px ${PAD}px 40px`, fontFamily: FONT, color: C.ink }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 3, color: C.tang, textTransform: 'uppercase', marginBottom: 8 }}>Week</div>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1 }}>{w.title}</div>
        </div>
        <div style={{ display: 'flex', paddingBottom: 6 }}>
          {w.total > 0 ? (
            <>
              <Pill bg={C.tangSoft} fg={C.tang}>{`${left} to go`}</Pill>
              <Pill bg={C.greenSoft} fg={C.green}>{`${w.done} done`}</Pill>
            </>
          ) : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {w.days.map((d) => <WeekRow key={d.date} day={d} />)}
      </div>
      <Footer undated={w.undated} />
    </div>
  );
}

// ---------------------------------------------------------------- png

async function toPng(el: ReactElement, height: number): Promise<Buffer> {
  const res = new ImageResponse(el, { width: W, height, fonts: fonts() });
  return Buffer.from(await res.arrayBuffer());
}

export async function renderMonthPng(m: MonthModel): Promise<Buffer> {
  // header 125 + weekday bar 52 + rows 154 each + footer ~ 110 + paddings
  const h = PAD + 125 + 30 + 52 + m.weeks.length * 154 + 28 + (m.undated ? 90 : 60) + 40 - 82;
  return toPng(<MonthCard m={m} />, h);
}

export async function renderWeekPng(w: WeekModel): Promise<Buffer> {
  let rows = 0;
  for (const d of w.days) {
    const n = Math.min(d.events.length, MAX_PER_DAY);
    rows += Math.max(100, 32 + n * 46 + (d.events.length > MAX_PER_DAY ? 30 : 0)) + 14;
  }
  const h = PAD + 112 + 28 + rows + 28 + (w.undated ? 90 : 60) + 40 - 66;
  return toPng(<WeekCard w={w} />, h);
}

export { MONTH_NAMES };
