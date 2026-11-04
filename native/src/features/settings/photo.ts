/** Profile photo: pick/take -> Firebase Storage `profilePictures/{uid}` -> users.photoURL (same path as the PWA's ProfileSettings). */
import * as ImagePicker from 'expo-image-picker';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase';

const MAX_BYTES = 5 * 1024 * 1024;

export type PhotoResult = { ok: true; url: string } | { ok: false; reason: 'cancelled' | 'permission' | 'toobig' | 'failed' };

export async function pickAndUploadPhoto(uid: string, source: 'library' | 'camera'): Promise<PhotoResult> {
  try {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'permission' };
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return { ok: false, reason: 'cancelled' };
    const asset = res.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_BYTES) return { ok: false, reason: 'toobig' };
    const blob = await (await fetch(asset.uri)).blob();
    if (blob.size > MAX_BYTES) return { ok: false, reason: 'toobig' };
    const r = ref(storage, `profilePictures/${uid}`);
    await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' });
    return { ok: true, url: await getDownloadURL(r) };
  } catch (e) {
    console.warn('[photo] upload failed', e);
    return { ok: false, reason: 'failed' };
  }
}

export async function deletePhotoObject(uid: string): Promise<void> {
  try {
    await deleteObject(ref(storage, `profilePictures/${uid}`));
  } catch {
    /* might not exist */
  }
}
