/**
 * 업로드 전 사진에서 EXIF를 털어내는 유틸.
 *
 * 왜 필요한가:
 *   카메라로 찍은 사진에는 촬영 좌표(GPS)·시각·기기 정보가 EXIF로 박혀 있다.
 *   DogEar는 산책 경로를 저장하지 않는 앱인데, 사진에 좌표가 실려 장소 페이지에
 *   공개되면 그 원칙이 사진으로 새는 셈이 된다(집 근처에서 찍은 사진이면 집이 드러난다).
 *   ImagePicker의 `exif: false`는 "결과 객체에 EXIF를 담지 않는다"는 뜻일 뿐,
 *   파일 자체의 EXIF는 그대로 남는다. 그래서 재인코딩으로 실제로 지운다.
 *
 * 어떻게 지워지나:
 *   expo-image-manipulator는 디코딩 → 재인코딩을 하며 원본 메타데이터를 옮기지 않는다.
 *   그래서 변환을 하나도 걸지 않고 저장만 해도 EXIF가 떨어진다.
 *   방향(orientation) 정보도 함께 사라지지만, 매니퓰레이터가 회전을 이미 픽셀에 구워
 *   저장하므로 사진이 눕지 않는다.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** 재인코딩 품질 — 원본 대비 눈에 띄는 손실 없이 용량을 줄이는 선 */
const RECOMPRESS_QUALITY = 0.8;

/**
 * 사진 한 장의 EXIF를 제거하고, 새로 저장된 파일의 URI를 돌려준다.
 *
 * 실패하면 원본 URI를 그대로 돌려준다 — 사진을 잃는 것보다는 낫다는 판단이지만,
 * 그 경우 EXIF가 남은 채 업로드되므로 실패를 조용히 넘기지 않고 로그를 남긴다.
 */
export async function stripExif(uri: string): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri);
    const image = await context.renderAsync();
    const result = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: RECOMPRESS_QUALITY,
    });
    return result.uri;
  } catch (e: any) {
    console.error('stripExif 실패 — EXIF가 남은 채 업로드될 수 있음:', uri, e?.message ?? e);
    return uri;
  }
}

/** 여러 장을 순서를 지켜 처리한다. */
export async function stripExifAll(uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const uri of uris) {
    out.push(await stripExif(uri));
  }
  return out;
}
