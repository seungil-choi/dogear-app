# Semantic Icon Pack (Lucide-based)

React Native 프로젝트용 **시맨틱 라인 아이콘 시스템**.
Lucide 라이브러리를 래핑해 호출부에서 라이브러리 종속을 제거하고,
프로젝트 도메인에 맞는 의미 기반 이름(`home`, `paw`, `location-filled`, ...)으로 사용합니다.

## 왜 쓰는지

- **라이센스 부담 0** — Lucide MIT, 출처 표기 불필요. 상업/앱스토어 자유.
- **시맨틱 네이밍** — 호출부에서 `<Icon name="home" />` 만 쓰면 됨. 라이브러리 교체에 영향 0.
- **`*-filled` 변형 통일** — outline/filled을 같은 이름 prefix로 관리.
- **stroke 자동 가중** — 사이즈에 따라 stroke-width를 자동으로 조절해 작은 크기에서도 또렷.
- **단일 파일** — `Icon.tsx` 한 파일만 복사하면 끝.

## 설치

### 1) 의존성

```bash
# Expo 프로젝트
npx expo install react-native-svg lucide-react-native

# Bare React Native
npm install react-native-svg lucide-react-native
# iOS:
cd ios && pod install
```

### 2) 파일 복사

`Icon.tsx`를 프로젝트의 컴포넌트 폴더에 복사. 끝.

```
src/
  components/
    common/
      Icon.tsx   ← 여기로 복사
```

## 사용

```tsx
import { Icon } from './components/common/Icon';

// 기본
<Icon name="home" size={24} color="#1A1A1A" />

// 채움 변형
<Icon name="bookmark-filled" size={20} color="#FF6B35" />

// 작은 크기 (stroke 자동 굵게)
<Icon name="search" size={14} />

// stroke 명시 지정
<Icon name="paw" size={32} strokeWidth={1.5} />
```

## 제공되는 시맨틱 이름

총 **57개** (outline + filled 합산). 새 이름 추가는 [확장](#확장) 참고.

### 네비게이션

| 시맨틱 이름 | Lucide 컴포넌트 | 비고 |
|---|---|---|
| `home`, `home-filled` | `Home` | |
| `map`, `map-filled` | `Map` | |
| `paw`, `paw-filled` | `PawPrint` | |
| `bookmark`, `bookmark-filled` | `Bookmark` | |
| `person`, `person-filled` | `User` | |

### 액션

| 시맨틱 이름 | Lucide 컴포넌트 |
|---|---|
| `close` | `X` |
| `back`, `forward` | `ChevronLeft`, `ChevronRight` |
| `up`, `down` | `ChevronUp`, `ChevronDown` |
| `check`, `check-circle` | `Check`, `CheckCircle2` |
| `plus` | `Plus` |
| `search` | `Search` |
| `filter` | `SlidersHorizontal` |
| `share` | `Share2` |
| `more` | `MoreHorizontal` |
| `copy` | `Copy` |
| `chat`, `chat-filled` | `MessageCircle` |

### UI 요소

| 시맨틱 이름 | Lucide 컴포넌트 |
|---|---|
| `bell`, `bell-filled` | `Bell` |
| `location`, `location-filled` | `MapPin` |
| `navigate` | `Navigation` |
| `camera` | `Camera` |
| `image` | `Image` |
| `trash` | `Trash2` |
| `edit` | `Pencil` |
| `eye`, `eye-off` | `Eye`, `EyeOff` |

### 프라이버시 / 설정

| 시맨틱 이름 | Lucide 컴포넌트 |
|---|---|
| `lock`, `lock-open` | `Lock`, `LockOpen` |
| `settings` | `Settings` |
| `shield` | `ShieldCheck` |
| `help` | `HelpCircle` |
| `document` | `FileText` |
| `logout` | `LogOut` |
| `warning` | `TriangleAlert` |
| `info` | `Info` |

### 도메인 (반려견·산책)

| 시맨틱 이름 | Lucide 컴포넌트 |
|---|---|
| `dog`, `dog-side` | `Dog` |
| `star`, `star-outline` | `Star` (default filled) |
| `heart`, `heart-filled` | `Heart` |
| `walk` | `Footprints` |
| `flag`, `flag-filled` | `Flag` |
| `list` | `List` |

### 카테고리 (장소 유형)

| 시맨틱 이름 | Lucide 컴포넌트 | 의도 |
|---|---|---|
| `park` | `TreePine` | 공원 |
| `trail` | `Mountain` | 산책로 |
| `riverside` | `Waves` | 강변·하천 |
| `rest` | `Coffee` | 쉼터 |
| `leaf`, `leaf-filled` | `Leaf` | 자연·친환경 |
| `tag`, `tag-filled` | `Tag` | 태그·라벨 |

## 확장

### 새 아이콘 추가

```tsx
// 1) Lucide에서 import
import { Headphones } from 'lucide-react-native';

// 2) ICON_MAP 에 추가
const ICON_MAP = {
  // ... 기존 ...
  audio:          { Component: Headphones },
  'audio-filled': { Component: Headphones, filled: true },
} as const satisfies Record<string, IconDef>;
```

`IconName` 타입은 자동 추론되므로 호출부에서 `<Icon name="audio" />` 즉시 사용 가능.

### 도메인 이름 바꾸기

`paw`, `dog`, `walk` 같은 이름은 반려견 앱 도메인에 맞춰져 있습니다.
다른 도메인이면 의미에 맞게 키 이름만 변경하시면 됩니다 (Lucide 컴포넌트는 그대로):

```tsx
// 헬스케어 앱이라면
heartrate:    { Component: Activity },
prescription: { Component: Pill },
```

### Stroke 가중 정책 바꾸기

`Icon` 함수 안의 `sw` 계산식 수정:

```tsx
const sw = strokeWidth ?? (size <= 16 ? 2 : size <= 24 ? 1.75 : 1.5);
//                          ↑ 여기 숫자만 바꾸면 됨
```

### 개발용 — 모든 아이콘 미리보기

```tsx
import { ALL_ICON_NAMES, Icon } from './Icon';

// 디버그/스토리북 화면
<ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16 }}>
  {ALL_ICON_NAMES.map(name => (
    <View key={name} style={{ alignItems: 'center', width: 80 }}>
      <Icon name={name} size={24} />
      <Text style={{ fontSize: 10, marginTop: 4 }}>{name}</Text>
    </View>
  ))}
</ScrollView>
```

## 라이선스

MIT — 자유롭게 복사·수정·배포 가능.

내부에서 사용하는 라이브러리 라이선스:

- **Lucide** ([MIT](https://github.com/lucide-icons/lucide/blob/main/LICENSE)) — 출처 표기 불필요
- **react-native-svg** ([MIT](https://github.com/software-mansion/react-native-svg/blob/main/LICENSE))
