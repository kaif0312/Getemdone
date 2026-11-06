'use client';

// /meetings (spec 2.2) + detail (?id=) and new (?new=1[&date=]) sheets.
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LuChevronLeft, LuPlus } from 'react-icons/lu';
import { useMeetings } from '@/hooks/useMeetings';
import type { NewMeetingDraft } from './view';
import { groupMeetings, upcoming, zoneCity } from './view';
import { NnButton, NnEmpty, NnError, NnRoot, NnRoundButton, NnSectionHeader, NnSkeletonList } from './nn';
import { useNow, useViewerTz } from './bits';
import MeetingCard from './MeetingCard';
import CalendarBanner, { useMeetingsCalendar } from './CalendarBanner';
import MeetingDetailSheet from './MeetingDetailSheet';
import NewMeetingSheet from './NewMeetingSheet';

const COACH_URL = 'https://wa.me/96560091617';

export default function MeetingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { meetings, loading, error, retry, create, cancel } = useMeetings();
  const viewerTz = useViewerTz();
  const now = useNow();
  const calendar = useMeetingsCalendar();
  const [forceBanner, setForceBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const id = params.get('id');
  const isNew = params.get('new') === '1';
  const close = () => router.replace('/meetings');
  const openNew = () => router.push('/meetings?new=1');

  const groups = groupMeetings(meetings, viewerTz, now);
  const firstUpcomingId = upcoming(meetings, now).find((m) => !(Date.parse(m.startAt) <= now))?.id;
  const banner = dismissed ? 'none' : calendar !== 'none' ? calendar : forceBanner ? 'connect' : 'none';
  const showEmpty = !loading && !error && groups.length === 0;

  return (
    <NnRoot page>
      <main className="nn-wrap nn-stack" style={{ gap: 16 }}>
        <header className="nn-row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <NnRoundButton label="Back" onClick={() => router.push('/')}><LuChevronLeft size={22} /></NnRoundButton>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="nn-title">Meetings</h1>
            <p className="nn-caption nn-muted">Upcoming, in your time ({zoneCity(viewerTz)})</p>
          </div>
          <NnRoundButton label="New meeting" fill onClick={openNew}><LuPlus size={22} /></NnRoundButton>
        </header>

        <CalendarBanner kind={banner} onDismiss={() => setDismissed(true)} />

        {loading && <NnSkeletonList count={3} />}
        {error && !loading && <NnError title="Could not load your meetings." body="Check your connection and try again." onRetry={retry} />}
        {showEmpty && (
          <NnEmpty
            pose="sleepy"
            title="No meetings booked."
            body="Book one here, or tell the coach on WhatsApp."
            action={<NnButton variant="accent" icon={<LuPlus size={20} />} onClick={openNew}>New meeting</NnButton>}
          />
        )}
        {!loading && !error && groups.map((g) => (
          <section key={g.key} className="nn-stack" aria-label={g.title}>
            <NnSectionHeader title={g.title} count={g.items.length} />
            {g.items.map((m) => (
              <MeetingCard
                key={m.id}
                m={m}
                viewerTz={viewerTz}
                now={now}
                first={m.id === firstUpcomingId}
                showDay={g.key === 'later'}
                onOpen={() => router.push(`/meetings?id=${encodeURIComponent(m.id)}`)}
              />
            ))}
          </section>
        ))}

        <a className="nn-caption nn-faint" href={COACH_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, textDecoration: 'none' }}>
          Faster on WhatsApp. Tell the coach.
        </a>
      </main>

      {id && !loading && (
        <MeetingDetailSheet meeting={meetings.find((m) => m.id === id)} viewerTz={viewerTz} onClose={close} onCancel={cancel} />
      )}
      {isNew && (
        <NewMeetingSheet
          viewerTz={viewerTz}
          calendarConnected={calendar === 'none'}
          dateParam={params.get('date')}
          onClose={close}
          onCreate={async (d: NewMeetingDraft) => {
            const r = await create(d);
            if (r.calendar === 'not_connected') setForceBanner(true);
            return r;
          }}
        />
      )}
    </NnRoot>
  );
}
