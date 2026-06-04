import type {
  ActiveTabsResponse,
  AgcParams,
  CaptureMessage,
  MeasurementResponse,
  ParamsResponse,
  SimpleResponse,
} from '../messages'
import { createDspChain, disconnectDspChain, type DspChain } from '../dsp'
import {
  createAgcController,
  DEFAULT_AGC_PARAMS,
  disposeAgcController,
  type AgcController,
} from '../agc'

interface GraphNodes {
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  dsp: DspChain
  agc: AgcController
  startedAt: number
}

let audioContext: AudioContext | null = null
let workletReady: Promise<void> | null = null
const graphs = new Map<number, GraphNodes>()

// 새 캡처에 적용될 기본 파라미터. START_CAPTURE/SET_PARAMS로 갱신된다.
// 오프스크린 문서는 chrome.storage에 접근할 수 없으므로 storage를 직접 읽지 않고,
// 서비스워커가 START_CAPTURE 메시지에 실어 보낸 값으로 시드한다.
let currentParams = { ...DEFAULT_AGC_PARAMS }

const WORKLET_URL = chrome.runtime.getURL('loudness-processor.js')

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

async function ensureWorkletLoaded(ctx: AudioContext): Promise<void> {
  if (!workletReady) {
    workletReady = ctx.audioWorklet.addModule(WORKLET_URL)
  }
  await workletReady
}

async function startCapture(
  tabId: number,
  streamId: string,
  params?: AgcParams,
): Promise<void> {
  // SW가 storage에서 읽어 전달한 파라미터로 시드. 없으면 마지막 알려진 값으로 폴백.
  if (params) currentParams = { ...params }
  if (graphs.has(tabId)) {
    console.warn(`[sound-autoscale] tab ${tabId} 이미 캡처 중 — 재시작을 위해 기존 그래프 정리`)
    stopCapture(tabId)
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
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
  await ensureWorkletLoaded(ctx)

  const source = ctx.createMediaStreamSource(stream)
  const dsp = createDspChain(ctx)
  const agc = createAgcController(ctx, dsp.sidechainTap, dsp.gain, currentParams)

  source.connect(dsp.input)
  dsp.output.connect(ctx.destination)

  graphs.set(tabId, { stream, source, dsp, agc, startedAt: Date.now() })
  console.log(
    `[sound-autoscale] tab ${tabId} 캡처 시작 (active=${graphs.size}, AGC active)`,
  )
}

function stopCapture(tabId: number): void {
  const graph = graphs.get(tabId)
  if (!graph) return
  graph.source.disconnect()
  disposeAgcController(graph.agc)
  disconnectDspChain(graph.dsp)
  graph.stream.getTracks().forEach((t) => t.stop())
  graphs.delete(tabId)
  console.log(`[sound-autoscale] tab ${tabId} 캡처 중지 (active=${graphs.size})`)

  if (graphs.size === 0 && audioContext) {
    void audioContext.close()
    audioContext = null
    workletReady = null
  }
}

chrome.runtime.onMessage.addListener(
  (
    msg: CaptureMessage,
    _sender,
    sendResponse: (
      r:
        | SimpleResponse
        | ActiveTabsResponse
        | ParamsResponse
        | MeasurementResponse,
    ) => void,
  ) => {
    if (msg.type === 'START_CAPTURE') {
      startCapture(msg.tabId, msg.streamId, msg.params)
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
    if (msg.type === 'GET_ACTIVE_TABS') {
      const activeTabs = Array.from(graphs.entries()).map(([tabId, g]) => ({
        tabId,
        startedAt: g.startedAt,
      }))
      sendResponse({ activeTabs })
      return false
    }
    if (msg.type === 'SET_PARAMS') {
      if (msg.tabId !== undefined) {
        // 특정 탭만 갱신 — 다른 활성 탭에 영향 없음.
        // 단, 다음에 시작될 새 그래프의 기본값으로 쓰이도록 default도 같이 동기화.
        const g = graphs.get(msg.tabId)
        if (g) {
          g.agc.setParams(msg.params)
          Object.assign(currentParams, msg.params)
          sendResponse({ ok: true })
        } else {
          sendResponse({ ok: false, error: `tab ${msg.tabId} not active` })
        }
        return false
      }
      // tabId 미지정: 기본값 갱신 + 모든 활성 탭 broadcast (비활성 포그라운드 탭에서 팝업 연 경우)
      Object.assign(currentParams, msg.params)
      for (const g of graphs.values()) {
        g.agc.setParams(msg.params)
      }
      sendResponse({ ok: true })
      return false
    }
    if (msg.type === 'GET_PARAMS') {
      if (msg.tabId !== undefined) {
        const g = graphs.get(msg.tabId)
        if (g) {
          sendResponse({ params: g.agc.getParams() })
          return false
        }
      }
      sendResponse({ params: { ...currentParams } })
      return false
    }
    if (msg.type === 'GET_MEASUREMENT') {
      const g = graphs.get(msg.tabId)
      if (!g) {
        sendResponse({ found: false })
      } else {
        const s = g.agc.getState()
        sendResponse({ found: true, ...s })
      }
      return false
    }
    return false
  },
)

console.log('[sound-autoscale] offscreen 문서 로드')
