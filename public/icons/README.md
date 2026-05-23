# PWA 아이콘 사양

이 디렉토리에는 PWA 매니페스트 + iOS Safari가 참조하는 PNG 아이콘이 들어갑니다.  
출시 전 디자인 후 아래 파일들을 정확한 크기로 추가해야 합니다.

## 필요한 파일 (총 6개)

### Android Chrome / PWA 매니페스트
| 파일 | 크기 | 용도 |
|---|---|---|
| `icon-192.png` | 192×192 | `purpose: any` 표준 |
| `icon-512.png` | 512×512 | `purpose: any` 표준 (스플래시) |
| `icon-maskable-192.png` | 192×192 | `purpose: maskable` (적응형 아이콘) |
| `icon-maskable-512.png` | 512×512 | `purpose: maskable` |

### iOS Safari (apple-touch-icon)
| 파일 | 크기 | 용도 |
|---|---|---|
| `apple-touch-icon-180.png` | 180×180 | iOS 홈화면 추가 시 사용 |
| `favicon-32.png` | 32×32 | 브라우저 탭 |

## 디자인 가이드

### maskable 아이콘 (Android Chrome 적응형)
- **콘텐츠 안전 영역**: 중앙 **80%** 안에 핵심 요소 배치
- 외곽 10%는 잘릴 수 있음 (원/사각형/물방울 등 다양한 마스크 적용됨)
- 배경색 꽉 채우기 — 투명 배경 금지
- 미리보기: <https://maskable.app/editor>

### 표준 아이콘 (purpose: any)
- 둥근 모서리/그림자/장식 적용해도 됨
- 투명 배경 허용 (단, Android 일부 환경에선 배경 흰색이 깔림)

### iOS apple-touch-icon
- iOS는 자동으로 **둥근 사각형 마스크 + 작은 그림자** 적용
- 따라서 디자인은 **사각형 + 텍스트 없음** (텍스트는 가독성 X)
- 알파 채널 OK이지만 iOS는 검은 배경 깔리므로 배경색 명시 권장
- 1024×1024 원본에서 180×180으로 리사이즈

## 브랜드 톤
- Primary color: `#C47848` (DogEar 웜 브라운)
- Background: `#F5F3EF` (manifest background_color)
- 모티프: 강아지 발자국 (paw print)

## 생성 워크플로 권장

1. **1024×1024 원본 SVG/AI** 디자인
2. **iOS용**: 1024 → 180 PNG export
3. **Android 표준**: 1024 → 192, 512 PNG export
4. **Maskable**: 콘텐츠를 중앙 80%로 축소 후 192, 512 PNG export
5. **favicon**: 32×32 PNG (단순화된 버전)

도구:
- Figma `Export` (1x/2x/3x)
- <https://realfavicongenerator.net> (전체 자동 생성)
- <https://maskable.app/editor> (maskable 미리보기)
