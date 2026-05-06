# 🚀 DogEar Android 출시 가이드

이 문서는 **사용자가 직접 진행**해야 하는 외부 작업들을 단계별로 안내합니다.
모든 코드/인프라 작업은 완료된 상태이며, 아래 외부 등록만 마치면 출시 가능합니다.

---

## ✅ 이미 완료된 것 (개발자 측)

- Supabase 프로젝트, DB 스키마, RLS, 트리거 ✓
- Edge Functions: `spots-nearby`, `paw-checkin`, `spot-detail`, `familiar-dogs`, `delete-account`, `kakao-auth`, `send-push` ✓
- Storage 버킷: `dog-avatars`, `checkin-photos`, `spot-suggestions` ✓
- 사진 업로드 코드 (dog-edit 화면) ✓
- pg_cron 자동 정리 스케줄 ✓
- Google Sign-In, 카카오 로그인, 푸시 알림 코드 ✓
- Vercel 웹 데모 (https://dogear-demo.vercel.app) ✓
- 법적 문서 GitHub Pages (https://seungil-choi.github.io/dogear-app/legal/) ✓

---

## 🔴 출시 전 사용자가 해야 할 것 (순서대로)

### Step 1. GitHub Pages 활성화 (1분, 무료)

1. https://github.com/seungil-choi/dogear-app/settings/pages
2. **Source**: `Deploy from a branch` → `main` / `/docs` → **Save**
3. 1~2분 후 다음 URL이 활성화됨:
   - https://seungil-choi.github.io/dogear-app/legal/privacy-policy.html
   - https://seungil-choi.github.io/dogear-app/legal/terms.html
   - https://seungil-choi.github.io/dogear-app/legal/location-terms.html

---

### Step 2. Google Cloud Console — OAuth 설정 (15분, 무료)

#### 2-1. 프로젝트 생성
1. https://console.cloud.google.com/
2. 프로젝트 만들기: **DogEar**

#### 2-2. OAuth 동의 화면 구성
1. **APIs & Services** → **OAuth consent screen**
2. User Type: **External** → Create
3. 앱 이름: `DogEar`, 사용자 지원 이메일: `seungil.office@gmail.com`
4. 개발자 연락처: `seungil.office@gmail.com`
5. 승인된 도메인: `seungil-choi.github.io` (개인정보처리방침 호스팅용)
6. Scopes: `email`, `profile`, `openid`만 추가
7. 테스트 사용자: 본인 이메일 추가

#### 2-3. OAuth Client ID 발급 (3종)

**Web Client** (Supabase에 입력용):
1. **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**
2. Type: **Web application**
3. 이름: `DogEar Web`
4. 승인된 리디렉션 URI: `https://ncargfjnfsabmdwmegyn.supabase.co/auth/v1/callback`
5. **Client ID 메모** → Web Client ID

**Android Client**:
1. Type: **Android**
2. 이름: `DogEar Android`
3. Package name: `com.factorial9.dogear`
4. SHA-1: EAS 첫 빌드 후 `eas credentials` 명령으로 확인 (Step 5 후)

#### 2-4. 환경변수 추가
`.env.production` 파일에 추가:
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=발급받은-web-client-id.apps.googleusercontent.com
```

---

### Step 3. Supabase Auth — Google Provider 설정 (3분)

1. https://supabase.com/dashboard/project/ncargfjnfsabmdwmegyn/auth/providers
2. **Google** 토글 ON
3. **Client ID for OAuth**: Step 2-3에서 발급받은 Web Client ID
4. **Client Secret for OAuth**: Web Client에서 발급된 Secret
5. **Authorized Client IDs**: Android Client ID도 함께 입력 (콤마 구분)
6. **Save**

---

### Step 4. 카카오 디벨로퍼 등록 (선택 — 출시 후 추가 가능, 30분)

1. https://developers.kakao.com/ → 로그인
2. **내 애플리케이션** → **애플리케이션 추가하기**
   - 앱 이름: `DogEar`
   - 사업자명: `9Factorial`
3. **앱 키** 메모: **네이티브 앱 키**
4. **플랫폼 등록** → Android
   - 패키지명: `com.factorial9.dogear`
   - 키 해시: EAS 빌드 후 `eas credentials` 에서 확인 가능
5. **카카오 로그인 활성화**
   - **카카오 로그인** → ON
   - **OpenID Connect 활성화** ON
   - **Redirect URI** (앱용 자동 생성)
6. **동의 항목**: `프로필 정보(닉네임)`, `이메일` 필수 선택

`.env.production` 파일에 추가:
```
EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY=발급받은-네이티브-앱-키
```

---

### Step 5. Google Play Console 가입 (1일, $25 일회성)

1. https://play.google.com/console/signup
2. 개발자 계정 등록 ($25 결제, 한 번만)
3. **24시간 이내** 승인 (보통 즉시)
4. 새 앱 만들기:
   - 이름: `DogEar — 강아지와 함께한 산책의 기록`
   - 기본 언어: 한국어
   - 앱 또는 게임: 앱
   - 무료 또는 유료: 무료

---

### Step 6. EAS 빌드 (30분)

#### 6-1. EAS CLI 로그인
```bash
cd dogear-app
npx eas-cli login
npx eas-cli init    # 프로젝트 등록 → app.json의 projectId 자동 입력됨
```

#### 6-2. 첫 빌드 (preview-real, APK 형식 — 직접 설치용)
```bash
npx eas-cli build --profile preview-real --platform android
```
약 15~20분 소요. 빌드 완료 후 .apk 다운로드 URL 제공됨 → **Slack/카카오톡으로 .apk 공유 → 모바일에서 직접 설치 가능**.

#### 6-3. 프로덕션 빌드 (.aab, Play Store 제출용)
```bash
npx eas-cli build --profile production --platform android
```

#### 6-4. 키 해시(SHA-1) 확인 — Google/카카오 등록용
```bash
npx eas-cli credentials
# Android → production keystore → Show
```
표시된 SHA-1 fingerprint를:
- Google Cloud Console → Android Client → SHA-1 등록
- Kakao → Android 플랫폼 → 키 해시 등록 (Base64 변환 필요)

---

### Step 7. Play Console 업로드 + 내부 테스트 (1일)

1. Step 6의 .aab 파일을 Play Console에 업로드
2. **내부 테스트** 트랙 → 테스터 등록 (이메일 추가)
3. 테스터들이 Google Play Store에서 .aab 설치 가능
4. 메타데이터 작성 (한국어):
   - **앱 설명** (4,000자): 산책 트래커, 강아지 동반 장소, 발도장 기록 등
   - **스크린샷** (최소 2장, 16:9 또는 9:16)
   - **앱 아이콘** 512x512
   - **개인정보처리방침 URL**: `https://seungil-choi.github.io/dogear-app/legal/privacy-policy.html`
5. **콘텐츠 등급** 설문 작성

---

### Step 8. 위치기반서비스사업자 신고 (3~5영업일, 무료)

> ⚠️ **위치정보의 보호 및 이용 등에 관한 법률**상 의무. 미신고 시 과태료 1천만원 이하

1. https://www.lbs.go.kr/
2. **위치기반서비스사업자 신고** → 일반 위치기반서비스사업자
3. 사업자 정보, 서비스 명세서 작성
4. 처리 완료 후 신고증 수령

---

### Step 9. 정식 출시 (Play Console)

1. 내부 테스트 → 비공개 테스트 (선택) → 프로덕션 트랙 승격
2. **출시 검토**: Google이 수동 검토 (1~3일)
3. 승인 후 자동 게시

---

## 📋 비용 요약

| 항목 | 비용 | 빈도 |
|---|---|---|
| Google Play Console 등록 | $25 | 1회 |
| Supabase 무료 플랜 | 무료 | 사용자 ~1k까지 |
| Supabase Pro (필요 시) | $25/월 | 사용자 1k+ |
| 도메인(선택) | ~$15/년 | 1년 |
| **합계 (출시까지)** | **$25** | — |

---

## 🆘 문제 발생 시

- EAS 빌드 실패 → `npx eas-cli build:list` → 빌드 로그 확인
- Supabase Auth 오류 → 대시보드 Authentication → Logs
- 푸시 알림 작동 안 함 → 디바이스 알림 권한 + Expo Push Tool로 테스트
- Edge Function 오류 → Supabase Functions → Logs

---

## 🎯 권장 일정

| 일자 | 작업 |
|---|---|
| Day 1 | Step 1, 2, 3 (GitHub Pages, Google OAuth, Supabase 설정) |
| Day 2 | Step 5, 6 (Play Console 등록, 첫 EAS 빌드) |
| Day 3 | Step 6-4, 7 (SHA-1 추가 등록, Play Console 메타데이터) |
| Day 4~ | 내부 테스트 진행 + Step 8 (위치기반서비스 신고 병행) |
| Day 7~10 | Step 9 정식 출시 (Google 심사 1~3일) |

**총 소요: 약 1~2주**, 막힘 없이 진행 시 **7일 내 출시 가능**.
