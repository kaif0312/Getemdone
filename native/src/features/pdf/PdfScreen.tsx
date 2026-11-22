// Make a PDF (sheet, route app/pdf.tsx): pick or take pages, put them in order, build one PDF on the phone, open the share sheet.
// No server: pdf-lib builds it from the shrunk JPEG files (build.ts); nothing leaves the phone until the person shares it.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Button, CoachSticker, haptic, Icon, SheetScaffold, Text, TextField, useTheme, useToast } from '@/ui';
import { buildPdf, type SkippedPage } from './build';
import { defaultName, isPdfFile, moveBy, moveToEdge, newPageId, removeAt, safeFileName, sortByName, type PdfPage } from './pages';
import { dropFile, shrinkImage } from './prepare';

const GAP = 8;
const COLS = 3;
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function PdfScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - 40 - GAP * (COLS - 1)) / COLS);

  const [pages, setPages] = useState<PdfPage[]>([]);
  const [name, setName] = useState(defaultName());
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "Adding 3 of 40" / "Page 37 of 119"
  const [skipped, setSkipped] = useState<SkippedPage[]>([]);
  const working = useRef(false);

  const selIndex = useMemo(() => pages.findIndex((p) => p.id === selected), [pages, selected]);

  /** Runs one add/build job at a time. */
  const run = useCallback(async (job: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    try {
      await job();
    } finally {
      working.current = false;
      setBusy(null);
    }
  }, []);

  const addItems = useCallback(
    async (items: { uri: string; name: string; pdf: boolean }[]) => {
      const added: PdfPage[] = [];
      let failed = 0;
      for (let i = 0; i < items.length; i++) {
        setBusy(`Adding ${i + 1} of ${items.length}`);
        const it = items[i];
        try {
          if (it.pdf) added.push({ id: newPageId(), kind: 'pdf', uri: it.uri, name: it.name });
          else added.push(await shrinkImage(it.uri, it.name));
        } catch {
          failed += 1;
        }
        if (i % 5 === 4) {
          const batch = added.splice(0); // take the batch now: updaters run later (twice in StrictMode)
          setPages((p) => p.concat(batch));
        }
      }
      const rest = added.splice(0);
      setPages((p) => p.concat(rest));
      setSkipped([]);
      if (failed) toast.show(`${plural(failed, 'file', 'files')} could not be added.`, { kind: 'error' });
      else if (items.length > 1) toast.show(`${plural(items.length, 'page', 'pages')} added.`, { kind: 'success' });
    },
    [toast],
  );

  const takePhoto = () =>
    run(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast.show('Allow the camera in Settings to take pages.', { kind: 'error' });
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled) return;
      await addItems(res.assets.map((a) => ({ uri: a.uri, name: '', pdf: false })));
    });

  const choosePhotos = () =>
    run(async () => {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: 0, // no limit
        quality: 1,
      });
      if (res.canceled) return;
      await addItems(res.assets.map((a) => ({ uri: a.uri, name: a.fileName ?? '', pdf: false })));
    });

  const chooseFiles = () =>
    run(async () => {
      const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      await addItems(res.assets.map((a) => ({ uri: a.uri, name: a.name, pdf: isPdfFile(a.mimeType, a.name) })));
    });

  const remove = () => {
    if (selIndex < 0) return;
    dropFile(pages[selIndex].uri);
    setPages(removeAt(pages, selIndex));
    setSelected(null);
    haptic.select();
  };

  const move = (d: number) => {
    if (selIndex < 0) return;
    setPages(moveBy(pages, selIndex, d));
    haptic.select();
  };

  const clearAll = () =>
    Alert.alert('Remove all pages?', `${plural(pages.length, 'page', 'pages')} will be removed from this list. Your photos are not deleted.`, [
      { text: 'Keep them', style: 'cancel' },
      {
        text: 'Remove all',
        style: 'destructive',
        onPress: () => {
          pages.forEach((p) => dropFile(p.uri));
          setPages([]);
          setSelected(null);
          setSkipped([]);
        },
      },
    ]);

  const make = () =>
    run(async () => {
      if (pages.length === 0) return;
      setSkipped([]);
      try {
        const result = await buildPdf(
          pages,
          async (uri) => new File(uri).bytes(),
          (done, total) => setBusy(`Page ${done} of ${total}`),
          yieldToUi,
        );
        setBusy('Saving the PDF');
        await yieldToUi();
        const out = new File(Paths.cache, `${safeFileName(name)}.pdf`);
        out.create({ overwrite: true });
        out.write(result.bytes);
        setSkipped(result.skipped);
        if (!(await Sharing.isAvailableAsync())) {
          toast.show('Sharing is not available on this phone.', { kind: 'error' });
          return;
        }
        haptic.success();
        await Sharing.shareAsync(out.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: safeFileName(name) });
      } catch (e) {
        const none = e instanceof Error && /None of the pages/.test(e.message);
        toast.show(none ? 'None of those pages could be read. Try adding them again.' : 'Could not make the PDF. Try fewer pages, or try again.', { kind: 'error' });
      }
    });

  const sel = selIndex >= 0;
  const renderItem = ({ item, index }: { item: PdfPage; index: number }) => {
    const on = item.id === selected;
    return (
      <Pressable
        onPress={() => setSelected(on ? null : item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Page ${index + 1}${item.kind === 'pdf' ? `, PDF ${item.name}` : ''}${on ? ', selected' : ''}`}
        style={{
          width: tile, height: Math.round(tile * 1.3), borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt,
          borderWidth: on ? 3 : 1, borderColor: on ? colors.primary : colors.border,
        }}
      >
        {item.kind === 'image' ? (
          <Image source={{ uri: item.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={item.id} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 }}>
            <Icon name="note" size={26} color={colors.textMuted} />
            <Text variant="caption" tone="muted" numberOfLines={3} style={{ textAlign: 'center' }}>{item.name || 'PDF'}</Text>
          </View>
        )}
        <View style={{ position: 'absolute', left: 6, top: 6, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="label" style={{ color: colors.onFill }}>{index + 1}</Text>
        </View>
      </Pressable>
    );
  };

  const disabled = !!busy;
  return (
    <SheetScaffold
      title="Make a PDF"
      footer={
        <View style={{ gap: 6 }}>
          {skipped.length > 0 ? (
            <Text variant="caption" tone="danger">
              Left out: {skipped.slice(0, 3).map((s) => `${s.name} (${s.reason})`).join(', ')}
              {skipped.length > 3 ? ` and ${skipped.length - 3} more` : ''}.
            </Text>
          ) : null}
          <Button
            label={busy ?? (pages.length ? `Make PDF (${plural(pages.length, 'page', 'pages')})` : 'Make PDF')}
            icon="share"
            size="lg"
            fullWidth
            loading={!!busy}
            disabled={pages.length === 0 || disabled}
            onPress={() => void make()}
          />
        </View>
      }
    >
      <View style={{ flex: 1, gap: 12 }}>
        <TextField value={name} onChangeText={setName} placeholder="File name" maxLength={80} returnKeyType="done" autoCapitalize="sentences" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Photo" icon="camera" variant="secondary" size="sm" disabled={disabled} onPress={() => void takePhoto()} accessibilityLabel="Take photo" />
          <Button label="Photos" icon="image" variant="secondary" size="sm" disabled={disabled} onPress={() => void choosePhotos()} accessibilityLabel="Choose photos" />
          <Button label="Files" icon="note" variant="secondary" size="sm" disabled={disabled} onPress={() => void chooseFiles()} accessibilityLabel="Choose files" />
        </View>
        {pages.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>{plural(pages.length, 'page', 'pages')}</Text>
            <Button label="Sort by name" variant="ghost" size="sm" disabled={disabled} onPress={() => setPages(sortByName(pages))} />
            <Button label="Clear" variant="ghost" size="sm" disabled={disabled} onPress={clearAll} />
          </View>
        ) : null}
        {pages.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <CoachSticker pose="clipboard" size={110} />
            <Text variant="subheading">No pages yet</Text>
            <Text variant="caption" tone="muted" style={{ textAlign: 'center', maxWidth: 280 }}>
              Take photos, or choose them from your gallery or Files. Put them in order, then tap Make PDF. It stays on your phone until you share it.
            </Text>
          </View>
        ) : (
          <FlatList
            data={pages}
            keyExtractor={(p) => p.id}
            numColumns={COLS}
            renderItem={renderItem}
            extraData={selected}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={{ gap: GAP, paddingBottom: 8 }}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
          />
        )}
        {sel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="label" tone="muted" style={{ flex: 1 }}>Page {selIndex + 1}</Text>
            <Button label="Start" variant="ghost" size="sm" disabled={disabled || selIndex === 0} onPress={() => setPages(moveToEdge(pages, selIndex, 'start'))} />
            <Button label="Earlier" icon="chevronLeft" variant="secondary" size="sm" disabled={disabled || selIndex === 0} onPress={() => move(-1)} />
            <Button label="Later" icon="chevronRight" variant="secondary" size="sm" disabled={disabled || selIndex === pages.length - 1} onPress={() => move(1)} />
            <Button label="Remove" icon="trash" variant="danger" size="sm" disabled={disabled} onPress={remove} />
          </View>
        ) : null}
      </View>
    </SheetScaffold>
  );
}
