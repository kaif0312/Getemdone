import React from 'react';
import { View } from 'react-native';
import { Button, type ButtonProps } from './Button';
import { CoachSticker, type CoachPose } from './CoachSticker';
import { Text } from './Text';

export interface EmptyStateProps {
  pose?: CoachPose;
  title: string;
  body?: string;
  /** One clear next action, not two. */
  action?: Pick<ButtonProps, 'label' | 'onPress' | 'icon' | 'variant'>;
  compact?: boolean;
}

/** Coach + one line + optional action. Voice: short, direct, a little strict. */
export function EmptyState({ pose = 'sleepy', title, body, action, compact }: EmptyStateProps) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 16 : 40, paddingHorizontal: 28, gap: 6 }}>
      <CoachSticker pose={pose} size={compact ? 120 : 168} animated />
      <Text variant="title" align="center" style={{ marginTop: 8 }}>{title}</Text>
      {body ? <Text tone="muted" align="center" style={{ maxWidth: 300 }}>{body}</Text> : null}
      {action ? (
        <View style={{ marginTop: 16 }}>
          <Button {...action} />
        </View>
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ title = 'That did not work.', body = 'Check your connection and try again.', onRetry, compact }: ErrorStateProps) {
  return (
    <EmptyState
      pose="disappointed"
      title={title}
      body={body}
      compact={compact}
      action={onRetry ? { label: 'Retry', onPress: onRetry, icon: 'repeat' } : undefined}
    />
  );
}
