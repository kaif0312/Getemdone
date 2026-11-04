/**
 * UI kit showcase. Hidden route: /dev/kit  (dev builds only; also /dev/kit?scheme=light|dark to show one theme).
 * Every kit component, in light and dark. Add new kit components here when you add them to src/ui.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import {
  AnimatedCheckbox, Avatar, Button, Card, Chip, coachPoses, CoachSticker, EmptyState, ErrorState, Header, Icon, ProgressRing, radius,
  Skeleton, SkeletonList, StreakBadge, StreakFlame, StrikeText, SwipeRow, Text, TextField, ThemeProvider, useConfetti, useTheme, useToast,
  type IconName, type Scheme,
} from '@/ui';

const ICONS: IconName[] = ['today', 'users', 'chart', 'user', 'bell', 'plus', 'check', 'bolt', 'lock', 'trash', 'clock', 'calendar', 'tag', 'send', 'search', 'camera', 'eye', 'message', 'repeat', 'edit', 'star', 'settings', 'link', 'mail'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="label" tone="muted">{title}</Text>
      {children}
    </View>
  );
}

function Row({ children, gap = 10 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }}>{children}</View>;
}

function TaskRow({ title, sub, initial }: { title: string; sub?: string; initial?: boolean }) {
  const [done, setDone] = useState(!!initial);
  const { colors } = useTheme();
  return (
    <SwipeRow
      onSwipeRight={() => setDone((d) => !d)}
      actions={[
        { key: 'tmr', label: 'Tomorrow', icon: 'calendar', tone: 'primary', onPress: () => {} },
        { key: 'del', label: 'Delete', icon: 'trash', tone: 'danger', onPress: () => {} },
      ]}
    >
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
          borderRadius: radius.lg,
        }}
      >
        <AnimatedCheckbox checked={done} onToggle={setDone} accessibilityLabel={title} />
        <View style={{ flex: 1 }}>
          <StrikeText struck={done} variant="bodyStrong">{title}</StrikeText>
          {sub ? <Text variant="caption" tone="muted">{sub}</Text> : null}
        </View>
        <Chip label="Gym" emoji="💪" size="sm" tone="accent" />
      </View>
    </SwipeRow>
  );
}

function Showcase({ scheme }: { scheme: Scheme }) {
  const { colors } = useTheme();
  const toast = useToast();
  const confetti = useConfetti();
  const [sel, setSel] = useState('Today');
  const [progress, setProgress] = useState(0.62);
  const [text, setText] = useState('');
  const [streak, setStreak] = useState(12);

  return (
    <View style={{ backgroundColor: colors.bg, paddingBottom: 32, gap: 26 }}>
      <Header title={scheme === 'dark' ? 'Kit, dark' : 'Kit, light'} subtitle="Every component, one page" unread={3} onBellPress={() => toast.show('Bell pressed', { kind: 'info' })} noInset />
      <View style={{ paddingHorizontal: 20, gap: 26 }}>
        <Section title="Type">
          <Text variant="display">Get it done.</Text>
          <Text variant="title">Title, 28 black</Text>
          <Text variant="heading">Heading, 20 extra bold</Text>
          <Text variant="body">Body is Nunito semibold. Short, direct, a little strict. 3 left. Move.</Text>
          <Text variant="caption" tone="muted">Caption, muted</Text>
        </Section>

        <Section title="Buttons">
          <Row>
            <Button label="Primary" onPress={() => toast.show('Primary', { kind: 'success' })} />
            <Button label="Accent" variant="accent" icon="plus" />
            <Button label="Done" variant="success" icon="check" />
          </Row>
          <Row>
            <Button label="Secondary" variant="secondary" />
            <Button label="Delete" variant="danger" icon="trash" />
            <Button label="Ghost" variant="ghost" />
          </Row>
          <Row>
            <Button label="Loading" loading />
            <Button label="Disabled" disabled variant="accent" />
            <Button label="Small" size="sm" />
          </Row>
          <Button label="Continue with WhatsApp" icon="message" size="lg" fullWidth />
        </Section>

        <Section title="Chips">
          <Row gap={8}>
            {['Today', 'Tomorrow', 'Pick date'].map((l) => (
              <Chip key={l} label={l} selected={sel === l} onPress={() => setSel(l)} />
            ))}
          </Row>
          <Row gap={8}>
            <Chip label="Everyone" icon="users" tone="success" selected onPress={() => {}} />
            <Chip label="Private" icon="lock" tone="neutral" onPress={() => {}} />
            <Chip label="Gym" emoji="💪" tone="accent" size="sm" />
            <Chip label="Work" emoji="💼" tone="primary" size="sm" />
          </Row>
        </Section>

        <Section title="Tasks: tap the circle, swipe right = done, swipe left = actions">
          <TaskRow title="Call the dentist" sub="Today 4:30 pm" />
          <TaskRow title="Gym, legs" sub="Committed" />
          <TaskRow title="Send the invoice" initial />
        </Section>

        <Section title="Cards">
          <Card>
            <Text variant="subheading">Raised card</Text>
            <Text tone="muted">Solid bottom edge, 2pt border.</Text>
          </Card>
          <Row>
            <View style={{ flex: 1 }}><Card tone="sun" onPress={() => toast.show('Tapped', { kind: 'info' })}><Text variant="bodyStrong">Pressable</Text></Card></View>
            <View style={{ flex: 1 }}><Card tone="success" raised={false}><Text variant="bodyStrong">Flat, tinted</Text></Card></View>
          </Row>
        </Section>

        <Section title="Streak + progress">
          <Card>
            <View style={{ alignItems: 'center', gap: 14 }}>
              <StreakBadge variant="hero" count={streak} />
              <Row gap={8}>
                <Chip label="+1 day" size="sm" onPress={() => setStreak((s) => s + 1)} />
                <Chip label="Reset" size="sm" tone="neutral" onPress={() => setStreak(0)} />
              </Row>
            </View>
          </Card>
          <Row gap={22}>
            <ProgressRing progress={progress} size={104}>
              <Text variant="heading">{Math.round(progress * 100)}%</Text>
            </ProgressRing>
            <ProgressRing progress={1} size={76} stroke={10}><Icon name="check" size={30} color={colors.success} strokeWidth={3.4} /></ProgressRing>
            <View style={{ gap: 6 }}>
              <Row gap={6}>
                <StreakFlame size={34} />
                <StreakFlame size={34} lit={false} />
              </Row>
              <Row gap={6}>
                <Chip label="25" size="sm" onPress={() => setProgress(0.25)} />
                <Chip label="62" size="sm" onPress={() => setProgress(0.62)} />
                <Chip label="100" size="sm" onPress={() => setProgress(1)} />
              </Row>
            </View>
          </Row>
        </Section>

        <Section title="Avatars">
          <Row gap={16}>
            <Avatar name="Fairooz Nisha" size={52} />
            <Avatar name="Sam" size={52} ring="focus" streak={14} />
            <Avatar name="Lena Ortiz" size={52} ring="done" streak={3} />
            <Avatar name="Kaif" size={40} />
            <Avatar name="A" size={32} />
          </Row>
        </Section>

        <Section title="Inputs">
          <TextField label="Task" value={text} onChangeText={setText} placeholder="What needs doing?" />
          <TextField label="With error" value="nope" error="That does not look right." />
        </Section>

        <Section title="Feedback: toast, confetti, haptics">
          <Row>
            <Button label="Success toast" size="sm" variant="success" onPress={() => toast.show('Done. 2 left.', { kind: 'success' })} />
            <Button label="Error toast" size="sm" variant="danger" onPress={() => toast.show('Could not save that.', { kind: 'error' })} />
            <Button label="Confetti" size="sm" variant="accent" onPress={() => confetti.fire()} />
          </Row>
        </Section>

        <Section title="Loading, empty, error">
          <SkeletonList count={2} />
          <Row><Skeleton width={120} height={14} /><Skeleton width={60} height={14} /></Row>
          <Card raised={false}><EmptyState pose="sleepy" title="Nothing here yet." body="Add a task on WhatsApp or tap the plus." compact action={{ label: 'Add a task', icon: 'plus' }} /></Card>
          <Card raised={false}><ErrorState compact onRetry={() => toast.show('Retrying…')} /></Card>
        </Section>

        <Section title="Coach poses">
          <Row gap={4}>
            {coachPoses.map((p) => (
              <View key={p} style={{ alignItems: 'center', width: '24%' }}>
                <CoachSticker pose={p} size={74} />
                <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>{p}</Text>
              </View>
            ))}
          </Row>
        </Section>

        <Section title="Icons">
          <Row gap={14}>
            {ICONS.map((n) => (
              <Icon key={n} name={n} size={26} color={colors.text} />
            ))}
          </Row>
        </Section>
      </View>
    </View>
  );
}

export default function Kit() {
  const { scheme } = useLocalSearchParams<{ scheme?: string }>();
  if (!__DEV__) return <Redirect href="/" />;
  const schemes: Scheme[] = scheme === 'dark' ? ['dark'] : scheme === 'light' ? ['light'] : ['light', 'dark'];
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      {schemes.map((s) => (
        <ThemeProvider key={s} scheme={s}>
          <Showcase scheme={s} />
        </ThemeProvider>
      ))}
    </ScrollView>
  );
}
