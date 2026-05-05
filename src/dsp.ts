// DSP 체인 정의 — Phase 2b
//
// 메인 경로:    Source → Limiter → Gain (AGC 제어) → Glue → destination
// 사이드체인:                     ↘ K-weight HS → K-weight HP → AudioWorklet
//
// K-weighting 필터 계수는 ITU-R BS.1770 사양을 따른다.

export const dbToLinear = (db: number): number => 10 ** (db / 20)

export interface DspChain {
  input: AudioNode
  output: AudioNode
  limiter: DynamicsCompressorNode
  gain: GainNode
  glue: DynamicsCompressorNode
  kweightHS: BiquadFilterNode
  kweightHP: BiquadFilterNode
  /** K-weighted 사이드체인의 종단 노드. AudioWorklet 입력으로 연결한다. */
  sidechainTap: AudioNode
}

export function createDspChain(ctx: AudioContext): DspChain {
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -8
  limiter.ratio.value = 12
  limiter.attack.value = 0.002
  limiter.release.value = 0.05
  limiter.knee.value = 6

  const gain = ctx.createGain()
  gain.gain.value = 1 // unity로 시작, AGC가 동적으로 갱신

  const glue = ctx.createDynamicsCompressor()
  glue.threshold.value = -18
  glue.ratio.value = 3
  glue.attack.value = 0.02
  glue.release.value = 0.15
  glue.knee.value = 12

  // BS.1770 K-weighting (1단: high-shelf, 2단: high-pass Butterworth)
  const kweightHS = ctx.createBiquadFilter()
  kweightHS.type = 'highshelf'
  kweightHS.frequency.value = 1681.974450955533
  kweightHS.gain.value = 3.999843853973347

  const kweightHP = ctx.createBiquadFilter()
  kweightHP.type = 'highpass'
  kweightHP.frequency.value = 38.13547087602444
  kweightHP.Q.value = 0.7071067811865476 // Butterworth Q

  // 메인 경로: limiter → gain → glue
  limiter.connect(gain)
  gain.connect(glue)

  // 사이드체인: limiter 출력을 K-weighting 필터로 분기 (게인 영향 없는 측정)
  limiter.connect(kweightHS)
  kweightHS.connect(kweightHP)

  return {
    input: limiter,
    output: glue,
    limiter,
    gain,
    glue,
    kweightHS,
    kweightHP,
    sidechainTap: kweightHP,
  }
}

export function disconnectDspChain(chain: DspChain): void {
  chain.limiter.disconnect()
  chain.gain.disconnect()
  chain.glue.disconnect()
  chain.kweightHS.disconnect()
  chain.kweightHP.disconnect()
}
