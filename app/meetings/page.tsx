'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import MeetingsPage from '@/components/meetings/MeetingsPage';

export default function MeetingsRoute() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, user, router]);

  if (loading || !user) {
    return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} aria-busy="true"><div className="animate-pulse" style={{ width: 48, height: 48, borderRadius: 999, background: '#7B4FD6', opacity: 0.4 }} /></div>;
  }
  // useSearchParams() needs a Suspense boundary for prerender (Next 16).
  return (
    <Suspense fallback={null}>
      <MeetingsPage />
    </Suspense>
  );
}
