// AGC 컨트롤러
//
// AudioWorklet에서 100ms 간격으로 들어오는 Momentary Loudness 측정값을 받아
// GainNode를 setTargetAtTime으로 부드럽게 제어한다.

import { dbToLinear } from './dsp'

export const TARGET_LUFS = -15
// 휴지 구간 펌핑 방지를 위해 -60 → -45로 상향. 진짜 디지털 무음뿐 아니라
// 조용한 BGM 구간에서도 게이팅하여 AGC가 무리한 boost를 시도하지 않게 한다.
export const SILENCE_DBFS = -45
export const MAX_GAIN_DB = 18
export const MIN_GAIN_DB = -18
// 비대칭 시정수: 신호가 커지면(공격) 빠르게 게인 내려서 폭음 방지,
// 신호가 작아지면(릴리즈) 천천히 게인 올려서 휴지 구간 BGM 부풀림 억제.
// release 0.8s는 1~3초 휴지에 boost가 너무 빨리 들어가 펌핑 발생 → 3.0s로 증가.
// 방송 AGC 표준 release(1~10s) 범위 안에서 채널 전환 적응 속도와 균형.
export const ATTACK_S = 0.15
export const RELEASE_S = 3.0

// 디버그용: 1초에 한 번씩 측정값과 적용 게인을 콘솔에 출력.
// Phase 4에서 팝업 UI로 옮긴 뒤 제거 예정.
const DEBUG_LOG_INTERVAL_MS = 1000

export interface LoudnessMessage {
  type: 'measurement'
  lufs: number
  dbfs: number
}

export interface AgcController {
  node: AudioWorkletNode
  /** AudioWorklet을 그래프 활성 상태로 유지하기 위한 zero-gain 싱크. */
  sink: GainNode
}

const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x))

export function createAgcController(
  ctx: AudioContext,
  sidechainSource: AudioNode,
  controlGain: GainNode,
): AgcController {
  const node = new AudioWorkletNode(ctx, 'loudness-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
  })

  // AudioWorklet 노드는 출력이 활성 그래프에 연결되어야 process()가 호출된다.
  // 무음 싱크를 만들어 destination까지 경로를 잇는다.
  const sink = ctx.createGain()
  sink.gain.value = 0

  sidechainSource.connect(node)
  node.connect(sink)
  sink.connect(ctx.destination)

  let lastLogAt = 0
  let lastGainDb = 0
  let gated = false

  node.port.onmessage = (event: MessageEvent<LoudnessMessage>) => {
    const msg = event.data
    if (msg.type !== 'measurement') return

    if (!isFinite(msg.lufs) || msg.dbfs < SILENCE_DBFS) {
      // Silence Gate: 무음/조용한 구간에서는 게인을 동결하여 펌핑·폭음 방지.
      gated = true
    } else {
      gated = false
      const desiredGainDb = clamp(TARGET_LUFS - msg.lufs, MIN_GAIN_DB, MAX_GAIN_DB)
      const desiredLinear = dbToLinear(desiredGainDb)
      // 비대칭 시정수: 게인 감소(=신호 커짐)는 빠르게, 게인 증가(=신호 작아짐)는 느리게.
      const tc = desiredGainDb < lastGainDb ? ATTACK_S : RELEASE_S
      controlGain.gain.setTargetAtTime(desiredLinear, ctx.currentTime, tc)
      lastGainDb = desiredGainDb
    }

    const now = performance.now()
    if (now - lastLogAt >= DEBUG_LOG_INTERVAL_MS) {
      lastLogAt = now
      const lufsStr = isFinite(msg.lufs) ? msg.lufs.toFixed(1) : '-∞'
      const dbfsStr = isFinite(msg.dbfs) ? msg.dbfs.toFixed(1) : '-∞'
      const gainStr = `${lastGainDb >= 0 ? '+' : ''}${lastGainDb.toFixed(1)}dB`
      const tag = gated ? ' [GATED]' : ''
      console.log(
        `[agc] lufs=${lufsStr} dbfs=${dbfsStr} → gain=${gainStr}${tag}`,
      )
    }
  }

  return { node, sink }
}

export function disposeAgcController(agc: AgcController): void {
  agc.node.port.onmessage = null
  agc.node.disconnect()
  agc.sink.disconnect()
}
