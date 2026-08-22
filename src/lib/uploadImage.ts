/**
 * 사진 업로드 유틸리티
 *
 * Supabase Storage 버킷에 이미지를 업로드하고 public URL을 반환한다.
 * 경로 컨벤션: {bucket}/{user_id}/{timestamp}_{random}.{ext}
 */

import { File as FsFile } from 'expo-file-system';
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

/** 버킷별 상한 (Supabase storage.buckets.file_size_limit과 같은 값) */
const SIZE_LIMIT: Record<ImageBucket, number> = {
  'dog-avatars': 5 * 1024 * 1024,
  'checkin-photos': 10 * 1024 * 1024,
  'spot-suggestions': 10 * 1024 * 1024,
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function extFromUri(uri: string): string {
  const match = uri.match(/\.(jpe?g|png|webp|heic|heif)(\?|$)/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

/**
 * 로컬 파일을 바이트로 읽는다.
 *
 * ⚠️ fetch(uri).blob()을 쓰면 안 된다.
 *    Expo SDK 54(RN 0.81)의 fetch는 file:// 스킴을 지원하지 않아 요청이 네트워크로
 *    나가지도 못하고 던진다. 그래서 스토리지 서버에는 로그조차 남지 않았고,
 *    버킷 3개가 전부 0건이었다 — "사진 업로드 실패"만 뜨고 원인이 안 보이던 이유.
 *    expo-file-system의 File.bytes()는 네이티브에서 직접 읽으므로 스킴 문제가 없다.
 */
async function readBytes(uri: string): Promise<Uint8Array> {
  const file = new FsFile(uri);
  return await file.bytes();
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

  // ⚠️ 경로 첫 세그먼트는 반드시 auth.uid()여야 한다.
  //    스토리지 정책이 `(storage.foldername(name))[1] = auth.uid()::text`로 소유자를 판정하는데,
  //    호출부들이 앱 ID(users.user_id)를 넘기고 있어 모든 업로드가 조용히 403이었다.
  //    두 ID는 서로 다른 공간이라 호출부가 고를 여지를 아예 없애고 여기서 세션에서 읽는다.
  const { data: authData } = await supabase.auth.getUser();
  const ownerId = authData?.user?.id;
  if (!ownerId) throw new Error('로그인이 만료됐어요. 다시 로그인해주세요.');

  let bytes: Uint8Array;
  try {
    bytes = await readBytes(uri);
  } catch (e: any) {
    console.error('uploadImage: 파일 읽기 실패', uri, e?.message ?? e);
    throw new Error('사진을 읽지 못했어요. 다른 사진으로 시도해주세요.');
  }

  if (bytes.byteLength === 0) {
    throw new Error('사진을 읽지 못했어요. 다른 사진으로 시도해주세요.');
  }
  if (bytes.byteLength > SIZE_LIMIT[bucket]) {
    // 서버가 413으로 거절하면 원인이 안 보인다. 올리기 전에 사람 말로 알린다.
    const mb = (SIZE_LIMIT[bucket] / 1024 / 1024).toFixed(0);
    throw new Error(`사진이 너무 커요. ${mb}MB 이하로 올려주세요.`);
  }

  const ext = extFromUri(uri);
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${ownerId}/${filename}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType: MIME_BY_EXT[ext] ?? 'image/jpeg',
      // ⚠️ 이 값이 "숨김이 실제로 먹는 시간"을 정한다.
      //   버킷이 public이라 URL 앞에 CDN이 있다. 원본을 지워도 **캐시가 만료될 때까지
      //   기존 URL은 계속 200을 돌려준다** — 실측으로 cf-cache-status: HIT 확인(2026-08-23).
      //   예전 값 31536000(1년)이면 신고로 내린 사진이 최대 1년간 링크로 유통된다.
      //   파일명이 매번 고유해 캐시 적중은 어차피 "같은 사진 재조회"뿐이므로,
      //   조회 성능보다 조치 실효성을 택해 5분으로 낮춘다(정책 18번 §11 공개 차단).
      cacheControl: '300',
      upsert: false,
    });

  if (error) {
    console.error('uploadImage error:', error);
    throw new Error('사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요.');
  }

  // 새 파일이 올라간 뒤에 기존 파일을 지운다.
  // 먼저 지우면 업로드가 실패했을 때 원본까지 잃는다.
  if (oldPath) {
    const { error: rmError } = await supabase.storage.from(bucket).remove([oldPath]);
    if (rmError) console.error('uploadImage: 이전 파일 삭제 실패', oldPath, rmError.message);
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
