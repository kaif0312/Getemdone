import { Stack } from 'expo-router';
import { useTheme } from '@/ui';

export default function AuthLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />;
}
