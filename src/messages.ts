export interface AgcParams {
  targetLufs: number
  silenceDbfs: number
  maxGainDb: number
  attackS: number
  releaseS: number
}

export type CaptureMessage =
  | { type: 'START_CAPTURE'; tabId: number; streamId: string }
  | { type: 'STOP_CAPTURE'; tabId: number }
  | { type: 'GET_ACTIVE_TABS' }
  | { type: 'TOGGLE_TAB'; tabId: number }
  | { type: 'SET_PARAMS'; tabId?: number; params: Partial<AgcParams> }
  | { type: 'GET_PARAMS'; tabId?: number }
  | { type: 'GET_MEASUREMENT'; tabId: number }

export type SimpleResponse = { ok: true } | { ok: false; error: string }

export interface ActiveTab {
  tabId: number
  startedAt: number
}

export type ActiveTabsResponse = { activeTabs: ActiveTab[] }

export type ParamsResponse = { params: AgcParams }

export type MeasurementResponse =
  | { found: true; lufs: number; dbfs: number; gainDb: number; gated: boolean }
  | { found: false }
