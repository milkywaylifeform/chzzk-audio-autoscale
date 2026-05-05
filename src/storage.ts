// chrome.storage.local 기반 AGC 파라미터 영속화
//
// 단일 writer는 popup. offscreen은 init 시 한 번만 읽어 currentParams를 시드한다.
// 저장/로드 실패는 로그만 남기고 기본값으로 폴백 (사용자 경험에 치명적이지 않음).

import { DEFAULT_AGC_PARAMS } from './agc'
import type { AgcParams } from './messages'

const STORAGE_KEY = 'agcParams'

export async function loadParams(): Promise<AgcParams> {
  try {
    const r = await chrome.storage.local.get(STORAGE_KEY)
    const stored = r[STORAGE_KEY] as Partial<AgcParams> | undefined
    return { ...DEFAULT_AGC_PARAMS, ...stored }
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
