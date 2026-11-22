// Make a PDF needs native modules that older store builds lack (expo-image-manipulator, expo-document-picker arrived after the
// first 1.1.0 Android build, same runtimeVersion). Their JS throws at import time when the native side is missing, so nothing may
// import PdfScreen / prepare.ts until this says yes. An OTA on such a build then hides the Me row and the route shows "update".
import { requireOptionalNativeModule } from 'expo';

const NEEDED = ['ExpoImageManipulator', 'ExpoDocumentPicker', 'FileSystem', 'ExpoSharing'] as const;

let cached: boolean | null = null;
export function pdfToolsAvailable(): boolean {
  if (cached === null) {
    try {
      cached = NEEDED.every((n) => requireOptionalNativeModule(n) != null);
    } catch {
      cached = false;
    }
  }
  return cached;
}
