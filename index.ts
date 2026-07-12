// react-native-url-polyfill: RN 기본 URL 구현이 불완전 → supabase-js(auth/functions)의
// new URL()/URLSearchParams가 실패함. 다른 어떤 모듈보다 먼저 로드해 global URL을 교체한다.
import 'react-native-url-polyfill/auto';
import 'expo-router/entry';
