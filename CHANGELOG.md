# Changelog

본 프로젝트의 모든 주요 변경 사항을 이 파일에 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)을 따르며,
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 사용합니다.

## [Unreleased]

### 변경됨

- **Phase 4b (1차)** — 활성 탭별 AGC 파라미터 분리. 팝업이 보는 탭이 캡처 중이면 그 탭만 조정("AGC 설정 (현재 탭)"), 비활성이면 기본값 조정 + 전체 탭 broadcast("AGC 설정 (기본값)")로 동작 분기. `SET_PARAMS`/`GET_PARAMS`에 옵셔널 `tabId` 추가
- OFF→ON 토글 시 팝업이 보유한 파라미터를 새 그래프에 강제 적용 — `saveParams` ↔ 오프스크린 `paramsLoaded` 레이스로 옛 storage 값으로 초기화되던 문제 방지

### 후보 작업

- **Phase 4b (2차)** — 완전 분리: 비활성 모드 편집의 전체 broadcast 제거, 탭별 파라미터 영속화 (현재는 마지막 편집값이 기본값으로 drift되는 소프트 분리)
- **Phase 3b** — DRM 콘텐츠 명시적 안내 (현재는 무음 게이팅으로 노출)
- **풀 네비게이션 자동 복구 가능성 재검토** — Chrome user activation 정책 변경 시 자동 재캡처 시도
- **사용자 노출 다중 탭 한도** — 현재 하드코딩 4 → `chrome.storage`에서 사용자 조정
- **프리셋 기능** — "야간 시청용", "토크 위주", "게임 위주" 등 슬라이더 묶음 저장

### 알려진 한계 (v0.1.0 시점)

- F5 새로고침 후 자동 복구 불가, 익스텐션 아이콘 재클릭 필요 (배지 `!` 노출)
- DRM 보호 콘텐츠 캡처 불가 (Widevine 등) — 무음 스트림 반환됨
- 동시 활성 4탭 한도 (CPU 부하 기준)
- 엔드투엔드 ~20-50ms 추가 레이턴시

## [0.1.0] - 2026-05-06

크롬 웹 스토어 최초 출시.

### 추가됨

- **자동 음량 정규화 (AGC)**: 목표 -15 LUFS, BS.1770/1771-2 K-weighted Momentary Loudness 기반 추적
- **DSP 체인**: Source → Limiter (DynamicsCompressorNode) → Gain (AGC) → Glue (DynamicsCompressorNode) → destination
- **K-weighting 사이드체인**: BiquadFilter (HS 1681.974Hz +4dB, HP 38.135Hz) → AudioWorklet (`loudness-processor.js`)
- **AudioWorklet**: 400ms Momentary Loudness 윈도우, 100ms 갱신 간격
- **비대칭 시정수**: Attack 0.15s · Release 3.0s — 폭음 방지와 펌핑 억제 동시 달성
- **Silence Gate**: -45 dBFS 이하 신호는 게인 동결
- **다중 탭 동시 지원**: 최대 4개 치지직 탭, LRU 자동 해제
- **팝업 UI**: ON/OFF 토글, 5개 슬라이더 (목표 음량, Silence Gate, 최대 증폭, Attack, Release), 실시간 LUFS·게인 미터 + 시각 바
- **설정 영속화**: `chrome.storage.local`로 AGC 파라미터 저장
- **배지 표시**: `ON` 녹색 (캡처 중), `!` 주황 (재클릭 필요)

### 아키텍처 결정 (요약)

- **MV3 + tabCapture + Offscreen**: SW가 Web Audio API 사용 못 하므로 오프스크린 문서에 USER_MEDIA reason으로 그래프 구성 (30s 타임아웃 회피)
- **Single source of truth**: 활성 탭 상태를 오프스크린 문서가 보유, SW·팝업은 매번 질의
- **AudioWorklet on render thread**: 메인 스레드 부하 없이 정확한 윈도잉

자세한 의사결정은 [ROADMAP.md](./ROADMAP.md) 참고.

### 외부 링크

- GitHub: https://github.com/milkywaylifeform/chzzk-audio-autoscale
- 크롬 웹 스토어 출시 폼 입력값: [docs/SUBMISSION.md](./docs/SUBMISSION.md)

[Unreleased]: https://github.com/milkywaylifeform/chzzk-audio-autoscale/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/milkywaylifeform/chzzk-audio-autoscale/releases/tag/v0.1.0
