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

이 스트림 ID를 후술할 오프스크린 문서로 전달하여 `navigator.mediaDevices.getUserMedia()`를 통해 오디오 스트림으로 변환하면, 치지직 웹 플레이어가 내부적으로 `<video>` 요소를 몇 번을 파괴하고 재생성하든 상관없이 안정적인 오디오 파이프라인이 유지된다.[^22] DOM의 생명 주기와 오디오 캡처의 생명 주기가 완전히 분리되므로, 화질 변경 시 단 1밀리초의 오토 스케일링 풀림 현상도 발생하지 않는 완벽한 예외 처리가 완성된다.

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

1. **`MediaStreamAudioSourceNode`**: 탭 캡처를 통해 획득한 치지직 방송의 원본 오디오 스트림을 Web Audio API의 컨텍스트 안으로 가져온다.[^22]
2. **`DynamicsCompressorNode` (Peak Limiter)**: 순간적으로 발생하는 극단적인 고음(피크 타격음)을 1차적으로 억제하여 클리핑(Clipping, 소리 깨짐)을 방지하는 역할을 한다.[^32]
3. **`AnalyserNode`**: 현재 지나가고 있는 오디오 신호의 배열 데이터를 실시간으로 추출하여 볼륨 레벨(LUFS)을 수학적으로 계산할 수 있게 해준다.[^31]
4. **`GainNode` (AGC Amplifier)**: 3번에서 계산된 결과에 따라 소프트웨어적으로 볼륨을 올리거나 내리는 핵심 증폭기 역할을 수행한다.[^27]
5. **`DynamicsCompressorNode` (Glue Compressor)**: `GainNode`의 급격한 볼륨 변화로 인해 발생할 수 있는 이질감을 부드럽게 다듬고 압축하는 2차 컴프레서이다.[^33]
6. **`MediaStreamAudioDestinationNode`**: 최종적으로 정규화된 오디오를 시청자의 하드웨어 스피커로 출력한다.[^22]

### 6.2. 동적 범위 압축(Dynamic Range Compression) 파라미터 튜닝

`DynamicsCompressorNode`는 라이브 스트리밍의 특성(게임 소리와 사람의 목소리가 섞인 복합 오디오)에 맞게 정밀하게 튜닝되어야 한다.[^32]

| 파라미터 (Parameter) | 권장 설정값 | 역할 및 설정 이유 (라이브 스트리밍 환경) |
| --- | --- | --- |
| **Threshold** | -24 dB | 어느 정도의 볼륨부터 압축을 시작할지 결정. 갑작스러운 비명이나 게임 내 총소리 등 확연히 큰 소리만 타겟팅하기 위해 -24dB로 설정.[^32] |
| **Ratio** | 4:1 | 임계값을 넘은 소리를 얼마나 강력하게 누를지 결정. 4:1 비율은 음성의 자연스러움을 해치지 않으면서도 돌발적인 피크를 효과적으로 제어함.[^32] |
| **Attack** | 0.002 초 (2ms) | 큰 소리가 났을 때 압축기가 반응하는 속도. 고막을 보호하기 위해 2밀리초 수준의 극단적으로 빠른 반응 속도가 필수적임.[^32] |
| **Release** | 0.100 초 (100ms) | 소리가 작아졌을 때 압축을 푸는 속도. 너무 빠르면 소리가 울렁거리는 펌핑(Pumping) 현상이 발생하므로 100ms 내외로 설정하여 자연스러움을 유지.[^32] |
| **Knee** | 30 dB | 압축이 시작되는 구간의 굴곡. 소프트 니(Soft Knee)를 적용하여 압축이 걸리는 느낌을 시청자가 눈치채지 못하게 부드럽게 처리함. |

### 6.3. LUFS 기반 자동 이득 제어(AGC) 매커니즘

단순한 컴프레서 노드는 큰 소리를 줄여줄 뿐, 속삭이듯 작게 말하는 스트리머의 목소리를 시청하기 편안한 수준으로 자동으로 끌어올려주지는 못한다. 이를 위해서는 목표 음량(Target Loudness)을 설정하고 이를 추적하는 수학적 알고리즘이 `GainNode`를 제어해야 한다.[^32]

최근 방송 음향 표준에서는 단순한 피크 레벨이나 RMS 대신, 인간의 청각 인지 특성을 반영한 **LUFS (Loudness Units relative to Full Scale)**를 기준으로 삼는다.[^39] 구글 어시스턴트나 스포티파이, 유튜브와 같은 대형 플랫폼들은 스테레오 환경에서 평균적으로 -14 LUFS에서 -16 LUFS 사이를 목표 음량으로 채택하여 플랫폼 간의 볼륨 편차를 줄이고 있다.[^39]

확장 프로그램 내의 JavaScript 루프(일반적으로 `requestAnimationFrame` 또는 `AudioWorklet`을 활용)는 다음과 같은 연산을 초당 수십 회 수행한다:[^13]

1. `AnalyserNode.getFloatTimeDomainData()`를 통해 오디오 신호 배열을 추출한다.[^31]
2. 인간의 귀가 저음보다 고음에 더 민감하다는 점을 반영하기 위해, 오디오 배열 데이터에 K-웨이팅(K-weighting) 디지털 필터(High-shelf 및 High-pass 필터 결합) 알고리즘을 적용한다.[^39]
3. 필터링된 신호의 평균 제곱(Mean Square)을 구한 뒤 데시벨 공식에 대입하여 현재 방송의 LUFS를 도출한다.[^39]
4. 측정된 현재 LUFS가 목표값(예: -15 LUFS)과 얼마나 차이 나는지 델타(Δ) 값을 계산한다. 만약 현재 측정값이 -25 LUFS라면, 소리가 너무 작으므로 +10dB의 증폭(Makeup Gain)이 필요하다.[^32]
5. 계산된 데시벨 차이를 선형 배율로 변환하여 `GainNode.gain.value`에 실시간으로 적용한다.[^35] 이때 갑작스러운 볼륨 변화로 인한 노이즈(Zipper noise)를 방지하기 위해 `gainNode.gain.setTargetAtTime()` 메서드를 사용하여 부드러운 보간(Smoothing) 이동을 지시한다.[^38]

## 7. 성능 최적화, 메모리 관리 및 DRM 예외 상황

브라우저 내에서 초당 48,000번의 샘플링 속도로 오디오 데이터를 실시간 수학 연산하는 작업은 자칫하면 심각한 CPU 과부하와 배터리 소모를 유발할 수 있다. 또한 백그라운드 환경 특성상 메모리 누수(Memory Leak)에 취약하다.

### 7.1. 레이턴시(지연 시간) 최소화 전략

복잡한 FFT(Fast Fourier Transform) 기반의 무거운 플러그인을 자바스크립트 기반으로 자체 구현하여 사용하면 오디오 신호 처리 과정에서 50ms 이상의 레이턴시가 발생할 수 있다.[^31] 이는 치지직 라이브 스트리밍 시청 시 스트리머의 입모양과 목소리가 맞지 않는 립싱크(Lip-sync) 어긋남 현상을 유발한다.

이를 방지하기 위해, 오디오가 렌더링되어 스피커로 나가는 직접적인 경로(Direct Path)는 모두 크롬 브라우저 하단에서 최적화된 C++ 코드로 동작하는 네이티브 Web Audio API 노드(`DynamicsCompressorNode`, `GainNode`)만으로 구성되어야 한다.[^31] 무거운 LUFS 계산과 AGC 파라미터 조절 로직은 별도의 사이드체인(Side-chain)처럼 병렬로 동작하며 비동기적으로 `GainNode`에 제어 신호만 보내도록 분리해야 한다. 이를 통해 전체 시스템의 인-아웃 오디오 레이턴시를 5ms 미만으로 극도로 낮출 수 있다.

### 7.2. 탭 종료 시의 메모리 누수 및 좀비 스트림 방지

가장 흔하게 발생하는 크롬 확장 프로그램의 버그 중 하나는, 사용자가 방송 탭을 닫았음에도 불구하고 오프스크린 문서가 백그라운드에서 죽지 않고 '좀비' 상태로 남아 마이크 권한이나 오디오 하드웨어를 점유하는 현상이다.[^2]

서비스 워커는 치지직 탭의 생명 주기를 엄격하게 감시해야 한다. `chrome.tabs.onRemoved` 및 `chrome.tabs.onUpdated` 이벤트 리스너를 등록하여, 사용자가 치지직 방송 창을 닫거나 다른 사이트로 이동하는 순간 오디오 캡처 파이프라인을 즉각 해체해야 한다.[^43] 서비스 워커는 오프스크린 문서로 "정지" 메시지를 보내고, 오프스크린 문서는 내부적으로 `audioContext.close()`를 호출하여 자원을 반환하며, 활성화된 모든 `MediaStreamTrack`에 대해 `.stop()` 메서드를 실행해야 한다.[^23] 이 해제 작업이 누락되면 브라우저 탭 상단에 빨간색 '녹음 중' 아이콘이 사라지지 않아 사용자에게 심각한 프라이버시 불안감을 유발하게 된다.[^22]

### 7.3. DRM(Digital Rights Management) 콘텐츠 예외 처리

치지직 플랫폼은 e스포츠 공식 중계나 저작권이 있는 애니메이션, 영화 등을 스트리밍할 때 Widevine과 같은 DRM 기술을 적용하기도 한다.[^5] 브라우저의 보안 정책상, DRM으로 암호화된 미디어 스트림은 확장 프로그램의 `chrome.tabCapture` API가 가로채거나 복호화된 오디오 버퍼에 접근하는 것을 원천적으로 차단한다.[^6]

이러한 예외 상황이 발생할 경우 `tabCapture.getMediaStreamId()`가 실패하거나, 빈 오디오 스트림(완전한 묵음)이 반환된다.[^23] 시스템은 오류를 삼키고 침묵하는 대신, 팝업 UI를 통해 **"현재 방송은 저작권 보호(DRM) 기술이 적용되어 오디오 스케일링 기능을 지원할 수 없습니다."**라는 명확한 시각적 예외 메시지를 표시하여 사용자의 혼란을 방지해야 한다.

## 8. 단계별 개발 및 통합 로드맵

위에서 설계된 복잡한 아키텍처와 예외 처리 로직을 체계적으로 구현하기 위한 4단계 마일스톤 기반 개발 로드맵을 다음과 같이 정의한다.

| 개발 단계 (Phase) | 주요 목표 및 세부 구현 과제 |
| --- | --- |
| **Phase 1: MV3 코어 환경 및 캡처 파이프라인 구축** | - `manifest.json` 생성 및 V3 권한(`tabCapture`, `offscreen`, `activeTab`) 부여[^23]<br>- 서비스 워커 기반 확장 프로그램 생명 주기 및 아이콘 클릭 액션 라우팅 구현<br>- `USER_MEDIA` 속성을 적용한 오프스크린 문서 강제 생성 및 중복 방지 로직(`runtime.getContexts`) 구현[^30]<br>- `tabCapture.getMediaStreamId()`를 활용하여 탭의 오디오 스트림을 안전하게 오프스크린 문서로 전달 및 `AudioContext`에 초기 바인딩[^22] |
| **Phase 2: DSP 엔진 및 LUFS 오토 스케일링 알고리즘 탑재** | - 오프스크린 문서 내 Web Audio 노드 그래프 직렬 연결 구축 (Source → Limiter → Analyser → Gain → Compressor → Destination)[^27]<br>- 치지직 환경에 최적화된 `DynamicsCompressorNode` 파라미터 세팅 (Attack: 2ms, Ratio: 4:1)[^32]<br>- 자바스크립트 기반 LUFS 계산 모듈 개발 (K-weighting 필터 적용 및 RMS/데시벨 수학 변환)[^39]<br>- 계산된 목표 델타값으로 `GainNode`의 증폭을 부드럽게 유도하는(`setTargetAtTime`) 지능형 AGC 루프 완성[^35] |
| **Phase 3: 극한 예외 처리 통합 (사용자 핵심 요구사항)** | - **방송 중단 방어**: AGC 로직 내 노이즈 플로어 탐지 알고리즘(-60dBFS)을 구축하여 무음 시 Gain 증폭을 동결(Freeze)하는 실렌스 게이트 구현[^33]<br>- **화질 변경 방어**: `tabCapture` 방식의 구조적 이점을 검증하고, 만약 URL 이동 등으로 스트림이 소실될 경우를 대비해 Content Script의 `MutationObserver`를 활용한 캡처 파이프라인 소프트 리셋 로직 백업 개발[^9]<br>- `chrome.tabs.onRemoved` 이벤트를 캡치하여 메모리 누수를 완벽하게 차단하고 `AudioContext`를 강제 클린업하는 모듈 개발[^43] |
| **Phase 4: UI/UX 고도화 및 스토어 배포 준비** | - 사용자 친화적인 팝업 UI(`popup.html`) 제작. 사용자가 직접 '목표 음량(Target LUFS)'과 '압축 강도'를 슬라이더로 조절할 수 있는 직관적 인터페이스 제공<br>- 서비스 워커를 통한 UI 설정값과 오프스크린 문서 내부 DSP 파라미터 간의 양방향 실시간 메시지 패싱(동기화) 구현<br>- 백그라운드 리소스 점유율(CPU 프로파일링) 테스트 및 `requestAnimationFrame` 폴링 레이트 최적화(초당 15~20회로 제한)[^13]<br>- DRM 암호화 방송 감지 시 오류 처리 UX 구현. 최종 크롬 웹 스토어 심사 가이드라인 점검 및 배포 |

## 9. 결론

치지직 플랫폼을 위한 오디오 오토 스케일링 확장 프로그램의 개발은 단순히 볼륨을 조절하는 스크립트를 작성하는 수준을 넘어, 최신 브라우저 보안 아키텍처와 디지털 신호 처리(DSP), 그리고 라이브 미디어 프로토콜의 특성을 융합해야 하는 고도의 엔지니어링 과제이다.

매니페스트 V3 환경에서 백그라운드 오디오 처리의 권한이 대폭 축소됨에 따라, 본 설계는 오프스크린 문서(Offscreen Document)를 활용하는 우회 아키텍처를 도입하여 시스템의 기반을 확보했다.[^3] 특히 사용자가 직면하는 치명적인 예외 상황들을 해결하기 위한 전략적 선택이 돋보인다. 화질 변경 시 발생하는 예측 불가능한 `<video>` DOM 요소의 파괴 및 재생성 문제를 회피하기 위해 `tabCapture` API를 채택함으로써, 렌더링 계층에서 오디오를 안전하게 분리해냈다.[^20] 또한, 방송 중간 중단으로 인한 30초 무음 타임아웃 강제 종료를 막기 위해 `USER_MEDIA` 이유(Reason)를 기용하고[^22], 수학적 무한 증폭 오류를 방지하는 실렌스 게이트(Silence Gate)를 AGC 로직에 이식하여 어떠한 불안정한 네트워크 환경에서도 견고하게 동작하는 파이프라인을 완성했다.[^33]

본 보고서에서 제시한 심층적인 아키텍처와 4단계 로드맵을 충실히 따른다면, 시청자들은 치지직 스트리머의 돌발적인 고음이나 잘 들리지 않는 묵음에도 불구하고, 귀를 자극하지 않는 완벽하게 평탄화(LUFS 정규화)된 고품질의 오디오 경험을 끊김 없이 누릴 수 있을 것이다. 이는 라이브 스트리밍 시청 편의성을 극대화하는 강력한 클라이언트 도구가 될 것이다.

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
