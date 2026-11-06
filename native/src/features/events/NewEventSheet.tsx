/** New event (inside the Add sheet: Task | Event). An event happens at a time for a while and is not checkable. */
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMeetings } from '@/hooks/useMeetings';
import { usePush } from '@/hooks/usePush';
import { useToday } from '@/hooks/useToday';
import { MeetingsApiError } from '@/lib/meetingsApi';
import { haptic, useToast } from '@/ui';
import EventForm from './EventForm';
import KindToggle, { type AddKind } from './KindToggle';
import { newEventDraft } from './view';

export default function NewEventSheet({ date, onKind }: { date?: string; onKind: (k: AddKind) => void }) {
  const router = useRouter();
  const toast = useToast();
  const push = usePush();
  const { createEvent } = useMeetings();
  const { zone } = useToday();
  const [busy, setBusy] = useState(false);
  const [initial] = useState(() => newEventDraft(zone, date));
  return (
    <EventForm
      title="New event"
      initial={initial}
      submitLabel="Add event"
      busy={busy}
      top={<KindToggle value="event" onChange={onKind} />}
      onSubmit={async (d) => {
        setBusy(true);
        try {
          await createEvent(d);
          haptic.success();
          toast.show('Event set.', { kind: 'success' });
          void push.askAfterFirstAction();
          router.back();
        } catch (e) {
          setBusy(false);
          toast.show(e instanceof MeetingsApiError && e.status === 401 ? 'Please sign in again.' : 'Could not set the event. Try again.', { kind: 'error' });
        }
      }}
    />
  );
}
