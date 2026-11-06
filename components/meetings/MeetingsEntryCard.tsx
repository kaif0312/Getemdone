'use client';

// Entry block on `/` (spec 2.1): up to 2 meetings in the next 48 h, or one slim "Nothing booked." row.
import { useRouter } from 'next/navigation';
import { LuCalendar, LuChevronRight } from 'react-icons/lu';
import { useMeetings } from '@/hooks/useMeetings';
import { NnCard, NnIconTile, NnRoot, NnSectionHeader } from './nn';
import { JoinButton, useNow, useViewerTz } from './bits';
import { clockIn, dayLabel, joinState, soon48h } from './view';

export default function MeetingsEntryCard() {
  const router = useRouter();
  const { meetings, loading, error } = useMeetings();
  const viewerTz = useViewerTz();
  const now = useNow();
  if (loading || error) return null; // never push Today's content down with a skeleton; hide on error
  const list = soon48h(meetings, now);
  const rows = list.slice(0, 2);
  const open = (id?: string) => router.push(id ? `/meetings?id=${encodeURIComponent(id)}` : '/meetings');
  return (
    <NnRoot>
      <section className="nn-stack" style={{ marginBottom: 16 }} aria-label="Meetings">
        <NnSectionHeader
          title="Meetings"
          count={list.length}
          right={<button type="button" className="nn-caption nn-primary-text nn-hit" style={{ background: 'none', border: 0, cursor: 'pointer', minHeight: 44, padding: '0 4px' }} onClick={() => open()}>All meetings</button>}
        />
        {rows.length === 0 ? (
          <NnCard flat={false} compact onClick={() => open()} label="Nothing booked. Tap to book a meeting.">
            <div className="nn-row" style={{ gap: 12 }}>
              <NnIconTile><LuCalendar size={20} /></NnIconTile>
              <div style={{ flex: 1 }}>
                <p className="nn-body-strong">Nothing booked.</p>
                <p className="nn-caption nn-muted">Tap to book a meeting.</p>
              </div>
              <LuChevronRight size={20} className="nn-faint" aria-hidden />
            </div>
          </NnCard>
        ) : (
          rows.map((m, i) => {
            const js = joinState(m, now);
            const tag = js === 'live' || now >= Date.parse(m.startAt) ? 'NOW' : i === 0 ? 'NEXT' : '';
            return (
              <NnCard key={m.id} compact onClick={() => open(m.id)} label={m.title}>
                <div className="nn-row" style={{ gap: 12 }}>
                  <div style={{ width: 84, flex: 'none', whiteSpace: 'nowrap' }}>
                    <p className={`nn-label ${tag === 'NOW' ? 'nn-accent-text' : 'nn-primary-text'}`} style={{ minHeight: 16 }}>{tag}</p>
                    <p className="nn-body-strong">{clockIn(m.startAt, viewerTz)}</p>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="nn-body-strong nn-clamp1">{m.title}</p>
                    <p className="nn-caption nn-muted">{dayLabel(m.startAt, viewerTz, now)}</p>
                  </div>
                  {(js === 'soon' || js === 'live') && <JoinButton m={m} now={now} compact />}
                </div>
              </NnCard>
            );
          })
        )}
      </section>
    </NnRoot>
  );
}
