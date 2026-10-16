/**
 * 사진 고르기 전 권한 확인 — 플랫폼별로 다르게 해야 한다.
 *
 * 안드로이드: 확인하지 않는다(항상 true).
 *   expo-image-picker의 requestMediaLibraryPermissionsAsync는 안드로이드 12 이하에서
 *   READ/WRITE_EXTERNAL_STORAGE를 요청하는데, 우리는 사진 권한 정책 때문에 이 둘을
 *   매니페스트에서 막아 두었다(app.json blockedPermissions). 그래서 요청이 즉시 거부되고,
 *   안드 8~12 사용자는 발도장·프로필·장소 사진을 아예 고를 수 없었다(2026-10-16 감사).
 *   사진 고르기(launchImageLibraryAsync)는 시스템 포토피커·GET_CONTENT라 권한이 필요 없다.
 *
 * iOS: 사진 보관함 권한을 확인·요청한다(제한된 접근도 고르기는 된다).
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export async function ensurePhotoLibraryAccess(): Promise<boolean> {
  if (Platform.OS === 'android' || Platform.OS === 'web') return true;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return perm.granted || perm.accessPrivileges === 'limited';
}
