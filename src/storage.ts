// chrome.storage.local 기반 AGC 파라미터 영속화
//
// 단일 writer는 popup. offscreen은 init 시 한 번만 읽어 currentParams를 시드한다.
// 저장/로드 실패는 로그만 남기고 기본값으로 폴백 (사용자 경험에 치명적이지 않음).

import { DEFAULT_AGC_PARAMS } from './agc'
import type { AgcParams } from './messages'

const STORAGE_KEY = 'agcParams'

// 저장값을 기본값과 병합하되, 각 키가 유한한 숫자가 아니면(null·NaN·undefined 등)
// 해당 키만 기본값으로 대체한다. 손상된 값이 UI(formatValue 등)로 흘러가 toFixed에서
// 터지는 것을 원천 차단한다.
function sanitizeParams(stored: Partial<AgcParams> | undefined): AgcParams {
  const result = { ...DEFAULT_AGC_PARAMS }
  if (!stored) return result
  for (const key of Object.keys(result) as (keyof AgcParams)[]) {
    const v = stored[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      result[key] = v
    }
  }
  return result
}

export async function loadParams(): Promise<AgcParams> {
  try {
    const r = await chrome.storage.local.get(STORAGE_KEY)
    return sanitizeParams(r[STORAGE_KEY] as Partial<AgcParams> | undefined)
  } catch (e) {
    console.warn('[sound-autoscale] loadParams 실패:', e)
    return { ...DEFAULT_AGC_PARAMS }
  }
}

export async function saveParams(params: AgcParams): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: params })
  } catch (e) {
    console.warn('[sound-autoscale] saveParams 실패:', e)
  }
}
