import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { getSupabase } from './supabase';

export interface PreparedImage {
  base64: string;
  uri: string;
  width: number;
  height: number;
}

interface SignedUrl {
  key: string;
  url: string;
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

async function signR2(keys: string[], action: 'put' | 'get'): Promise<SignedUrl[]> {
  const { data, error } = await getSupabase().functions.invoke('r2-sign', {
    body: { action, keys },
  });
  if (error) throw new Error('Storage non raggiungibile: verifica la funzione r2-sign');
  const payload = data as { urls?: SignedUrl[]; error?: string } | null;
  if (!payload?.urls) throw new Error(payload?.error ?? 'Firma URL non riuscita');
  return payload.urls;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function uploadPhoto(userId: string, image: PreparedImage): Promise<string> {
  const key = `${userId}/${Crypto.randomUUID()}.jpg`;
  const [signed] = await signR2([key], 'put');
  const response = await fetch(signed.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: base64ToBytes(image.base64) as unknown as BodyInit,
  });
  if (!response.ok) {
    throw new Error(`Upload foto non riuscito (${response.status})`);
  }
  return key;
}

export async function signPhotoKeys(keys: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  if (unique.length === 0) return {};

  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += 30) {
    chunks.push(unique.slice(index, index + 30));
  }

  const signed = (await Promise.all(chunks.map((chunk) => signR2(chunk, 'get')))).flat();
  return Object.fromEntries(signed.map((entry) => [entry.key, entry.url]));
}
