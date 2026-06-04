# CLAUDE.md

> Claude Code 세션 시작 시 자동 로드되는 프로젝트 컨텍스트.
> 일반 사용자용 문서는 [README.md](./README.md), 설계 문서는 [ROADMAP.md](./ROADMAP.md), 변경 이력은 [CHANGELOG.md](./CHANGELOG.md) 참고.

## 프로젝트 한 줄 요약

치지직(Chzzk) 라이브 방송 음량을 BS.1770 LUFS 표준으로 실시간 평탄화하는 Chrome MV3 확장 프로그램. **v0.1.0 크롬 웹 스토어 출시 완료** (2026-05-06).

## 협업 스타일

- **언어**: 한국어로 응답·커밋 메시지 작성
- **응답 톤**: 간결하게. 표·코드블록 적극 활용 OK. 불필요한 서론·요약 생략
- **커밋 메시지**: 한국어, Conventional Commits 스타일 (`feat:`, `fix:`, `docs:`, `chore:`). **Co-Authored-By 라인 없이** 작성
- **커밋 분리**: 한 커밋 = 한 논리 단위. 여러 변경은 기능별로 쪼개서 커밋
- **destructive 명령**: 사용자 확인 없이 실행 금지 (force push, reset --hard, 파일 대량 삭제 등)

## 빌드·배포

```bash
npm install
npm run build       # dist/ 생성 (크롬에 로드)
npm run dev         # 핫 리로드 개발
npm run typecheck   # 타입 검사
npm run package     # releases/<name>-<version>.zip 생성 (웹스토어 제출용)
```

크롬 로드 시 `dist/` 디렉토리 선택 (프로젝트 루트 아님).

## 주요 파일 위치

| 영역 | 경로 |
|---|---|
| MV3 매니페스트 | `manifest.config.ts` |
| 서비스 워커 (토글·tabCapture·LRU) | `src/service-worker.ts` |
| 오프스크린 문서 (DSP 라이프사이클) | `src/offscreen/offscreen.ts` |
| DSP 그래프 팩토리 | `src/dsp.ts` |
| AGC 컨트롤러 | `src/agc.ts` |
| AudioWorklet (BS.1770 LUFS) | `public/loudness-processor.js` |
| 팝업 UI | `src/popup/popup.{html,css,ts}` |
| 메시지 타입 정의 | `src/messages.ts` |
| 영속화 | `src/storage.ts` |

## 핵심 설계 제약 (변경 시 ROADMAP 함께 갱신)

- **Single source of truth**: 활성 탭 상태는 오프스크린 문서가 보유. SW·팝업은 매번 `GET_ACTIVE_TABS` 질의 (SW 종료에도 견고)
- **USER_MEDIA reason**: 30초 무음 타임아웃 회피용 — 다른 reason으로 변경 금지
- **`audioContext.destination`** 사용: `MediaStreamAudioDestinationNode`는 mute 발생 (ROADMAP 초안에 있던 버그)
- **비대칭 시정수**: Attack < Release (현재 0.15s / 3.0s) — 사용자 검증 완료, 임의 변경 시 펌핑 재발 가능
- **Silence Gate -45 dBFS**: 더 낮추면 펌핑, 더 높이면 정상 음량까지 게이팅됨

## 다음 작업 후보 (우선순위)

1. **다중 탭 한도 사용자 노출** — 4 하드코딩 → 슬라이더
2. **프리셋 기능** — "야간 시청", "토크 위주" 등 슬라이더 묶음
3. **Phase 4b (2차)** — 완전 분리: 비활성 편집 broadcast 제거 + 탭별 영속화 (1차는 소프트 분리, 기본값 drift 존재)
4. **Phase 3b** — DRM 콘텐츠 명시적 안내

> Phase 4b 1차(활성 탭별 파라미터 분리)는 완료. 비활성 모드 편집은 여전히 전체 탭 broadcast.

자세한 후보·미완 작업은 [CHANGELOG.md](./CHANGELOG.md#unreleased).

## 외부 리소스

- **GitHub**: https://github.com/milkywaylifeform/chzzk-audio-autoscale
- **크롬 웹 스토어 출시 폼 답안**: [docs/SUBMISSION.md](./docs/SUBMISSION.md)
- **개인정보처리방침**: [docs/PRIVACY_POLICY.md](./docs/PRIVACY_POLICY.md)

## 디렉토리 컨벤션 (사용자 환경)

- 본 프로젝트는 `~/browser-extensions/sound-autoscale/`에 위치
- 같은 부모 디렉토리(`~/browser-extensions/`)에 다른 Chrome 확장 프로젝트가 추가될 수 있음
