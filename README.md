# Chzzk Audio Auto-Scale

치지직(Chzzk) 라이브 방송 음량을 실시간으로 평탄화(정규화)하는 크롬 확장 프로그램.

매니페스트 V3 기반으로 `chrome.tabCapture` + 오프스크린 문서 + Web Audio API + AudioWorklet을 조합하여, 방송 진행자별로 다른 음량과 동적 범위를 BS.1770/1771-2 LUFS 기준으로 자동 조정한다.

## 주요 기능

- **자동 음량 정규화 (AGC)**: 목표 -15 LUFS로 실시간 추적
- **피크 리미터**: 폭음·비명 등 돌발 큰 소리 억제 (DynamicsCompressorNode)
- **Silence Gate**: 휴지·무음 구간에 게인 동결로 펌핑 방지
- **비대칭 attack/release**: 큰 소리는 빠르게, 작은 소리는 천천히 응답
- **다중 탭 동시 지원**: 최대 4개 치지직 탭 동시 운영, LRU 자동 해제
- **화질 변경 무시**: tabCapture로 DOM 변동성 영향 받지 않음
- **팝업 UI**: 토글, 5개 파라미터 슬라이더, 실시간 LUFS·게인 미터

## 진행 상태

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | MV3 코어 환경 + tabCapture/Offscreen 파이프라인 | ✅ |
| 2a | DSP 체인 (Limiter + Gain + Glue) | ✅ |
| 2b | AudioWorklet K-weighted Momentary Loudness AGC | ✅ |
| 3a | LRU 다중 탭 한도 + 풀 네비게이션 재활성화 배지 | ✅ |
| 3b | DRM 다중 휴리스틱 Content Script | ⏸️ 보류 |
| 4a-1 | 팝업 UI + 5개 파라미터 슬라이더 | ✅ |
| 4a-2 | 실시간 LUFS·게인 미터 | ✅ |
| 4b | 활성 탭 리스트 + 탭별 파라미터 분리 | 🔜 |
| 4c | `chrome.storage` 기반 설정 영속화 | ✅ |
| 4d | 시각 미터 바 (LUFS·게인 게이지) | ✅ |

자세한 설계 의도와 의사결정은 [ROADMAP.md](./ROADMAP.md) 참고.

크롬 웹 스토어 출시 관련 문서:
- [docs/STORE_LISTING.md](./docs/STORE_LISTING.md) — 등록 폼용 설명·권한 정당화
- [docs/PRIVACY_POLICY.md](./docs/PRIVACY_POLICY.md) — 개인정보처리방침
- [docs/ICON_CONCEPT.md](./docs/ICON_CONCEPT.md) — 아이콘 디자인 명세

## 개발 환경

- Node.js 20+
- npm 10+
- Chrome 116+ (`chrome.runtime.getContexts` 요구)

## 빌드 및 로드

```bash
npm install
npm run build       # dist/ 생성
npm run dev         # 핫 리로드 개발 모드
npm run typecheck   # 타입 검사만
npm run package     # 크롬 웹 스토어 제출용 releases/<name>-<version>.zip 생성
```

크롬에 로드:

1. `chrome://extensions/` 이동
2. 우상단 **개발자 모드** ON
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. `dist/` 디렉토리 선택 (프로젝트 루트가 아님!)

코드 변경 후에는 `npm run build` 다시 실행 + `chrome://extensions/`에서 익스텐션 카드의 새로고침 버튼(⟳) 클릭.

## 사용 방법

1. 치지직 방송 페이지 (`chzzk.naver.com/live/...`) 접속
2. 익스텐션 아이콘 클릭 → 팝업이 열림
3. **OFF** 버튼 클릭 → **ON** (녹색)으로 변경, 캡처 시작
4. 방송 음량이 목표 -15 LUFS 근처로 자동 평탄화됨
5. 슬라이더로 미세 조정 (변경 즉시 모든 활성 탭에 반영)
6. 다시 **ON** 클릭하면 캡처 중지

### 배지 의미

| 배지 | 색 | 의미 |
|---|---|---|
| `ON` | 녹색 | 캡처 진행 중 |
| `!` | 주황 | 페이지 새로고침 등으로 캡처 끊김 — 아이콘 다시 클릭하여 복구 |
| (없음) | — | 비활성 |

### 미터 상태

| 상태 | 의미 |
|---|---|
| `TRACKING` (녹색) | 정상 추적 중. AGC가 게인을 조정 |
| `GATED` (주황) | 무음/조용한 구간 감지 — 게인 동결 |
| `OFF` | 해당 탭 캡처 안 함 |

## AGC 파라미터

팝업의 슬라이더로 조정 가능:

| 파라미터 | 범위 | 기본값 | 설명 |
|---|---|---|---|
| 목표 음량 | -30 ~ -5 LUFS | -15 | 정규화하고자 하는 인지 음량. 낮을수록 조용함 |
| Silence Gate | -70 ~ -25 dBFS | -45 | 이 값보다 작은 신호는 게이팅(게인 동결) |
| 최대 증폭 | ±6 ~ ±24 dB | ±18 | AGC가 적용 가능한 게인 절댓값 한도 |
| Attack | 0.05 ~ 1.0 s | 0.15 | 신호가 커질 때 게인 줄이는 속도(시정수) |
| Release | 0.5 ~ 10 s | 3.0 | 신호가 작아질 때 게인 올리는 속도(시정수) |

비대칭(Attack < Release)으로 폭음 방지 + 펌핑 억제를 동시 달성.

## 아키텍처

```
┌─────────────┐   chrome.runtime    ┌──────────────────┐
│   Popup UI  │ ◄────messaging────► │  Service Worker  │
└─────────────┘                     └────────┬─────────┘
                                             │
                                             │ tabCapture API
                                             │ offscreen API
                                             ▼
                              ┌──────────────────────────┐
                              │   Offscreen Document     │
                              │  (USER_MEDIA, hidden)    │
                              │                          │
                              │  Per-tab DSP graph:      │
                              │  Source                  │
                              │   → Limiter              │
                              │     → Gain (AGC)─────┐   │
                              │       → Glue         │   │
                              │         → destination│   │
                              │                      │   │
                              │  Sidechain:          │   │
                              │  Limiter             │   │
                              │   → K-weight HS      │   │
                              │     → K-weight HP    │   │
                              │       → AudioWorklet ┘   │
                              │         (LUFS calc)      │
                              └──────────────────────────┘
                                             │
                                             ▼
                                   시청자 스피커
```

핵심 아키텍처 결정:
- **`tabCapture`**: `<video>` DOM 요소가 화질 변경 시 파괴/재생성되어도 영향 없음
- **`USER_MEDIA` reason**: 30초 무음 타임아웃 회피 (방송 휴식 시에도 살아있음)
- **AudioWorklet**: 오디오 렌더 스레드에서 정확한 윈도잉, 메인 스레드 부하 없음
- **K-weighting (BiquadFilterNode)**: 네이티브 C++ 코드로 처리되어 추가 레이턴시 없음

자세한 의사결정 과정은 [ROADMAP.md](./ROADMAP.md) 참고.

## 디렉토리 구조

```
sound-autoscale/
├── ROADMAP.md                      # 설계 문서 (의사결정·예외처리 전략)
├── README.md                       # 이 문서
├── manifest.config.ts              # crxjs MV3 매니페스트
├── vite.config.ts                  # Vite + crxjs 번들 설정
├── tsconfig.json
├── package.json
├── public/
│   └── loudness-processor.js       # AudioWorklet 프로세서 (BS.1770)
└── src/
    ├── service-worker.ts           # MV3 SW: 토글, tabCapture, LRU
    ├── messages.ts                 # 컨텍스트 간 메시지 타입
    ├── dsp.ts                      # Web Audio 노드 그래프 팩토리
    ├── agc.ts                      # AGC 컨트롤러 (mutable params)
    ├── offscreen/
    │   ├── offscreen.html
    │   └── offscreen.ts            # 오프스크린: 그래프 라이프사이클
    └── popup/
        ├── popup.html
        ├── popup.css
        └── popup.ts                # 팝업: 토글·슬라이더·미터 폴링
```

## 알려진 한계

- **풀 네비게이션 자동 복구 불가**: F5 등으로 페이지가 완전히 다시 로드되면 user activation이 만료되어 자동으로 캡처 재획득 불가능. 사용자가 익스텐션 아이콘을 다시 클릭해야 함 (배지 `!`로 시각화).
- **DRM 콘텐츠**: e스포츠 공식 중계 등 Widevine 적용된 스트림은 `chrome.tabCapture`가 무음 스트림을 반환. 현재는 단순 무음으로 보여 게이팅됨 (Phase 3b에서 명시적 안내 예정).
- **다중 탭 한도 4개**: 단일 오프스크린 문서 정책에 따른 것은 아니며, 실용적 CPU 부하 기준 (Phase 4c에서 사용자 설정으로 노출 예정).
- **레이턴시**: 엔드투엔드 ~20-50ms 추가됨. 립싱크 어긋남 임계치(±45ms, ITU-R BT.1359) 이내.

## 참고 자료

- [LUFS / BS.1770 표준 (ITU-R)](https://www.itu.int/rec/R-REC-BS.1770)
- [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [@crxjs/vite-plugin](https://crxjs.dev/)

## 라이선스

[MIT License](./LICENSE)
