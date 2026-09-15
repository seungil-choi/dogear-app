# -*- coding: utf-8 -*-
"""
Play 제출 전 AAB 검사 — 매니페스트 규격 + 번들에 든 문구 + 비밀값 유출.

    python3 scripts/check-release-aab.py <파일.aab> [--expect-version N]

왜 필요한가:
  "번들에 박힌 것이 정본이다." 웹 약관만 고치고 앱 번들은 구본인 채로 심사에 들어간 사고가
  vc3·vc6에서 두 번 있었다. 빌드할 때마다 무엇이 실제로 들어갔는지 눈으로가 아니라 바이트로 확인한다.

규칙:
  · 대조군(반드시 있는 문자열)부터 찾는다. 하나라도 없으면 나머지 결과는 믿지 않는다.
  · Hermes 번들의 한글은 UTF-16LE, ASCII는 1바이트로 저장된다 — 두 인코딩을 모두 센다.
  · 비밀값은 로컬 env 파일에서 읽어 비교만 한다. 값은 출력하지 않는다.
  · 새 수정이 들어가면 NEW에, 사라져야 할 문구는 OLD에 추가한다.

외부 도구(bundletool·aapt2) 없이 aapt2 protobuf 매니페스트를 직접 읽는다.
"""
import os, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
ROOT = os.path.dirname(APP)

# Play 대상 API 요건 — 2026-08-31부터 새 앱·업데이트는 API 36 이상
MIN_TARGET_SDK = 36

CONTROLS = ["support@9factorial.com", "발도장 남기기", "위치기반서비스 이용약관"]

NEW = [
    "제17조", "이용자 콘텐츠의 권리와 이용허락", "개인위치정보의 처리",   # 약관 3종 (09-12)
    "제1529호",                                                         # 위치기반서비스사업 신고번호
    "주소 수정", "현재 위치로 핀 옮기기", "핀을 옮겨서 주소를 다시 불러왔어요",  # 장소 등록 (09-13)
    "relayoutMap", "centerSettled",                                     # 지도 (09-13)
    "전남광주통합특별시",                                                # 지역 표기 (09-13)
    "이름 또는 닉네임, 프로필 사진", "강아지 프로필 추가 정보",            # 처리방침 §1 보강 (09-15)
]

OLD = [
    "6개월 이상 보관",        # 위치약관 옛 확인자료 표현
    "특별시|광역시|도$",       # 옛 시·도 축약 정규식
]

# 앱이 쓰지 않아 없어야 하는 권한
FORBIDDEN_PERMISSIONS = [
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.ACCESS_BACKGROUND_LOCATION",
    "android.permission.RECORD_AUDIO",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "com.google.android.gms.permission.AD_ID",   # 데이터 보안 답안: 광고 ID 사용 안 함
]

SECRETS = [  # (라벨, env 파일, 키)
    ("SUPABASE_SERVICE_ROLE_KEY", f"{ROOT}/dogear-admin/.env.local", "SUPABASE_SERVICE_ROLE_KEY"),
    ("KAKAO_REST_API_KEY", f"{APP}/.env", "KAKAO_REST_API_KEY"),
    ("NAVER_CLIENT_SECRET", f"{APP}/.env", "EXPO_PUBLIC_NAVER_CLIENT_SECRET"),
]


# ── aapt2 protobuf(XmlNode) 최소 파서 ───────────────────────────────
def _varint(b, i):
    s = r = 0
    while True:
        c = b[i]; i += 1; r |= (c & 0x7F) << s; s += 7
        if not c & 0x80:
            return r, i


def _fields(b):
    i, out = 0, []
    while i < len(b):
        k, i = _varint(b, i); f, w = k >> 3, k & 7
        if w == 0: v, i = _varint(b, i)
        elif w == 2: n, i = _varint(b, i); v = b[i:i + n]; i += n
        elif w == 5: v = b[i:i + 4]; i += 4
        elif w == 1: v = b[i:i + 8]; i += 8
        else: raise ValueError(w)
        out.append((f, w, v))
    return out


def _walk(node, out):
    for f, w, v in _fields(node):
        if f == 1 and w == 2:
            name, attrs, kids = "", {}, []
            for ef, ew, ev in _fields(v):
                if ef == 3: name = ev.decode()
                elif ef == 4:
                    an = av = ""
                    for af, aw, x in _fields(ev):
                        if af == 2: an = x.decode()
                        elif af == 3: av = x.decode()
                    attrs[an] = av
                elif ef == 5: kids.append(ev)
            out.append((name, attrs))
            for k in kids: _walk(k, out)


def main():
    aab = sys.argv[1]
    expect = int(sys.argv[sys.argv.index("--expect-version") + 1]) if "--expect-version" in sys.argv else None
    z = zipfile.ZipFile(aab)
    ok_all = True

    def check(label, cond, detail=""):
        nonlocal ok_all
        ok_all &= bool(cond)
        print(f"  {'✓' if cond else '✗'} {label}{('  ' + detail) if detail else ''}")

    # ── 매니페스트 ──
    nodes = []
    _walk(z.read("base/manifest/AndroidManifest.xml"), nodes)
    man = next(a for n, a in nodes if n == "manifest")
    sdk = next((a for n, a in nodes if n == "uses-sdk"), {})
    perms = {a.get("name") for n, a in nodes if n == "uses-permission"}
    print("── 매니페스트 ──")
    check("패키지 com.factorial9.dogear", man.get("package") == "com.factorial9.dogear", man.get("package", ""))
    if expect is not None:
        check(f"versionCode {expect}", man.get("versionCode") == str(expect), man.get("versionCode", ""))
    else:
        print(f"  · versionCode {man.get('versionCode')}")
    check(f"targetSdkVersion ≥ {MIN_TARGET_SDK}", int(sdk.get("targetSdkVersion", "0")) >= MIN_TARGET_SDK, sdk.get("targetSdkVersion", ""))
    for p in FORBIDDEN_PERMISSIONS:
        check(f"권한 없음: {p.split('.')[-1]}", p not in perms)

    # ── 번들 문자열 ──
    names = [n for n in z.namelist() if n.endswith("index.android.bundle")]
    data = z.read(names[0])
    count = lambda s: data.count(s.encode("utf-8")) + data.count(s.encode("utf-16-le"))
    print("── 대조군 (없으면 이하 무효) ──")
    ctrl_ok = all(count(s) > 0 for s in CONTROLS)
    for s in CONTROLS: check(s, count(s) > 0, f"{count(s)}건")
    print("── 들어가야 할 것 ──")
    for s in NEW: check(s, count(s) > 0, f"{count(s)}건")
    print("── 없어야 할 옛 문구 ──")
    for s in OLD: check(s, count(s) == 0, f"{count(s)}건")
    print("── 시드 데이터 꺼짐 ──")
    check("EXPO_PUBLIC_DEV_SEED 문자열 0건 (Metro가 false로 인라인)", count("EXPO_PUBLIC_DEV_SEED") == 0)
    print("── 비밀값 유출 (값은 출력하지 않음) ──")
    for label, path, key in SECRETS:
        val = None
        if os.path.exists(path):
            for line in open(path, encoding="utf-8"):
                if line.startswith(key + "="):
                    val = line.split("=", 1)[1].strip()
        if not val:
            print(f"  ? {label}: 로컬 값이 없어 검사 못 함")
            continue
        check(f"{label} 없음", count(val) == 0)

    print("\n=== 결과:", "통과" if (ok_all and ctrl_ok) else "실패 — 위 ✗ 확인", "===")
    sys.exit(0 if (ok_all and ctrl_ok) else 1)


if __name__ == "__main__":
    main()
