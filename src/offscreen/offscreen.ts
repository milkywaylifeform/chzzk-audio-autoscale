import type {
  ActiveTabsResponse,
  CaptureMessage,
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

// 새 캡처에 적용될 기본 파라미터. SET_PARAMS로 갱신되고 새 그래프 생성 시 사용.
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

async function startCapture(tabId: number, streamId: string): Promise<void> {
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
      r: SimpleResponse | ActiveTabsResponse | ParamsResponse,
    ) => void,
  ) => {
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
    if (msg.type === 'GET_ACTIVE_TABS') {
      const activeTabs = Array.from(graphs.entries()).map(([tabId, g]) => ({
        tabId,
        startedAt: g.startedAt,
      }))
      sendResponse({ activeTabs })
      return false
    }
    if (msg.type === 'SET_PARAMS') {
      Object.assign(currentParams, msg.params)
      for (const g of graphs.values()) {
        g.agc.setParams(msg.params)
      }
      sendResponse({ ok: true })
      return false
    }
    if (msg.type === 'GET_PARAMS') {
      sendResponse({ params: { ...currentParams } })
      return false
    }
    return false
  },
)

console.log('[sound-autoscale] offscreen 문서 로드')
