import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export interface PreparedImage {
  base64: string;
  uri: string;
  width: number;
  height: number;
}

export async function pickImage(): Promise<PreparedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Serve il permesso per accedere alla libreria foto');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 5],
    quality: 1,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  // Il re-encoding rimuove i metadati EXIF (inclusa la posizione GPS).
  const processed = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: 1200 } }],
    {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  if (!processed.base64) throw new Error('Elaborazione immagine non riuscita');
  return {
    base64: processed.base64,
    uri: processed.uri,
    width: processed.width,
    height: processed.height,
  };
}

const PHOTO_MAP_PREFIX = 'fiamma.localPhotos.';
type PhotoMap = Record<string, string>;

function mapKey(userId: string) {
  return `${PHOTO_MAP_PREFIX}${userId}`;
}

async function readPhotoMap(userId: string): Promise<PhotoMap> {
  try {
    const raw = await AsyncStorage.getItem(mapKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

async function writePhotoMap(userId: string, map: PhotoMap): Promise<void> {
  await AsyncStorage.setItem(mapKey(userId), JSON.stringify(map));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// expo-file-system non supporta il web: il file viene importato solo su mobile.
async function saveNativeFile(image: PreparedImage, filename: string): Promise<string> {
  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, 'photos');
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  const file = new File(directory, filename);
  file.create({ overwrite: true });
  await file.write(base64ToBytes(image.base64));
  return file.uri;
}

async function nativeFileExists(uri: string): Promise<boolean> {
  const { File } = await import('expo-file-system');
  return new File(uri).exists;
}

async function deleteNativeFile(uri: string): Promise<void> {
  const { File } = await import('expo-file-system');
  const file = new File(uri);
  if (file.exists) file.delete();
}

export async function saveLocalPhoto(
  userId: string,
  image: PreparedImage,
): Promise<string> {
  const id = Crypto.randomUUID();
  const key = `${userId}/local/${id}.jpg`;
  const uri =
    Platform.OS === 'web'
      ? `data:image/jpeg;base64,${image.base64}`
      : await saveNativeFile(image, `${id}.jpg`);

  const map = await readPhotoMap(userId);
  map[key] = uri;
  await writePhotoMap(userId, map);
  return key;
}

export async function resolvePhotoUrls(
  userId: string,
  keys: string[],
): Promise<Record<string, string>> {
  const map = await readPhotoMap(userId);
  const unique = Array.from(new Set(keys.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (key) => {
      const uri = map[key];
      if (!uri) return null;
      if (Platform.OS !== 'web' && !(await nativeFileExists(uri))) return null;
      return [key, uri] as const;
    }),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, string] => entry !== null),
  );
}

export async function deleteLocalPhoto(userId: string, key: string): Promise<void> {
  const map = await readPhotoMap(userId);
  const uri = map[key];
  if (!uri) return;
  if (Platform.OS !== 'web') {
    await deleteNativeFile(uri).catch(() => undefined);
  }
  delete map[key];
  await writePhotoMap(userId, map);
}

export async function clearLocalPhotos(userId: string): Promise<void> {
  const map = await readPhotoMap(userId);
  if (Platform.OS !== 'web') {
    await Promise.all(
      Object.values(map).map((uri) => deleteNativeFile(uri).catch(() => undefined)),
    );
  }
  await AsyncStorage.removeItem(mapKey(userId));
}
