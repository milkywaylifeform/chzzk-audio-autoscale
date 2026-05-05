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
  | { type: 'SET_PARAMS'; params: Partial<AgcParams> }
  | { type: 'GET_PARAMS' }

export type SimpleResponse = { ok: true } | { ok: false; error: string }

export interface ActiveTab {
  tabId: number
  startedAt: number
}

export type ActiveTabsResponse = { activeTabs: ActiveTab[] }

export type ParamsResponse = { params: AgcParams }
