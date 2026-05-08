# 크롬 웹 스토어 등록 폼 입력값

> 콘솔 폼에 그대로 복사·붙여넣기. 각 코드 블록의 우측 상단 복사 버튼 사용 권장.

---

## 1. 기본 정보

**이름 (Name)**
```
Chzzk Audio Auto-Scale
```

**카테고리 (Category)**
```
Tools
```

**언어 (Language)**: 한국어 / Korean

**판매자 여부**: 비판매자 (non-trader)

---

## 2. 간단 설명 (Short description, 132자 한도)

```
치지직 라이브 방송 음량을 실시간 평탄화. 폭음은 부드럽게 누르고 작은 소리는 자동 증폭. BS.1770 LUFS 표준 기반 자동 이득 제어.
```

---

## 3. 상세 설명 (Detailed description)

```
치지직(Chzzk) 라이브 스트리밍을 시청할 때 발생하는 음량 편차를 실시간으로 자동 조정해주는 확장 프로그램입니다.

방송 진행자마다 다른 마이크·인터페이스 설정 때문에 채널을 바꿀 때마다 볼륨을 직접 조절해야 했나요? 게임 효과음·비명·폭음에 깜짝 놀라거나, 속삭이듯 작은 목소리는 잘 안 들리지 않으셨나요? 본 확장 프로그램은 ITU-R BS.1770 표준의 LUFS(인지 음량) 기준으로 방송 음량을 실시간 평탄화하여 일정한 청취 환경을 만듭니다.

▶ 주요 기능

• 자동 음량 정규화 (AGC): 작은 목소리는 자연스럽게 증폭, 갑작스러운 폭음은 부드럽게 압축
• BS.1770/1771-2 LUFS 측정: K-weighting 필터로 인간 청각 민감도 반영, 400ms Momentary Loudness 기반
• 실시간 시각 미터: 현재 LUFS, 적용 게인, Silence Gate 상태를 한눈에 확인
• 5가지 슬라이더: 목표 음량, Silence Gate, 최대 증폭, Attack/Release 시정수 직접 조절
• 다중 탭 동시 지원: 최대 4개 채널을 동시에 시청해도 각각 독립적으로 처리
• 설정 영속화: 한 번 튜닝한 값은 브라우저를 재시작해도 유지

▶ 이런 분께 추천합니다

• 채널을 바꿀 때마다 볼륨을 다시 조절하기 귀찮은 분
• 갑작스러운 비명·폭발음에 깜짝 놀라기 싫은 분
• 작게 말하는 스트리머의 목소리가 잘 안 들려서 답답한 분
• 야간·심야 시청에서 일정한 음량을 원하는 분
• 여러 치지직 채널을 동시에 모니터링하는 분

▶ 어떻게 작동하나요?

크롬의 탭 캡처(tabCapture) API로 치지직 탭의 오디오를 가로채 백그라운드의 오프스크린 문서에서 실시간 처리합니다. K-weighting 필터(BS.1770)를 거쳐 Momentary Loudness를 측정한 뒤, 자동 이득 제어(AGC)가 목표 음량(기본 -15 LUFS)으로 부드럽게 추적합니다. 비대칭 attack/release 시정수로 폭음 방지와 펌핑 억제를 동시에 달성합니다.

모든 신호 처리는 사용자 브라우저 안에서만 이루어지며, 어떤 형태의 데이터도 외부 서버로 전송되지 않습니다.

▶ 사용 방법

1. 치지직 방송 페이지 접속
2. 익스텐션 아이콘 클릭 → 팝업이 열립니다
3. OFF 버튼을 눌러 ON으로 전환 → 캡처 시작
4. 슬라이더로 자기 환경에 맞게 미세 조정
5. 다음번 시청부터는 자동으로 적용

▶ 권한 안내

• tabCapture: 치지직 탭의 오디오 신호 처리에 사용
• offscreen: 백그라운드 Web Audio API 사용을 위한 숨겨진 문서 (MV3 요구사항)
• storage: 사용자 설정값을 로컬에 저장 (외부 전송 없음)
• tabs: 탭 닫힘·새로고침 감지하여 캡처 정리
• activeTab: 익스텐션 아이콘 클릭한 탭 식별
• host_permissions: chzzk.naver.com 한정 (다른 도메인에서는 동작하지 않습니다)

▶ 알려진 제한

• 페이지 새로고침 후에는 익스텐션 아이콘을 다시 클릭해야 복구됩니다 (Chrome 보안 정책상 자동 재획득 불가). 배지가 주황색 '!'로 표시됩니다.
• DRM 보호된 콘텐츠(일부 e스포츠 공식 중계 등)는 브라우저 정책상 캡처할 수 없어 동작하지 않습니다.
• 동시에 최대 4개의 치지직 탭까지 활성화 가능 (CPU 부하 고려). 5번째 탭 활성화 시 가장 오래된 탭이 자동 해제됩니다.
• 엔드투엔드 ~20-50ms의 추가 레이턴시 (립싱크 어긋남 임계치 ±45ms 이내).

▶ 면책 조항

본 확장 프로그램은 네이버주식회사·치지직과 무관한 비공식 도구입니다. 모든 상표권은 각 소유자에게 있습니다.

▶ 오픈소스

본 확장 프로그램은 오픈소스로 개발되었습니다.
GitHub: https://github.com/milkywaylifeform/chzzk-audio-autoscale

문의·버그 신고는 GitHub Issues로 부탁드립니다.
```

---

## 4. 단일 목적 (Single Purpose)

```
치지직(Chzzk) 라이브 스트리밍 시청 시 발생하는 음량 편차를 실시간으로 자동 평탄화(LUFS 정규화)하여 일정한 청취 환경을 제공.
```

---

## 5. 권한 정당화 (Permissions Justification)

### tabCapture
```
치지직(Chzzk) 라이브 방송 탭의 오디오 신호를 실시간으로 가로채 음량 정규화(AGC) 처리하기 위해 사용. 사용자가 익스텐션 아이콘을 클릭하여 명시적으로 활성화한 탭에서만 동작.
```

### offscreen
```
Manifest V3에서 서비스 워커가 Web Audio API를 직접 사용할 수 없어, 오프스크린 문서에서 AudioContext와 AudioWorklet을 실행하여 오디오 처리 그래프를 구성. USER_MEDIA reason 사용으로 30초 무음 타임아웃 회피.
```

### storage
```
사용자가 팝업 UI 슬라이더로 조정한 AGC 파라미터(목표 음량, Silence Gate 등)를 chrome.storage.local에 저장하여 브라우저 재시작 후에도 설정 유지. 외부 동기화·전송 없음.
```

### tabs
```
사용자가 활성 캡처 중인 탭을 닫거나 페이지를 새로고침할 때 chrome.tabs.onRemoved/onUpdated 이벤트로 감지하여 오디오 자원을 정리하고 메모리 누수 방지. 다중 탭 LRU 한도 관리에도 사용.
```

### activeTab
```
사용자가 익스텐션 아이콘을 클릭한 시점에 현재 탭의 ID를 받아 tabCapture API에 전달. 사용자 제스처 컨텍스트 내에서만 사용.
```

### Host permission `https://chzzk.naver.com/*`
```
본 확장 프로그램은 치지직 플랫폼 전용으로 설계되어, 다른 도메인에서는 동작할 필요가 없음. 광범위한 권한 요청을 회피하기 위해 chzzk.naver.com 도메인에 한정.
```

---

## 6. 개인정보처리방침 URL

```
https://github.com/milkywaylifeform/chzzk-audio-autoscale/blob/main/docs/PRIVACY_POLICY.md
```

---

## 7. 데이터 사용 공시 (Privacy Practices)

모든 항목 **아니오 / 수집 안 함** 으로 답변:

- 개인 식별 정보 (PII): 아니오
- 인증 정보: 아니오
- 결제 정보: 아니오
- 위치: 아니오
- 웹 활동 / 사용자 활동 추적: 아니오
- 사용자 데이터를 외부와 공유: 아니오
- 데이터를 수익 목적으로 사용: 아니오

체크박스: **"본 확장 프로그램은 사용자 데이터를 수집·전송하지 않습니다"** 류의 항목이 있으면 체크.

---

## 8. 업로드 파일

**ZIP 패키지**
```
releases/chzzk-audio-autoscale-0.1.0.zip
```

**스크린샷 (업로드 순서대로)**
1. `docs/screenshots/main.png` (1280×800)
2. `docs/screenshots/popup.png` (1280×800)
3. `docs/screenshots/detail.png` (1280×800)

---

## 9. 부가 정보

| 필드 | 값 |
|---|---|
| 공식 URL (Official URL) | https://github.com/milkywaylifeform/chzzk-audio-autoscale |
| 지원 URL (Support URL) | https://github.com/milkywaylifeform/chzzk-audio-autoscale/issues |
| 수익 모델 | 없음 (무료) |
| 인앱 결제 | 없음 |
| 광고 표시 | 없음 |
| 원격 코드 사용 | 없음 (모든 코드 정적 패키지) |
