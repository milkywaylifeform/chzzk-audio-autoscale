// AGC 컨트롤러
//
// AudioWorklet에서 100ms 간격으로 들어오는 Momentary Loudness 측정값을 받아
// GainNode를 setTargetAtTime으로 부드럽게 제어한다.

import { dbToLinear } from './dsp'

export const TARGET_LUFS = -15
export const SILENCE_DBFS = -60
export const MAX_GAIN_DB = 18
export const MIN_GAIN_DB = -18
export const SMOOTHING_S = 0.15

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

  node.port.onmessage = (event: MessageEvent<LoudnessMessage>) => {
    const msg = event.data
    if (msg.type !== 'measurement') return
    if (!isFinite(msg.lufs) || msg.dbfs < SILENCE_DBFS) {
      // Silence Gate: 무음 구간에서는 게인을 동결하여 폭음 방지.
      return
    }

    const desiredGainDb = clamp(TARGET_LUFS - msg.lufs, MIN_GAIN_DB, MAX_GAIN_DB)
    const desiredLinear = dbToLinear(desiredGainDb)
    controlGain.gain.setTargetAtTime(desiredLinear, ctx.currentTime, SMOOTHING_S)
  }

  return { node, sink }
}

export function disposeAgcController(agc: AgcController): void {
  agc.node.port.onmessage = null
  agc.node.disconnect()
  agc.sink.disconnect()
}
