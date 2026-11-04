import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/defaults';
import type { NotificationSettings } from '@/lib/types';
import { useToast } from '@/ui';

/** users/{uid}.notificationSettings merged over the PWA defaults, with a patch writer that reports failures. */
export function useNotificationSettings() {
  const { profile, updateProfile } = useAuth();
  const toast = useToast();
  const settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...(profile?.notificationSettings ?? {}) };
  const set = useCallback(
    async (patch: Partial<NotificationSettings>) => {
      try {
        await updateProfile({ notificationSettings: { ...settings, ...patch } });
      } catch {
        toast.show('Could not save that.', { kind: 'error' });
      }
    },
    // settings is derived from profile each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.notificationSettings, updateProfile, toast],
  );
  return { settings, set };
}
