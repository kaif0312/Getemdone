/** Today's header menu: evening recap, recycle bin, WhatsApp. Route: /today/more. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { haptic, Icon, radius, SheetScaffold, Text, useTheme, type IconName } from '@/ui';
import { openCoachWhatsApp } from './copy';

function Row({ icon, label, hint, onPress }: { icon: IconName; label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" tone="muted">{hint}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

export default function MoreSheet() {
  const router = useRouter();
  return (
    <SheetScaffold title="More">
      <View style={{ gap: 10 }}>
        <Row icon="moon" label="Evening recap" hint="What got done. Roll the rest." onPress={() => router.replace('/today/recap')} />
        <Row icon="trash" label="Recycle bin" hint="Restore deleted tasks. Kept 30 days." onPress={() => router.replace('/today/bin')} />
        <Row icon="whatsapp" label="Tell the coach on WhatsApp" hint="Fastest way to add tasks." onPress={openCoachWhatsApp} />
      </View>
    </SheetScaffold>
  );
}
