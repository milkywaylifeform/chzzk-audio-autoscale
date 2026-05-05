import type { CaptureMessage, CaptureResponse } from '../messages'

interface GraphNodes {
  stream: MediaStream
  source: MediaStreamAudioSourceNode
}

let audioContext: AudioContext | null = null
const graphs = new Map<number, GraphNodes>()

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

async function startCapture(tabId: number, streamId: string): Promise<void> {
  if (graphs.has(tabId)) {
    console.warn(`[sound-autoscale] tab ${tabId} 이미 캡처 중`)
    return
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // chrome 전용 제약 — 표준 MediaTrackConstraints에는 없음
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
    video: false,
  })

  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }

  const source = ctx.createMediaStreamSource(stream)
  // Phase 1: DSP 없이 바로 스피커로 직결.
  // tabCapture가 원본 탭 오디오를 음소거시키므로 이 재생이 없으면 무음이 된다.
  source.connect(ctx.destination)

  graphs.set(tabId, { stream, source })
  console.log(`[sound-autoscale] tab ${tabId} 캡처 시작`)
}

function stopCapture(tabId: number): void {
  const graph = graphs.get(tabId)
  if (!graph) return
  graph.source.disconnect()
  graph.stream.getTracks().forEach((t) => t.stop())
  graphs.delete(tabId)
  console.log(`[sound-autoscale] tab ${tabId} 캡처 중지`)

  if (graphs.size === 0 && audioContext) {
    void audioContext.close()
    audioContext = null
  }
}

chrome.runtime.onMessage.addListener(
  (msg: CaptureMessage, _sender, sendResponse: (r: CaptureResponse) => void) => {
    if (msg.type === 'START_CAPTURE') {
      startCapture(msg.tabId, msg.streamId)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => {
          console.error('[sound-autoscale] startCapture 실패:', e)
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
        })
      return true
    }
    if (msg.type === 'STOP_CAPTURE') {
      stopCapture(msg.tabId)
      sendResponse({ ok: true })
      return false
    }
    return false
  },
)

console.log('[sound-autoscale] offscreen 문서 로드')
