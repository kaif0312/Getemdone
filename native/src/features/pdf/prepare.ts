// Make a PDF: shrink a picked image to a cache JPEG (long edge <= MAX_EDGE, quality JPEG_QUALITY) and keep only its URI.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { fitWithin, JPEG_QUALITY, MAX_EDGE, newPageId, type PdfPage } from './pages';

/** Returns the page, or throws when the image cannot be decoded. `name` is kept for "Sort by name". */
export async function shrinkImage(uri: string, name = ''): Promise<PdfPage> {
  const ctx = ImageManipulator.manipulate(uri);
  try {
    const first = await ctx.renderAsync();
    const target = fitWithin(first.width, first.height, MAX_EDGE);
    let ref = first;
    if (target.width !== first.width || target.height !== first.height) {
      ctx.resize(first.width >= first.height ? { width: target.width } : { height: target.height });
      ref = await ctx.renderAsync();
    }
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    if (ref !== first) first.release();
    ref.release();
    return { id: newPageId(), kind: 'image', uri: out.uri, name, width: out.width, height: out.height };
  } finally {
    ctx.release();
  }
}

/** Best-effort delete of a cache file we made (never throws). */
export function dropFile(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* the system cache cleans up anyway */
  }
}
