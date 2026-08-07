/**
 * 사진 업로드 유틸리티
 *
 * Supabase Storage 버킷에 이미지를 업로드하고 public URL을 반환한다.
 * 경로 컨벤션: {bucket}/{user_id}/{timestamp}_{random}.{ext}
 */

import { supabase } from './supabase';

import { IS_REAL_AUTH } from '../config/env';

export type ImageBucket = 'dog-avatars' | 'checkin-photos' | 'spot-suggestions';

interface UploadOptions {
  bucket: ImageBucket;
  uri: string;          // ImagePicker에서 받은 로컬 URI
  /** 기존 파일 삭제할 경로 (선택) */
  oldPath?: string;
}

export interface UploadResult {
  url: string;          // public URL
  path: string;         // bucket 내 경로 (DELETE 시 사용)
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

function extFromUri(uri: string): string {
  const match = uri.match(/\.(jpe?g|png|webp|heic)(\?|$)/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

/**
 * Supabase Storage에 이미지 업로드
 * DEV 모드에서는 로컬 URI 그대로 반환 (mock 데이터용)
 */
export async function uploadImage(opts: UploadOptions): Promise<UploadResult> {
  const { bucket, uri, oldPath } = opts;

  if (!IS_REAL_AUTH) {
    return { url: uri, path: '' };
  }

  // 기존 파일 삭제 (replace 시)
  if (oldPath) {
    await supabase.storage.from(bucket).remove([oldPath]).catch(() => {});
  }

  // ⚠️ 경로 첫 세그먼트는 반드시 auth.uid()여야 한다.
  //    스토리지 정책이 `(storage.foldername(name))[1] = auth.uid()::text`로 소유자를 판정하는데,
  //    호출부들이 앱 ID(users.user_id)를 넘기고 있어 **모든 업로드가 조용히 403**이었다.
  //    (storage.objects 전 버킷 0건 · 모든 avatar_url null로 확인)
  //    두 ID는 서로 다른 공간이라 호출부가 고를 여지를 아예 없애고 여기서 세션에서 읽는다.
  const { data: authData } = await supabase.auth.getUser();
  const ownerId = authData?.user?.id;
  if (!ownerId) throw new Error('로그인이 만료됐어요. 다시 로그인해주세요.');

  const blob = await uriToBlob(uri);
  const ext = extFromUri(uri);
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${ownerId}/${filename}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    console.error('uploadImage error:', error);
    throw new Error('사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요.');
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * public URL에서 storage 경로 추출 (삭제용)
 */
export function pathFromPublicUrl(url: string, bucket: ImageBucket): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}

export async function deleteImage(bucket: ImageBucket, path: string): Promise<void> {
  if (!IS_REAL_AUTH || !path) return;
  await supabase.storage.from(bucket).remove([path]).catch(() => {});
}
