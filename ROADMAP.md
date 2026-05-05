# 매니페스트 V3 기반 치지직 오디오 오토 스케일링 확장 프로그램 아키텍처 및 예외 처리 통합 로드맵

## 1. 라이브 스트리밍 환경의 음향적 특성과 오토 스케일링의 필요성

최근 사용자 제작 콘텐츠(UGC) 기반의 라이브 스트리밍 플랫폼이 급격히 성장함에 따라, 시청자에게 일관된 오디오 경험을 제공하는 것이 플랫폼의 핵심적인 기술적 과제로 대두되었다. 네이버의 스트리밍 플랫폼인 치지직(Chzzk)과 같은 환경에서는 방송 진행자가 각기 다른 오디오 인터페이스, 마이크로폰, 그리고 소프트웨어 설정(OBS, XSplit 등)을 사용하기 때문에 방송 채널 간의 음량 편차가 극심하게 발생한다. 더욱이 단일 방송 내에서도 게임 플레이 중 발생하는 갑작스러운 고음(예: 폭발음, 진행자의 비명)이나 장시간 이어지는 저음량의 속삭임 등 동적 범위(Dynamic Range)가 매우 넓게 나타난다. 이러한 음향적 불안정성은 시청자의 청각적 피로도를 급격히 상승시키며, 시청자가 수동으로 볼륨을 지속적으로 조절해야 하는 불편함을 초래한다. 따라서 클라이언트 단에서 실시간으로 오디오 신호를 가로채어 동적 범위를 압축하고 목표 음량으로 정규화(Normalization)하는 자동 이득 제어(Automatic Gain Control, AGC) 시스템의 도입이 필수적이다.

브라우저 확장 프로그램 형태로 이러한 실시간 오디오 스케일링 시스템을 개발하는 과정은 최신 웹 기술의 복잡한 교차점을 탐색하는 고도의 엔지니어링을 요구한다. 구글 크롬 브라우저의 확장 프로그램 플랫폼이 매니페스트 V2(MV2)에서 매니페스트 V3(MV3)로 전환됨에 따라, 백그라운드에서 오디오를 지속적으로 처리하는 아키텍처는 근본적인 변화를 맞이했다.[^1] MV3는 DOM(Document Object Model)에 접근할 수 없고 브라우저에 의해 강제로 종료될 수 있는 서비스 워커(Service Worker)를 도입함으로써, 기존의 Web Audio API 기반 처리 방식을 무력화시켰다.[^2]

본 보고서는 이러한 엄격한 MV3 환경의 제약을 극복하는 동시에, 사용자가 핵심 요구사항으로 제기한 두 가지 치명적인 예외 상황, 즉 **'방송 중간 중단(네트워크 드롭 및 버퍼링)'**과 **'화질 변경 시의 DOM 변동성'**을 완벽하게 처리할 수 있는 치지직 전용 오디오 오토 스케일링 확장 프로그램의 구체적인 아키텍처 설계와 단계별 개발 로드맵을 제시한다. 이 설계는 MV3의 오프스크린 문서(Offscreen Document) API와 크롬의 탭 캡처(Tab Capture) API, 그리고 Web Audio API의 고급 라우팅 기법을 유기적으로 결합하여 어떠한 예외 상황에서도 끊김 없는 음량 정규화 환경을 보장하는 것을 목표로 한다.

## 2. 치지직 스트리밍 기술 스택 및 DOM 환경 분석

확장 프로그램이 웹 페이지의 오디오 신호를 성공적으로 가로채고 조작하기 위해서는 대상 플랫폼이 비디오와 오디오 데이터를 클라이언트로 전송하고 렌더링하는 기본 프로토콜과 이로 인해 발생하는 DOM의 동작 방식을 심층적으로 이해해야 한다.

### 2.1. 적응형 비트레이트 스트리밍: HLS와 DASH 프로토콜

치지직 플랫폼은 전 세계적으로 가장 널리 사용되는 적응형 비트레이트 스트리밍(Adaptive Bitrate Streaming) 프로토콜인 HLS(HTTP Live Streaming)와 DASH(Dynamic Adaptive Streaming over HTTP)를 혼용하여 미디어를 전송한다.[^4] 이 두 프로토콜은 단일한 거대 미디어 파일을 전송하는 대신, 지속적으로 이어지는 라이브 스트림을 수 초 단위의 작은 HTTP 세그먼트(예: `.ts`, `.m4s`)로 분할하여 클라이언트에 제공한다.[^5]

클라이언트의 브라우저는 매니페스트 파일(HLS의 경우 `.m3u8`, DASH의 경우 `.mpd`)을 지속적으로 읽어 들여 다음에 다운로드할 세그먼트의 위치와 해상도 정보를 파악한다.[^6] 시청자의 네트워크 대역폭이나 하드웨어 디코딩 성능이 변동할 경우, 플레이어는 매니페스트에 명시된 다른 화질의 세그먼트로 자연스럽게 전환하여 재생을 유지한다. 브라우저 환경에서 이러한 스트리밍은 미디어 소스 확장(Media Source Extensions, MSE) API를 통해 구현되며, 분할된 세그먼트 데이터는 HTML5 `<video>` 태그의 `SourceBuffer` 객체로 직접 주입된다.[^4] 이처럼 데이터가 지속적으로 청크(Chunk) 단위로 주입되고 교체되는 구조는 미디어 파이프라인의 극심한 변동성을 의미하며, 이는 후술할 화질 변경 시의 예외 처리와 직결된다.

### 2.2. 스트리밍 플레이어의 DOM 구조 및 식별

오토 스케일링 확장 프로그램이 작동하기 위해서는 우선 오디오를 발생시키는 근원지인 DOM 요소를 식별해야 한다. 웹 기반 비디오 플레이어는 일반적으로 커스텀 컨트롤러와 이벤트 리스너를 바인딩하기 위해 복잡한 컨테이너 구조 안에 HTML5 `<video>` 요소를 배치한다. 개발자는 CSS 선택자나 요소의 ID, 클래스명을 통해 해당 비디오 요소를 쿼리해야 한다.[^9]

웹 상의 다양한 비디오 플레이어들은 `.video-player`, `.vjs-tech` (Video.js 기반), 또는 특정 플랫폼 전용 커스텀 태그를 사용한다.[^9] 치지직 웹 플레이어의 경우에도 고유의 클래스 구조와 DOM 트리를 형성하고 있으며, 방송 데이터와 상호작용하는 복잡한 중첩 구조를 가진다.[^15] 초기의 단순한 오디오 스케일러 확장 프로그램들은 보통 `document.querySelector('video')`와 같은 방식으로 요소에 직접 접근하여 Web Audio API의 `AudioContext.createMediaElementSource()` 메서드를 통해 오디오 노드를 생성한다.[^17] 그러나 이러한 직접적인 DOM 후킹 방식은 치지직과 같은 최신 스트리밍 플랫폼에서 화질 변경 이벤트가 발생할 때 치명적인 아키텍처 결함을 노출하게 된다.

## 3. 예외 처리 요구사항 1: 화질 변경 시의 DOM 변동성 및 오디오 파이프라인 복구

사용자가 1080p 해상도에서 720p 또는 480p로 화질을 수동 변경하거나, 네트워크 상태 악화로 인해 DASH/HLS 플레이어가 자동(Auto)으로 해상도를 낮출 때 발생하는 기술적 변동성은 오디오 처리 시스템에 심각한 예외 상황을 초래한다.

### 3.1. `<video>` 요소의 파괴 및 재생성 매커니즘

HTML5 비디오 요소의 소스를 변경하는 가장 단순한 방법은 `src` 속성을 직접 수정하거나 하위의 `<source>` 태그를 교체하는 것이다.[^19] 그러나 hls.js나 dash.js와 같은 라이브러리를 기반으로 구축된 고도화된 웹 플레이어 환경에서는, 기존 소스의 버퍼가 남아있는 상태에서 새로운 화질의 스트림을 주입할 경우 병렬 다운로드 충돌이나 재생 동기화 오류가 발생할 수 있다.[^20]

이러한 문제를 방지하기 위해 많은 스트리밍 플레이어는 화질 변경 이벤트가 트리거되면 기존의 `<video>` 요소 자체를 DOM 트리에서 완전히 제거(Remove)하고, 완전히 새로운 `<video>` 요소를 생성하여 DOM에 주입하는 방식을 채택한다.[^20] 기존의 비디오 요소는 메모리 해제(Garbage Collection)를 기다리는 분리된(Detached) 상태가 되며, 새로운 미디어 소스 객체가 새 비디오 요소에 바인딩된다.[^20]

### 3.2. 직접적인 DOM 후킹의 붕괴

만약 확장 프로그램이 앞서 언급한 `AudioContext.createMediaElementSource(videoElement)`를 사용하여 특정 `<video>` 요소의 오디오를 가로채고 있었다면, 플레이어가 이 요소를 파괴하는 순간 확장 프로그램의 오디오 라우팅 그래프는 즉각적으로 단절된다.[^21]

새롭게 생성된 비디오 요소는 확장 프로그램의 Web Audio API 그래프를 거치지 않고 브라우저의 기본 오디오 출력 장치로 직접 연결된다. 결과적으로 화질을 변경하는 순간 오토 스케일링 기능이 완전히 풀려버리며, 원본의 시끄럽고 압축되지 않은 오디오가 갑작스럽게 출력되어 시청자에게 극심한 불편을 초래하거나 최악의 경우 오디오가 아예 들리지 않는 버그가 발생한다.[^20] 이를 방지하기 위해 `MutationObserver`를 사용하여 DOM 트리의 변화를 감지하고 새로운 비디오 요소가 추가될 때마다 Web Audio API 그래프를 재연결하는 우회 방법이 존재하지만, 재연결 과정에서 필연적으로 발생하는 오디오 끊김(Click/Pop 소음)과 상태 불일치 문제는 사용자 경험을 크게 저해한다.

### 3.3. 크롬 탭 캡처(Tab Capture) API를 통한 근본적 해결

화질 변경에 따른 DOM 변동성 예외를 아키텍처 수준에서 근본적으로 해결하기 위해서는, 오디오 캡처 계층을 HTML `<video>` 요소로부터 완전히 분리해야 한다. 본 설계에서는 크롬 확장 프로그램 전용 API인 `chrome.tabCapture`를 핵심 캡처 메커니즘으로 채택한다.[^22]

`chrome.tabCapture` API는 특정 DOM 요소가 아닌 브라우저의 렌더링 '탭(Tab)' 전체에서 발생하는 오디오를 운영체제 수준에서 믹싱되기 전에 가로챈다.[^24] 확장 프로그램의 서비스 워커에서 사용자의 활성화 액션(예: 확장 프로그램 아이콘 클릭)을 감지하면, `chrome.tabCapture.getMediaStreamId()`를 호출하여 현재 활성화된 탭의 고유한 미디어 스트림 ID를 획득한다.[^22]

이 스트림 ID를 후술할 오프스크린 문서로 전달하여 `navigator.mediaDevices.getUserMedia()`를 통해 오디오 스트림으로 변환하면, 치지직 웹 플레이어가 내부적으로 `<video>` 요소를 몇 번을 파괴하고 재생성하든(SPA 내부 라우팅 포함) 상관없이 안정적인 오디오 파이프라인이 유지된다.[^22] DOM의 생명 주기와 오디오 캡처의 생명 주기가 분리되므로, 동일 탭 내의 화질 변경 시 오토 스케일링이 끊기지 않는다.

> **⚠️ 주의 1 — 원본 탭 오디오 음소거**: `chrome.tabCapture`로 스트림을 가져가는 순간 원본 탭의 오디오는 자동으로 음소거 상태가 된다. 따라서 오프스크린 문서에서 처리된 오디오를 **반드시 다시 재생**해야 시청자에게 들린다(자세한 라우팅은 6.1 참조).
>
> **⚠️ 주의 2 — 페이지 네비게이션 한계**: `tabCapture.getMediaStreamId()`는 사용자 제스처(user activation)를 요구하므로, 사용자가 F5로 새로고침하거나 브라우저 풀 네비게이션이 발생하면 캡처가 끊기고 자동 재획득이 불가능하다. 이 경우 **사용자가 익스텐션 아이콘을 다시 클릭**해야만 복구된다. 7.2의 탭 생명주기 핸들링과 함께 UI 차원에서 재개입을 유도하는 배지/토스트가 필요하다.

## 4. 매니페스트 V3 환경의 제약과 오프스크린 문서(Offscreen Document) 아키텍처

오토 스케일링을 위한 Web Audio API 노드 그래프를 지속적으로 실행해야 하는 요구사항은 최신 크롬 확장 프로그램 표준인 매니페스트 V3(MV3)의 철학과 정면으로 충돌한다. 이를 우회하고 안정적인 백그라운드 오디오 처리를 구현하는 것이 본 아키텍처의 핵심 난제이다.

### 4.1. 서비스 워커의 한계와 DOM 접근 불가

과거 매니페스트 V2(MV2) 시절에는 확장 프로그램이 보이지 않는 '백그라운드 페이지(Background Page)'를 생성할 수 있었다. 이 페이지는 완전한 DOM과 Window 컨텍스트를 가지고 있었으므로, 개발자는 이곳에 `AudioContext`를 열고 브라우저가 닫힐 때까지 무한히 오디오를 처리할 수 있었다.[^2]

그러나 MV3는 리소스 점유와 보안 문제를 해결하기 위해 백그라운드 페이지를 전면 폐지하고 이벤트 기반의 '서비스 워커(Service Worker)'를 도입했다.[^1] 서비스 워커는 DOM에 접근할 수 없으며, Web Audio API(`AudioContext`, `GainNode`, `DynamicsCompressorNode` 등) 역시 Window 객체에 종속되어 있으므로 서비스 워커 내에서는 인스턴스화조차 불가능하다.[^3] 더욱 치명적인 것은, 서비스 워커는 브라우저가 유휴 상태로 판단하면 언제든지 강제로 스레드를 종료시켜버린다는 점이다.[^26]

### 4.2. 오프스크린 문서(Offscreen Document)의 도입

MV3 환경에서 오디오 처리와 같은 DOM 의속적인 백그라운드 작업을 지원하기 위해 크롬 플랫폼은 '오프스크린 문서(Offscreen Document)' API를 도입했다.[^2] 오프스크린 문서는 시각적으로 렌더링되지 않지만 완전한 DOM과 Window 컨텍스트를 갖춘 숨겨진 HTML 문서이다.[^3]

본 설계에서 서비스 워커의 역할은 오디오를 직접 처리하는 것이 아니라, 사용자가 오토 스케일링 기능을 켤 때 `chrome.offscreen.createDocument()` 메서드를 호출하여 백그라운드에 숨겨진 `audio_processor.html` 문서를 생성하는 오케스트레이터(Orchestrator)로 한정된다.[^28] 모든 무거운 디지털 신호 처리(DSP) 및 Web Audio API 그래프 연결은 이 오프스크린 문서 내부에서 실행된다.[^26]

### 4.3. 생명 주기 및 메시지 패싱 구조

오프스크린 문서는 크롬 익스텐션의 다른 컨텍스트와 철저히 분리되어 동작하므로, 오토 스케일링 시스템의 각 컴포넌트는 `chrome.runtime.sendMessage`를 활용한 비동기 메시지 패싱을 통해 통신해야 한다.[^2]

| 컴포넌트 | 실행 컨텍스트 | 주요 역할 및 데이터 흐름 |
| --- | --- | --- |
| **Popup UI** | 팝업 창 (`popup.html`) | 사용자가 스케일링 강도(Threshold, Ratio) 및 목표 볼륨(LUFS)을 조절. 설정 변경 시 서비스 워커를 경유하여 오프스크린 문서로 파라미터 업데이트 메시지 발송. |
| **Service Worker** | 백그라운드 스레드 | 확장 프로그램 아이콘 클릭 감지. 탭 캡처 API로 `streamId` 생성. 오프스크린 문서가 존재하지 않으면 생성(`createDocument`). `streamId`를 오프스크린 문서로 전달.[^22] |
| **Offscreen Document** | 숨겨진 DOM (`offscreen.html`) | `getUserMedia`로 스트림 수신.[^22] Web Audio API 그래프 구성. 실시간 LUFS 분석 및 AGC 적용. 처리된 오디오를 시스템 스피커로 출력.[^22] |
| **Content Script** | 치지직 웹 페이지 | (선택적) 플레이어 상태를 모니터링하여 방송 중단(버퍼링) 시 팝업 UI의 시각적 피드백을 위한 상태 메시지 발송.[^17] 오디오 캡처에는 관여하지 않음. |

이러한 철저한 모듈식 아키텍처는 MV3의 보안 정책을 완벽히 준수하면서도, 메인 스레드의 성능 저하 없이 독립적인 백그라운드 오디오 렌더링을 보장한다.

## 5. 예외 처리 요구사항 2: 방송 중간 중단에 따른 오디오 무음 상태 및 생명 주기 보존

사용자가 요구한 두 번째 핵심 예외 상황은 라이브 스트리밍의 태생적 불안정성으로 인해 발생하는 '방송 중간 중단' 현상이다. 스트리머의 송출 소프트웨어(OBS 등) 오류, 치지직 인제스트 서버의 문제, 또는 시청자의 일시적인 네트워크 드롭으로 인해 방송이 멈추고 버퍼링 화면이 표시되는 경우, 오디오 신호는 즉각적으로 디지털 무음(Digital Silence) 상태가 된다. 이 예외 상황은 오토 스케일링 확장 프로그램에 두 가지 치명적인 붕괴 위험을 초래한다.

### 5.1. 오프스크린 문서의 30초 무음 타임아웃(Silence Timeout) 함정

크롬 브라우저는 오프스크린 문서가 시스템 자원을 영구적으로 점유하는 것을 막기 위해 문서를 생성할 때 반드시 `reasons` 파라미터를 통해 생성 목적을 명시하도록 강제한다.[^26] 일반적으로 오디오를 재생하기 위해 `AUDIO_PLAYBACK`이라는 이유를 사용한다.[^30]

그러나 크롬 엔진의 엄격한 생명 주기 정책에 따르면, `AUDIO_PLAYBACK` 목적으로 생성된 오프스크린 문서는 생성 후 30초 동안 오디오를 재생하지 않거나, 오디오를 재생하다가 30초 이상 무음 상태가 지속되면 브라우저에 의해 강제로 문서를 종료(Close)시켜 버린다.[^2]

라이브 스트리밍 중 네트워크 드롭으로 인한 버퍼링 대기 시간이나 스트리머가 방송을 잠시 멈춘 휴식 시간은 30초를 쉽게 초과한다. 만약 확장 프로그램이 `AUDIO_PLAYBACK`을 사용했다면, 방송이 중단된 지 30초가 지나는 순간 브라우저가 오프스크린 문서를 죽여버리게 되며, 이후 스트리머가 방송을 재개해도 확장 프로그램은 이미 붕괴된 상태이므로 오디오가 영원히 들리지 않게 된다.[^2]

### 5.2. `USER_MEDIA` 이유(Reason)를 통한 타임아웃 우회 설계

이러한 치명적인 생명 주기 붕괴 예외를 처리하기 위해, 본 아키텍처는 오프스크린 문서를 생성할 때 `AUDIO_PLAYBACK` 대신 `USER_MEDIA` 이유를 사용하도록 설계된다.[^22]

`USER_MEDIA`는 `getUserMedia()`나 마이크, 웹캠 등 사용자의 미디어 스트림을 처리하기 위한 목적으로 승인된 파라미터이다.[^30] 브라우저 엔진은 `USER_MEDIA`로 생성된 오프스크린 문서에 대해서는 30초 무음 타임아웃 규칙을 적용하지 않으며, 개발자가 명시적으로 `closeDocument()`를 호출하기 전까지 문서를 백그라운드에 안전하게 보존한다.[^22] 앞서 3장에서 탭 캡처 오디오를 오프스크린 내부의 `getUserMedia`를 통해 수신하도록 설계했기 때문에, `USER_MEDIA`의 사용은 기술적으로 정당화되며 크롬 웹스토어 심사 정책에도 부합한다.[^22]

이 우회 설계를 통해 치지직 방송이 10분 이상 버퍼링에 걸려 완전히 무음 상태가 되더라도, 확장 프로그램의 Web Audio API 그래프는 죽지 않고 인내심 있게 대기하다가 방송이 재개되는 즉시 오토 스케일링을 다시 수행할 수 있다.

### 5.3. 무음 상태에서의 무한 증폭 방지: 실렌스 게이트(Silence Gate) 메커니즘

방송 중단으로 인한 무음 상태는 오프스크린 문서의 생존 문제뿐만 아니라, 오토 스케일링 알고리즘 자체에도 수학적 오류를 유발한다. AGC 알고리즘은 오디오 신호의 데시벨(dB)을 측정하여 목표 음량보다 작으면 볼륨을 강제로 끌어올린다.[^32]

만약 방송이 끊겨 오디오 신호 에너지가 완벽한 0(디지털 무음)이 되면, 로그 스케일로 변환된 데시벨은 -∞(마이너스 무한대)에 수렴한다. 이 상태에서 AGC 알고리즘은 목표 음량에 도달하기 위해 내부 이득(Gain) 증폭기를 최대치(예: +60dB 이상)로 끌어올린 상태로 고정된다.[^33] 이후 방송이 갑자기 재개되는 순간, 압도적으로 증폭된 비정상적인 폭음이 출력되어 시청자의 청각을 심각하게 손상시키거나 스피커 하드웨어에 무리를 줄 수 있다.[^35]

이 예외 상황을 방지하기 위해 DSP 로직 내부에는 **'실렌스 게이트(Silence Gate)'** 또는 **'프리즈 홀드(Freeze Hold)'** 메커니즘이 반드시 구현되어야 한다:[^36]

1. 오디오 신호의 RMS(Root Mean Square) 에너지를 지속적으로 모니터링한다.
2. 입력 신호가 특정 노이즈 플로어 임계값(예: -60 dBFS) 이하로 떨어지면, 방송이 중단되거나 완벽한 침묵 상태라고 판단하여 AGC 알고리즘의 작동을 즉각 정지(Bypass)시킨다.
3. 이때 `GainNode`의 증폭 값은 무한대로 발산하지 않고, 마지막으로 유효했던 정상적인 증폭 상태로 고정(Freeze)된다.
4. 방송이 재개되어 신호가 -60 dBFS를 다시 초과하면, 약 50ms의 아주 짧은 유예 시간(Attack Delay)을 둔 후 AGC 추적을 재개하여 매끄럽게 오디오 스케일링을 복원한다.[^33]

## 6. Web Audio API 기반 디지털 신호 처리(DSP) 및 오토 스케일링 알고리즘 구현

안정적인 캡처 환경과 생명 주기 관리가 확보된 오프스크린 문서 내부에서는, 본격적으로 오디오의 동적 범위를 조절하고 음량을 정규화하는 Web Audio API 노드 그래프가 구축된다.[^27]

### 6.1. 오디오 라우팅 토폴로지 (Audio Routing Topology)

치지직 오디오를 처리하기 위한 DSP 체인은 다음과 같은 순서로 직렬 연결(Cascade)된다:

1. **`MediaStreamAudioSourceNode`**: 탭 캡처를 통해 획득한 치지직 방송의 원본 오디오 스트림(`getUserMedia` 결과)을 Web Audio API의 컨텍스트 안으로 가져온다.[^22]
2. **`DynamicsCompressorNode` (Peak Limiter)**: 순간적으로 발생하는 극단적인 고음(피크 타격음)을 1차적으로 억제하여 클리핑(Clipping, 소리 깨짐)을 방지하는 역할을 한다.[^32]
3. **`AnalyserNode`** (사이드체인 분기): 현재 신호의 배열 데이터를 실시간으로 추출하여 Momentary Loudness(400ms 윈도)를 계산할 수 있게 해준다. 직접 경로에는 영향을 주지 않고 `GainNode`로 제어 신호만 전달한다.[^31]
4. **`GainNode` (AGC Amplifier)**: 3번에서 계산된 결과에 따라 소프트웨어적으로 볼륨을 올리거나 내리는 핵심 증폭기 역할을 수행한다.[^27]
5. **`DynamicsCompressorNode` (Glue Compressor)**: `GainNode`의 급격한 볼륨 변화로 인해 발생할 수 있는 이질감을 부드럽게 다듬고 압축하는 2차 컴프레서이다.[^33]
6. **`audioContext.destination`**: 최종적으로 정규화된 오디오를 오프스크린 문서의 기본 오디오 출력 장치(시청자의 하드웨어 스피커)로 송출한다. 3장에서 언급한 대로 `tabCapture`가 원본 탭을 음소거시키므로, 여기서 직접 재생해야 청취가 가능하다.

> **참고**: `MediaStreamAudioDestinationNode`는 `MediaStream` 객체를 만드는 노드일 뿐 스피커로 직접 출력되지 않는다. 본 설계에서는 사용하지 않는다. 다른 익스텐션이나 라우팅 목적이 필요해질 경우, 위 노드의 `.stream`을 별도 `<audio>` 엘리먼트의 `srcObject`에 바인딩하고 `play()`해야 한다.

### 6.2. 동적 범위 압축(Dynamic Range Compression) 파라미터 튜닝

`DynamicsCompressorNode`는 라이브 스트리밍의 특성(게임 소리와 사람의 목소리가 섞인 복합 오디오)에 맞게 정밀하게 튜닝되어야 한다.[^32]

| 파라미터 (Parameter) | Peak Limiter (1차) | Glue Compressor (2차) | 비고 |
| --- | --- | --- | --- |
| **Threshold** | -8 dB | -18 dB | Limiter는 클리핑 직전 피크만 억제, Glue는 AGC 후 평균 음량을 다듬는 용도로 더 낮게.[^32] |
| **Ratio** | 12:1 (limiter 동작) | 3:1 | Limiter는 강하게 잡아 폭음 방지, Glue는 자연스러운 다이나믹 유지. |
| **Attack** | 0.002 초 (2ms) | 0.020 초 (20ms) | Limiter는 즉각 반응, Glue는 트랜지언트를 살리기 위해 약간 느리게.[^32] |
| **Release** | 0.050 초 (50ms) | 0.150 초 (150ms) | 펌핑(Pumping) 현상 방지를 위해 Glue는 길게 유지.[^32] |
| **Knee** | 6 dB | 12 dB | Limiter는 명확한 임계, Glue는 부드러운 압축으로 시청자가 인지 못하게.[^32] |

> **튜닝 노트**: 초기 설계안의 Threshold -24dB / Knee 30dB 조합은 일반 대화 음량까지 대부분 압축 영역에 포함시키는 결과를 낳아 의도(피크 한정 타겟팅)와 어긋났다. 위 값은 BS.1770 모니터링용 Limiter 설정과 일반적인 마스터링 Glue Bus 컴프레서 가이드를 참고해 재조정한 것이며, Phase 4의 사용자 슬라이더로 미세 조정 가능하도록 노출한다.

### 6.3. Momentary Loudness 기반 자동 이득 제어(AGC) 매커니즘

단순한 컴프레서 노드는 큰 소리를 줄여줄 뿐, 속삭이듯 작게 말하는 스트리머의 목소리를 시청하기 편안한 수준으로 자동으로 끌어올려주지는 못한다. 이를 위해서는 목표 음량(Target Loudness)을 설정하고 이를 추적하는 수학적 알고리즘이 `GainNode`를 제어해야 한다.[^32]

최근 방송 음향 표준에서는 단순한 피크 레벨이나 RMS 대신, 인간의 청각 인지 특성을 반영한 **LUFS (Loudness Units relative to Full Scale, ITU-R BS.1770)**를 기준으로 삼는다.[^39] 구글 어시스턴트나 스포티파이, 유튜브와 같은 대형 플랫폼들은 스테레오 환경에서 평균적으로 -14 LUFS에서 -16 LUFS 사이를 목표 음량으로 채택하여 플랫폼 간의 볼륨 편차를 줄이고 있다.[^39]

> **측정 방식 명시**: BS.1770의 적분 LUFS(Integrated)는 -70 LUFS 절대 게이팅과 -10 LU 상대 게이팅을 적용한 누적 평균치로, 본질적으로 **콘텐츠 단위(곡, 에피소드)의 사후 측정용**이다. 실시간 AGC에는 부적합하므로, 본 설계는 BS.1771-2의 **Momentary Loudness (M, 400ms 슬라이딩 윈도)** 를 사용한다. 단위는 LUFS와 동일하나 게이팅이 적용되지 않은 즉시 측정값이라는 점에 주의한다.

DSP 처리는 **`AudioWorklet`** 으로 구현한다. `requestAnimationFrame`은 오프스크린 문서가 렌더링되지 않는 숨겨진 페이지이므로 브라우저 정책에 따라 throttle될 수 있고, `setInterval`은 메인 스레드 부하에 영향받는다. AudioWorklet은 오디오 렌더링 스레드에서 128 샘플(약 2.67ms @ 48kHz) 단위로 안정적으로 호출된다.[^13]

루프는 다음과 같은 연산을 수행한다:

1. AudioWorklet 내부에서 입력 버퍼를 누적하여 400ms 윈도(48kHz 기준 19,200 샘플)를 유지한다.[^31]
2. 윈도 데이터에 **K-weighting 필터**를 적용한다 (BS.1770 사양):
   - 1단: High-shelf, `fc = 1681.974450955533 Hz`, `gain = +3.999843853973347 dB`
   - 2단: High-pass (Butterworth 2차), `fc = 38.13547087602444 Hz`
   - Web Audio의 `BiquadFilterNode` 또는 AudioWorklet 내부의 직접 IIR 구현으로 처리한다.
3. 필터링된 신호의 평균 제곱(Mean Square)을 구한 뒤 `LUFS = -0.691 + 10·log10(MS)` 공식으로 현재 Momentary Loudness를 도출한다.[^39]
4. 측정값과 목표값(예: -15 LUFS) 간 델타(Δ)를 계산한다. -25 LUFS 측정 시 +10dB 증폭이 필요.[^32]
5. 데시벨 차이를 선형 배율(`10^(Δ/20)`)로 변환하여 `GainNode.gain`에 적용한다.[^35] 갑작스러운 볼륨 변화로 인한 zipper noise 방지를 위해 `setTargetAtTime(value, currentTime, timeConstant)`를 사용하며, **timeConstant는 0.15초(150ms)** 를 기본값으로 한다(너무 짧으면 펌핑, 너무 길면 AGC 응답성 저하).[^38]
6. 게인 변화량은 ±18dB로 클램핑하여 비현실적 증폭을 방지한다.

## 7. 성능 최적화, 메모리 관리 및 DRM 예외 상황

브라우저 내에서 초당 48,000번의 샘플링 속도로 오디오 데이터를 실시간 수학 연산하는 작업은 자칫하면 심각한 CPU 과부하와 배터리 소모를 유발할 수 있다. 또한 백그라운드 환경 특성상 메모리 누수(Memory Leak)에 취약하다.

### 7.1. 레이턴시(지연 시간) 최소화 전략

복잡한 FFT(Fast Fourier Transform) 기반의 무거운 플러그인을 자바스크립트 기반으로 자체 구현하여 메인 스레드에서 사용하면 오디오 신호 처리 과정에서 50ms 이상의 추가 레이턴시가 발생할 수 있다.[^31] 이는 치지직 라이브 스트리밍 시청 시 스트리머의 입모양과 목소리가 맞지 않는 립싱크(Lip-sync) 어긋남 현상을 유발한다.

이를 방지하기 위해, 오디오가 렌더링되어 스피커로 나가는 직접적인 경로(Direct Path)는 모두 크롬 브라우저 하단에서 최적화된 C++ 코드로 동작하는 네이티브 Web Audio API 노드(`DynamicsCompressorNode`, `GainNode`)만으로 구성되어야 한다.[^31] 무거운 Momentary Loudness 계산과 AGC 파라미터 조절 로직은 별도의 사이드체인(Side-chain)으로 분기시키고, AudioWorklet 내부에서 비동기적으로 `GainNode`에 제어 신호만 보내도록 분리한다.

> **현실적 레이턴시 목표**: 엔드투엔드 추가 레이턴시 **50ms 미만**을 목표로 한다. Web Audio 렌더 쿼텀(128 샘플 ≈ 2.67ms @ 48kHz), `tabCapture` 내부 버퍼링, OS 오디오 출력 버퍼(Windows shared mode 기준 10~30ms) 등 통제 불가능한 누적 지연이 존재하므로, 5ms 미만은 플랫폼 사양상 비현실적이다. 50ms는 인간이 영상-음성 동기 어긋남을 거의 인지하지 못하는 임계치(약 ±45ms, ITU-R BT.1359)에 부합한다.

### 7.2. 탭 종료 시의 메모리 누수 및 좀비 스트림 방지

가장 흔하게 발생하는 크롬 확장 프로그램의 버그 중 하나는, 사용자가 방송 탭을 닫았음에도 불구하고 오프스크린 문서가 백그라운드에서 죽지 않고 '좀비' 상태로 남아 마이크 권한이나 오디오 하드웨어를 점유하는 현상이다.[^2]

서비스 워커는 치지직 탭의 생명 주기를 엄격하게 감시해야 한다. `chrome.tabs.onRemoved` 및 `chrome.tabs.onUpdated` 이벤트 리스너를 등록하여, 사용자가 치지직 방송 창을 닫거나 다른 사이트로 이동하는 순간 오디오 캡처 파이프라인을 즉각 해체해야 한다.[^43] 서비스 워커는 오프스크린 문서로 "정지" 메시지를 보내고, 오프스크린 문서는 내부적으로 `audioContext.close()`를 호출하여 자원을 반환하며, 활성화된 모든 `MediaStreamTrack`에 대해 `.stop()` 메서드를 실행해야 한다.[^23] 이 해제 작업이 누락되면 브라우저 탭 상단에 빨간색 '녹음 중' 아이콘이 사라지지 않아 사용자에게 심각한 프라이버시 불안감을 유발하게 된다.[^22]

### 7.3. DRM(Digital Rights Management) 콘텐츠 예외 처리

치지직 플랫폼은 e스포츠 공식 중계나 저작권이 있는 애니메이션, 영화 등을 스트리밍할 때 Widevine과 같은 DRM 기술을 적용하기도 한다.[^5] 브라우저의 보안 정책상, DRM으로 암호화된 미디어 스트림은 확장 프로그램의 `chrome.tabCapture` API가 가로채거나 복호화된 오디오 버퍼에 접근하는 것을 원천적으로 차단한다.[^6]

이러한 예외 상황이 발생할 경우 `tabCapture.getMediaStreamId()`가 실패하거나, 빈 오디오 스트림(완전한 묵음)이 반환된다.[^23] 다만 **빈 스트림과 진짜 무음(방송 휴식·버퍼링)을 신호 레벨만으로 구별하는 것은 불가능**하므로, 다음 다중 휴리스틱으로 DRM을 추정한다:

1. Content Script에서 `videoElement.played` 진행 중 + `videoElement.muted === false` + `videoElement.volume > 0` 상태를 보고
2. 동시에 오프스크린 측 캡처 신호가 **연속 N초(예: 10초) 이상 -70 dBFS 미만**으로 유지되고
3. `videoElement.mediaKeys`가 존재하거나 `MediaSource`의 `sourceBuffers[].changeType` 호출 흔적이 있으면

위 조건을 만족하면 DRM으로 판정하고, 시스템은 오류를 삼키고 침묵하는 대신 팝업 UI를 통해 **"현재 방송은 저작권 보호(DRM) 기술이 적용되어 오디오 스케일링 기능을 지원할 수 없습니다."**라는 명확한 시각적 예외 메시지를 표시하여 사용자의 혼란을 방지해야 한다.

### 7.4. 동시 다중 탭 정책

크롬 익스텐션은 **익스텐션당 단일 오프스크린 문서**만 보유 가능하다.[^30] 사용자가 치지직 탭을 2개 이상 열고 각 탭에서 AGC를 활성화하려 할 경우 다음 정책을 적용한다:

- 동시에 단 하나의 탭만 캡처 가능. 두 번째 활성화 요청 시 첫 번째 탭의 캡처를 종료하고 새 탭으로 전환한다.
- 서비스 워커 내부에 `activeCaptureTabId` 상태를 유지하며, `chrome.tabs.onActivated` / `onRemoved` / `onUpdated` 이벤트로 동기화한다.
- 팝업 UI에서 현재 어느 탭이 활성 상태인지 명시적으로 보여주고, 사용자가 의도치 않게 다른 탭의 AGC를 끄게 되는 상황을 방지한다.

### 7.5. 사용자 경험(UX) 부작용 고지

`tabCapture` 활성화 시 발생하는 다음 동작을 사용자에게 미리 안내해야 한다:

- 탭 상단에 **빨간색 녹화 인디케이터**가 항상 표시됨 (브라우저 강제, 비활성화 불가)
- 익스텐션 아이콘 첫 클릭 시 한 번 권한 프롬프트 표시 가능
- 일부 사용자는 마이크/화면 녹화로 오해할 수 있으므로, 온보딩 화면에서 **"본 확장은 마이크나 화면을 녹화하지 않으며, 오로지 탭 내부 오디오만 처리합니다"** 문구를 명시한다.

## 8. 단계별 개발 및 통합 로드맵

위에서 설계된 복잡한 아키텍처와 예외 처리 로직을 체계적으로 구현하기 위한 4단계 마일스톤 기반 개발 로드맵을 다음과 같이 정의한다.

| 개발 단계 (Phase) | 주요 목표 및 세부 구현 과제 | Definition of Done (검증) |
| --- | --- | --- |
| **Phase 1: MV3 코어 환경 및 캡처 파이프라인 구축** | - `manifest.json` 생성, `manifest_version: 3`, `minimum_chrome_version: "116"`, V3 권한(`tabCapture`, `offscreen`, `activeTab`, `tabs`) 부여[^23]<br>- 서비스 워커 기반 확장 프로그램 생명 주기 및 아이콘 클릭 액션 라우팅 구현 (`chrome.action.onClicked`)<br>- `USER_MEDIA` 사유로 오프스크린 문서 생성 및 중복 방지 로직(`chrome.runtime.getContexts`) 구현[^30]<br>- `tabCapture.getMediaStreamId({targetTabId})`를 활용하여 탭의 오디오 스트림을 오프스크린 문서로 전달, 오프스크린에서 `getUserMedia({audio: {mandatory: {chromeMediaSource: 'tab', chromeMediaSourceId: streamId}}})` 호출[^22]<br>- 처리된 스트림을 `audioContext.destination`으로 직결하여 음성 청취 가능 상태 확보 | - 빈 오디오 그래프(소스 → 목적지 직결) 상태에서 치지직 방송이 정상 청취되는가<br>- 익스텐션 아이콘 두 번 클릭(켜기/끄기) 시 오프스크린 문서가 1개만 존재하는가 |
| **Phase 2: DSP 엔진 및 Momentary Loudness 오토 스케일링 알고리즘 탑재** | - 오프스크린 문서 내 Web Audio 노드 그래프 직렬 연결 구축 (Source → Limiter → [Analyser 사이드체인] → Gain → Glue Compressor → `audioContext.destination`)[^27]<br>- 6.2의 Limiter/Glue 파라미터 적용[^32]<br>- **AudioWorklet 기반** Momentary Loudness 계산 모듈 개발: 400ms 슬라이딩 윈도, BS.1770 K-weighting 필터(1681Hz HS +4dB / 38Hz HP) 구현[^39]<br>- `setTargetAtTime(timeConstant=0.15s)`로 부드러운 게인 추적, 게인 ±18dB 클램핑 | - BS.1770 참조 음원(EBU TECH 3341 테스트 시퀀스)으로 Momentary Loudness 측정 오차 ±0.5 LU 이내 검증<br>- 다양한 입력 음량(-30 ~ -10 LUFS)에서 목표 -15 LUFS로 5초 이내 수렴 |
| **Phase 3: 극한 예외 처리 통합 (사용자 핵심 요구사항)** | - **방송 중단 방어**: AGC 로직 내 노이즈 플로어 탐지(-60 dBFS)로 Silence Gate 구현, 무음 시 게인 동결(Freeze)[^33]<br>- **화질 변경 방어**: `tabCapture` 동일 탭 내 SPA 라우팅·MSE 세그먼트 교체에 견고함을 통합 테스트로 검증<br>- **페이지 네비게이션 방어**: `chrome.tabs.onUpdated`로 풀 네비게이션·새로고침 감지 시 캡처 종료 및 팝업 배지로 사용자 재활성화 유도(자동 재획득은 user activation 제약으로 불가)<br>- DRM 다중 휴리스틱(7.3) Content Script 모듈 개발<br>- `chrome.tabs.onRemoved` 이벤트를 캡처하여 `audioContext.close()` + `MediaStreamTrack.stop()` 강제 클린업[^43] | - 30초+ 인공 무음 신호 입력 후 정상 신호 복귀 시 폭음 없이 매끄럽게 AGC 재개<br>- 화질 변경(1080p ↔ 480p) 10회 반복 시 오디오 끊김 0회<br>- 탭 닫기 후 `chrome://media-internals`에서 좀비 스트림 0개 |
| **Phase 4: UI/UX 고도화 및 스토어 배포 준비** | - 팝업 UI(`popup.html`) 제작: 목표 음량(Target Loudness LUFS), Limiter Threshold, Glue 강도 슬라이더<br>- 서비스 워커 경유 양방향 실시간 메시지 패싱으로 UI ↔ 오프스크린 DSP 파라미터 동기화<br>- 다중 탭 정책(7.4) UI 반영: 활성 탭 표시 및 전환 시 confirm 다이얼로그<br>- UX 부작용 고지(7.5) 온보딩 화면 추가<br>- DRM 감지 시 오류 처리 UX 구현<br>- 백그라운드 리소스 점유율(CPU 프로파일링): AudioWorklet 단일 인스턴스 기준 CPU 1코어의 5% 이하 목표<br>- 최종 크롬 웹 스토어 심사 가이드라인 점검 및 배포 | - 30분 연속 방송 청취 시 메모리 누수 0 (Chrome Task Manager 모니터링)<br>- 크롬 웹 스토어 심사 통과 |

## 9. 결론

치지직 플랫폼을 위한 오디오 오토 스케일링 확장 프로그램의 개발은 단순히 볼륨을 조절하는 스크립트를 작성하는 수준을 넘어, 최신 브라우저 보안 아키텍처와 디지털 신호 처리(DSP), 그리고 라이브 미디어 프로토콜의 특성을 융합해야 하는 고도의 엔지니어링 과제이다.

매니페스트 V3 환경에서 백그라운드 오디오 처리의 권한이 대폭 축소됨에 따라, 본 설계는 오프스크린 문서(Offscreen Document)를 활용하는 우회 아키텍처를 도입하여 시스템의 기반을 확보했다.[^3] 특히 사용자가 직면하는 치명적인 예외 상황들을 해결하기 위한 전략적 선택이 돋보인다. 동일 탭 내의 화질 변경 시 발생하는 `<video>` DOM 요소의 파괴 및 재생성 문제를 회피하기 위해 `tabCapture` API를 채택함으로써, 렌더링 계층에서 오디오를 안전하게 분리해냈다.[^20] 또한, 방송 중간 중단으로 인한 30초 무음 타임아웃 강제 종료를 막기 위해 `USER_MEDIA` 이유(Reason)를 기용하고[^22], 수학적 무한 증폭 오류를 방지하는 실렌스 게이트(Silence Gate)를 AGC 로직에 이식하여 불안정한 네트워크 환경에서도 견고하게 동작하는 파이프라인을 완성했다.[^33]

다만 풀 네비게이션·새로고침 시 user activation 제약으로 자동 재획득이 불가능한 구조적 한계와, 다중 치지직 탭에서 단일 오프스크린 문서만 보유 가능한 플랫폼 제약은 UX 차원의 명시적 안내 및 정책으로 보완해야 한다(7.4, 7.5). 또한 DRM 감지는 단일 신호 레벨이 아닌 다중 휴리스틱으로만 신뢰성 있게 구별 가능하다(7.3).

본 보고서에서 제시한 심층적인 아키텍처와 4단계 로드맵, 그리고 각 단계의 정량적 검증 기준(DoD)을 충실히 따른다면, 시청자들은 치지직 스트리머의 돌발적인 고음이나 잘 들리지 않는 묵음에도 불구하고, 귀를 자극하지 않는 평탄화(Momentary Loudness 정규화)된 오디오 경험을 끊김 없이 누릴 수 있을 것이다. 이는 라이브 스트리밍 시청 편의성을 극대화하는 강력한 클라이언트 도구가 될 것이다.

## 참고 자료

[^1]: [Extensions / Manifest V3 - Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) (5월 5, 2026에 액세스)
[^2]: [Implement offscreen documents for MV3 extensions [40849649] - Chromium Issue](https://issues.chromium.org/40849649) (5월 5, 2026에 액세스)
[^3]: [Proposal: Offscreen Documents for Manifest V3 · Issue #170 · w3c/webextensions - GitHub](https://github.com/w3c/webextensions/issues/170) (5월 5, 2026에 액세스)
[^4]: [DASH Adaptive Streaming for HTML video - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API/DASH_Adaptive_Streaming) (5월 5, 2026에 액세스)
[^5]: [HLS vs. DASH | What's The Difference? - Mux](https://www.mux.com/articles/hls-vs-dash-what-s-the-difference-between-the-video-streaming-protocols) (5월 5, 2026에 액세스)
[^6]: [DASH & HLS : The two main video stream protocols - Blog Eleven Labs](https://blog.eleven-labs.com/en/video-live-dash-hls/) (5월 5, 2026에 액세스)
[^7]: [streamlink/src/streamlink/plugins/chzzk.py at master - GitHub](https://github.com/streamlink/streamlink/blob/master/src/streamlink/plugins/chzzk.py) (5월 5, 2026에 액세스)
[^8]: [HTML5 Video Tags - The Ultimate Guide [2024] - Bitmovin](https://bitmovin.com/blog/html5-video-tag-guide/) (5월 5, 2026에 액세스)
[^9]: [Video Player CSS Classes | Velo](https://dev.wix.com/docs/velo/velo-only-apis/$w/video-player/css-classes) (5월 5, 2026에 액세스)
[^10]: [Class: Component - Video.js API docs](https://docs.videojs.com/component) (5월 5, 2026에 액세스)
[^11]: [HTML/CSS Class and ID Selectors: Everything You Need to Know | Udacity](https://www.udacity.com/blog/html-css-class-and-id-selectors-everything-you-need-to-know/) (5월 5, 2026에 액세스)
[^12]: [CSS ID Selector: Syntax, Usage, and Examples - Mimo](https://mimo.org/glossary/css/id-selector) (5월 5, 2026에 액세스)
[^13]: [Class: Html5 - Video.js API docs](https://docs.videojs.com/html5) (5월 5, 2026에 액세스)
[^14]: [Capture which video id the user played from video array - Stack Overflow](https://stackoverflow.com/questions/56179025/capture-which-video-id-the-user-played-from-video-array) (5월 5, 2026에 액세스)
[^15]: [동영상 상품 태그 설정 방법 : 치지직 고객센터](https://help.naver.com/alias/navergame/chzzk69.naver) (5월 5, 2026에 액세스)
[^16]: [[CSS selector] id, class, tag 어떤 것을 사용해야 할까? - 기분따라 코딩 - 티스토리](https://cocoder16.tistory.com/19) (5월 5, 2026에 액세스)
[^17]: [Video and audio APIs - Learn web development | MDN](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Video_and_audio_APIs) (5월 5, 2026에 액세스)
[^18]: [Video player styling basics - Media - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/Video_player_styling_basics) (5월 5, 2026에 액세스)
[^19]: [Change video quality with sources pointing to different quality versions - Stack Overflow](https://stackoverflow.com/questions/38626993/change-video-quality-with-sources-pointing-to-different-quality-versions) (5월 5, 2026에 액세스)
[^20]: [How not to change the element source? - Krzysztof Krztoń](https://krzton.com/blog/how-not-to-change-the-video-element-source.html) (5월 5, 2026에 액세스)
[^21]: [HTMLMediaElement: crossOrigin property - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/crossOrigin) (5월 5, 2026에 액세스)
[^22]: [developer.chrome.com/site/en/docs/extensions/mv3/screen_capture/index.md at main - GitHub](https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/extensions/mv3/screen_capture/index.md) (5월 5, 2026에 액세스)
[^23]: [Properly using chrome.tabCapture in a manifest v3 extension - Stack Overflow](https://stackoverflow.com/questions/66217882/properly-using-chrome-tabcapture-in-a-manifest-v3-extension) (5월 5, 2026에 액세스)
[^24]: [chrome.tabCapture | API - Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) (5월 5, 2026에 액세스)
[^25]: [chrome.tabCapture | Reference - Chrome for Developers](https://developer.chrome.com/docs/extensions/mv2/reference/tabCapture) (5월 5, 2026에 액세스)
[^26]: [Offscreen Documents in Manifest V3 | Blog - Chrome for Developers](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3) (5월 5, 2026에 액세스)
[^27]: [Tone.js and the Web Audio API - DEV Community](https://dev.to/snelson723/tonejs-and-the-web-audio-api-36cj) (5월 5, 2026에 액세스)
[^28]: [Chrome Extension 101: Important Concepts Before You Create Your Extension](https://mario-gunawan.medium.com/chrome-extension-101-important-concepts-before-you-create-your-extension-030bdfa9760f) (5월 5, 2026에 액세스)
[^29]: [How to Create Offscreen Documents in Chrome Extensions: A Complete Guide](https://dev.to/notearthian/how-to-create-offscreen-documents-in-chrome-extensions-a-complete-guide-3ke2) (5월 5, 2026에 액세스)
[^30]: [chrome.offscreen | API - Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/offscreen) (5월 5, 2026에 액세스)
[^31]: [C.S. Weekly 2: Material Wave Visualizer and the Web Audio API - Medium](https://medium.com/@vapurrmaid/c-s-weekly-2-material-wave-visualizer-and-the-web-audio-api-5a16c2af4d3b) (5월 5, 2026에 액세스)
[^32]: [javascript - Web Audio API - Automatic Gain Control? - Stack Overflow](https://stackoverflow.com/questions/68960508/web-audio-api-automatic-gain-control) (5월 5, 2026에 액세스)
[^33]: [p-hlp/CTAGDRC: An audio compressor plugin created with JUCE - GitHub](https://github.com/p-hlp/CTAGDRC) (5월 5, 2026에 액세스)
[^34]: [benmangold/audio-compressor: audio amplitude compression in a pure data external, implemented in c - GitHub](https://github.com/benmangold/audio-compressor) (5월 5, 2026에 액세스)
[^35]: [Web Audio Api high gain values make noisy crackle sound (bad sound quality)](https://stackoverflow.com/questions/76105459/web-audio-api-high-gain-values-make-noisy-crackle-sound-bad-sound-quality) (5월 5, 2026에 액세스)
[^36]: [MarsCrop/AudioSignalProcessingScripts: Python scripts for Audio Signal Processing](https://github.com/MarsCrop/AudioSignalProcessingScripts) (5월 5, 2026에 액세스)
[^37]: [GitHub - tfry-git/compressor-arduino: A very low part count audio compressor based on arduino](https://github.com/tfry-git/compressor-arduino) (5월 5, 2026에 액세스)
[^38]: [Web Audio Api, setting the gain - javascript - Stack Overflow](https://stackoverflow.com/questions/30564330/web-audio-api-setting-the-gain) (5월 5, 2026에 액세스)
[^39]: [entrepeneur4lyf/Web-Audio-Mastering - GitHub](https://github.com/entrepeneur4lyf/Web-Audio-Mastering) (5월 5, 2026에 액세스)
[^40]: [martjay/Loudv1: Loudness normalization for audio files, batch processing is supported. - GitHub](https://github.com/martjay/Loudv1) (5월 5, 2026에 액세스)
[^41]: [Audio Loudness | Conversational Actions - Google for Developers](https://developers.google.com/assistant/tools/audio-loudness) (5월 5, 2026에 액세스)
[^42]: [Shreyans27/Compression-of-audio-signals-using-DCT - GitHub](https://github.com/Shreyans27/Compression-of-audio-signals-using-DCT) (5월 5, 2026에 액세스)
[^43]: [Chrome Extension V3 offscreen audio not working due to "Receiving end does not exist."](https://stackoverflow.com/questions/78110557/chrome-extension-v3-offscreen-audio-not-working-due-to-receiving-end-does-not-e) (5월 5, 2026에 액세스)
[^44]: [Chrome Extension Manifest v3 Tab Recording(Screen Recording) - Medium](https://medium.com/@chandanaug13/chrome-extension-manifest-v3-tab-recording-1798f1c53b04) (5월 5, 2026에 액세스)
[^45]: [How to Replace the Standard HTML5 Video Player - Bitmovin](https://bitmovin.com/blog/replacing-html5-video-player/) (5월 5, 2026에 액세스)
[^46]: [치지직 – CHZZK - Apps on Google Play](https://play.google.com/store/apps/details?id=com.navercorp.game.android.community) (5월 5, 2026에 액세스)
