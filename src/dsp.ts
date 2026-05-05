// DSP 체인 정의 — Phase 2a
//
// Source → Limiter (peak) → Gain (makeup) → Glue (master) → destination
//
// 파라미터는 ROADMAP.md 6.2 표를 따른다. Phase 2b에서 AudioWorklet 기반
// Momentary Loudness 측정이 추가되면 GainNode가 AGC 제어 대상이 된다.

export const dbToLinear = (db: number): number => 10 ** (db / 20)

export interface DspChain {
  input: AudioNode
  output: AudioNode
  limiter: DynamicsCompressorNode
  gain: GainNode
  glue: DynamicsCompressorNode
}

export interface DspParams {
  makeupGainDb: number
}

export const DEFAULT_DSP_PARAMS: DspParams = {
  // Phase 2a: 고정 +6dB. Phase 2b에서 LUFS 측정 결과로 동적 갱신된다.
  makeupGainDb: 6,
}

export function createDspChain(ctx: AudioContext, params: DspParams = DEFAULT_DSP_PARAMS): DspChain {
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -8
  limiter.ratio.value = 12
  limiter.attack.value = 0.002
  limiter.release.value = 0.05
  limiter.knee.value = 6

  const gain = ctx.createGain()
  gain.gain.value = dbToLinear(params.makeupGainDb)

  const glue = ctx.createDynamicsCompressor()
  glue.threshold.value = -18
  glue.ratio.value = 3
  glue.attack.value = 0.02
  glue.release.value = 0.15
  glue.knee.value = 12

  limiter.connect(gain)
  gain.connect(glue)

  return { input: limiter, output: glue, limiter, gain, glue }
}

export function disconnectDspChain(chain: DspChain): void {
  chain.limiter.disconnect()
  chain.gain.disconnect()
  chain.glue.disconnect()
}
