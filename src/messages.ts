export type CaptureMessage =
  | { type: 'START_CAPTURE'; tabId: number; streamId: string }
  | { type: 'STOP_CAPTURE'; tabId: number }
  | { type: 'GET_ACTIVE_TABS' }

export type SimpleResponse = { ok: true } | { ok: false; error: string }

export interface ActiveTab {
  tabId: number
  /** Date.now() 시점. LRU 평가용. */
  startedAt: number
}

export type ActiveTabsResponse = { activeTabs: ActiveTab[] }
