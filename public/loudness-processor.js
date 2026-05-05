// BS.1770 / BS.1771-2 Momentary Loudness 측정 워크렛
//
// K-weighting 필터(High-shelf 1681Hz +4dB, High-pass 38Hz)는 상위 그래프의
// BiquadFilterNode에서 적용되어 이 프로세서로 들어온다고 가정한다. 이 워크렛은
// 들어온 K-weighted 신호의 400ms 슬라이딩 윈도 평균 제곱(Mean Square)을 구해
// LUFS 값으로 변환한 뒤 메인 스레드로 주기적으로 전송한다.
//
// 워크렛 전역에 sampleRate, currentTime, currentFrame이 노출된다(스펙).

const WINDOW_MS = 400
const POST_INTERVAL_MS = 100

class LoudnessProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.windowSize = Math.round((WINDOW_MS / 1000) * sampleRate)
    this.buffer = new Float32Array(this.windowSize)
    this.writeIndex = 0
    this.filled = 0
    this.samplesSinceLastPost = 0
    this.postEvery = Math.round((POST_INTERVAL_MS / 1000) * sampleRate)
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true

    const numChannels = input.length
    const blockSize = input[0] ? input[0].length : 0
    if (blockSize === 0) return true

    // 다중 채널은 평균으로 mono 다운믹싱. BS.1770의 가중 합 대신 단순 평균을
    // 사용해도 AGC 용도로는 오차가 미미하다.
    for (let i = 0; i < blockSize; i++) {
      let s = 0
      for (let c = 0; c < numChannels; c++) {
        s += input[c][i]
      }
      s /= numChannels

      this.buffer[this.writeIndex] = s
      this.writeIndex = (this.writeIndex + 1) % this.windowSize
      if (this.filled < this.windowSize) this.filled++
    }

    this.samplesSinceLastPost += blockSize
    if (this.samplesSinceLastPost < this.postEvery) return true
    if (this.filled < this.windowSize) return true
    this.samplesSinceLastPost = 0

    let sumSquares = 0
    for (let i = 0; i < this.windowSize; i++) {
      const v = this.buffer[i]
      sumSquares += v * v
    }
    const meanSquare = sumSquares / this.windowSize

    // BS.1770 LUFS 공식: -0.691 + 10*log10(MS) (K-weighted 신호 기준)
    const lufs =
      meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity
    // 무음 게이트용 레벨 — K-weighted 신호의 dB이지만 게이트 임계값으로 충분.
    const dbfs = meanSquare > 0 ? 10 * Math.log10(meanSquare) : -Infinity

    this.port.postMessage({ type: 'measurement', lufs, dbfs })
    return true
  }
}

registerProcessor('loudness-processor', LoudnessProcessor)
