// Make a PDF (sheet). Logic lives in src/features/pdf.
// PdfScreen is required lazily, only when the native modules it imports exist in this binary (see available.ts): an OTA that
// reaches an older build must not crash, it shows "update Nudge" instead.
import React from 'react';
import { View } from 'react-native';
import { SheetScaffold, Text } from '@/ui';
import { pdfToolsAvailable } from '@/features/pdf/available';

function NeedsUpdate() {
  return (
    <SheetScaffold title="Make a PDF">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Text variant="subheading">Update Nudge first</Text>
        <Text variant="caption" tone="muted" style={{ textAlign: 'center', maxWidth: 280 }}>
          Making PDFs needs the newest version of the app. Update Nudge from the App Store or Play Store, then try again.
        </Text>
      </View>
    </SheetScaffold>
  );
}

export default function PdfRoute() {
  if (!pdfToolsAvailable()) return <NeedsUpdate />;
  const PdfScreen = (require('../src/features/pdf/PdfScreen') as typeof import('../src/features/pdf/PdfScreen')).default;
  return <PdfScreen />;
}
