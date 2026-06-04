import { DEFAULT_AGC_PARAMS } from '../agc'
import { loadParams, saveParams } from '../storage'
import type {
  ActiveTabsResponse,
  AgcParams,
  CaptureMessage,
  MeasurementResponse,
  ParamsResponse,
  SimpleResponse,
} from '../messages'

const POLL_INTERVAL_MS = 200

// LUFS 바 표시 범위
const LUFS_BAR_MIN = -60
const LUFS_BAR_MAX = 0

type SliderKey = keyof AgcParams

const SLIDER_KEYS: SliderKey[] = [
  'targetLufs',
  'silenceDbfs',
  'maxGainDb',
  'attackS',
  'releaseS',
]

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T

let currentTabId: number | null = null
let isCurrentTabActive = false
let currentParams: AgcParams = { ...DEFAULT_AGC_PARAMS }

function targetTabId(): number | undefined {
  return isCurrentTabActive && currentTabId !== null ? currentTabId : undefined
}

function updateSettingsHeading(): void {
  const h = $('settings-heading')
  h.textContent = isCurrentTabActive ? 'AGC 설정 (현재 탭)' : 'AGC 설정 (기본값)'
}

function formatValue(key: SliderKey, val: number): string {
  switch (key) {
    case 'targetLufs':
    case 'silenceDbfs':
      return `${val.toFixed(0)} LUFS`
    case 'maxGainDb':
      return `±${val.toFixed(0)} dB`
    case 'attackS':
    case 'releaseS':
      return `${val.toFixed(2)} s`
  }
}

function applyParamsToUi(p: AgcParams): void {
  for (const key of SLIDER_KEYS) {
    const slider = $<HTMLInputElement>(key)
    const valEl = $(`${key}-val`)
    slider.value = String(p[key])
    valEl.textContent = formatValue(key, p[key])
  }
  updateBars(lastState, p)
}

function pct(val: number, min: number, max: number): number {
  if (!isFinite(val)) return 0
  return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100))
}

let lastState: { lufs: number; gainDb: number } | null = null

function updateBars(
  state: { lufs: number; gainDb: number } | null,
  params: AgcParams,
): void {
  // LUFS 바: 목표·게이트 마커는 항상 갱신
  $('bar-target').style.left = `${pct(params.targetLufs, LUFS_BAR_MIN, LUFS_BAR_MAX)}%`
  $('bar-gate').style.left = `${pct(params.silenceDbfs, LUFS_BAR_MIN, LUFS_BAR_MAX)}%`

  // 게인 바 축 라벨: maxGainDb에 따라 갱신
  $('gain-axis-min').textContent = `-${params.maxGainDb}`
  $('gain-axis-max').textContent = `+${params.maxGainDb} dB`

  const lufsIndicator = $('bar-lufs')
  const gainIndicator = $('bar-gain')

  if (state) {
    lufsIndicator.style.left = `${pct(state.lufs, LUFS_BAR_MIN, LUFS_BAR_MAX)}%`
    lufsIndicator.style.opacity = '1'
    gainIndicator.style.left = `${pct(state.gainDb, -params.maxGainDb, params.maxGainDb)}%`
    gainIndicator.style.opacity = '1'
  } else {
    lufsIndicator.style.opacity = '0.15'
    gainIndicator.style.opacity = '0.15'
  }
}

async function sendCapture<T>(msg: CaptureMessage): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T
  } catch (e) {
    // 오프스크린 미존재 등으로 수신자 없음 — 호출자가 기본값으로 처리.
    console.debug('[popup] sendMessage 실패 (무시):', e)
    return undefined
  }
}

async function refreshToggleState(): Promise<void> {
  const btn = $<HTMLButtonElement>('toggle-btn')
  if (currentTabId === null) {
    btn.textContent = '-'
    btn.disabled = true
    isCurrentTabActive = false
    updateSettingsHeading()
    return
  }
  btn.disabled = false
  const res = await sendCapture<ActiveTabsResponse>({ type: 'GET_ACTIVE_TABS' })
  isCurrentTabActive =
    res?.activeTabs?.some((t) => t.tabId === currentTabId) ?? false
  btn.textContent = isCurrentTabActive ? 'ON' : 'OFF'
  btn.classList.toggle('active', isCurrentTabActive)
  btn.classList.remove('reactivate')
  updateSettingsHeading()
}

async function onToggleClick(): Promise<void> {
  if (currentTabId === null) return
  const btn = $<HTMLButtonElement>('toggle-btn')
  btn.disabled = true
  const wasActive = isCurrentTabActive
  const res = await sendCapture<SimpleResponse>({
    type: 'TOGGLE_TAB',
    tabId: currentTabId,
  })
  if (res && !res.ok) {
    console.error('[popup] 토글 실패:', res.error)
  }
  await refreshToggleState()
  if (!wasActive && isCurrentTabActive) {
    // OFF→ON: popup이 보유한 currentParams를 새 그래프에 강제 적용.
    // (slider 편집의 saveParams ↔ 새 offscreen 모듈의 paramsLoaded 사이 race로
    // 새 그래프가 옛 storage 값으로 초기화되는 문제를 방지.)
    void sendCapture<SimpleResponse>({
      type: 'SET_PARAMS',
      tabId: currentTabId,
      params: currentParams,
    })
    // popup 상태 = 사용자 의도이므로 슬라이더 UI는 그대로 유지.
  } else if (wasActive && !isCurrentTabActive) {
    // ON→OFF: 기본값 모드로 전환 — storage 기준으로 슬라이더 동기화.
    await loadAndApplyParams()
  }
}

async function loadAndApplyParams(): Promise<void> {
  if (isCurrentTabActive && currentTabId !== null) {
    const res = await sendCapture<ParamsResponse>({
      type: 'GET_PARAMS',
      tabId: currentTabId,
    })
    currentParams = res?.params ?? (await loadParams())
  } else {
    currentParams = await loadParams()
  }
  applyParamsToUi(currentParams)
}

function setupSliders(): void {
  for (const key of SLIDER_KEYS) {
    const slider = $<HTMLInputElement>(key)
    const valEl = $(`${key}-val`)
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value)
      valEl.textContent = formatValue(key, val)
      currentParams = { ...currentParams, [key]: val }
      // 활성 탭이면 그 탭만, 아니면 기본값 + 모든 탭에 broadcast (offscreen에서 분기)
      void sendCapture<SimpleResponse>({
        type: 'SET_PARAMS',
        tabId: targetTabId(),
        params: { [key]: val } as Partial<AgcParams>,
      })
      // storage는 항상 갱신: 다음 탭 캡처 시 사용될 기본값
      void saveParams(currentParams)
      updateBars(lastState, currentParams)
    })
  }
}

function setupReset(): void {
  $<HTMLButtonElement>('reset-btn').addEventListener('click', () => {
    currentParams = { ...DEFAULT_AGC_PARAMS }
    applyParamsToUi(currentParams)
    void sendCapture<SimpleResponse>({
      type: 'SET_PARAMS',
      tabId: targetTabId(),
      params: currentParams,
    })
    void saveParams(currentParams)
  })
}

function fmtNum(val: number, suffix: string): string {
  return isFinite(val) ? `${val.toFixed(1)}${suffix}` : '—'
}

function setMeterEmpty(): void {
  $('meter-lufs').textContent = '—'
  $('meter-dbfs').textContent = '—'
  $('meter-gain').textContent = '—'
  const status = $('meter-status')
  status.textContent = 'OFF'
  status.className = 'm-val'
  lastState = null
  updateBars(null, currentParams)
}

async function pollMeasurement(): Promise<void> {
  if (currentTabId === null) {
    setMeterEmpty()
    return
  }
  const res = await sendCapture<MeasurementResponse>({
    type: 'GET_MEASUREMENT',
    tabId: currentTabId,
  })
  if (!res || !res.found) {
    setMeterEmpty()
    return
  }
  $('meter-lufs').textContent = fmtNum(res.lufs, ' LUFS')
  $('meter-dbfs').textContent = fmtNum(res.dbfs, ' dBFS')
  const gainSign = res.gainDb >= 0 ? '+' : ''
  $('meter-gain').textContent = `${gainSign}${res.gainDb.toFixed(1)} dB`
  const status = $('meter-status')
  if (res.gated) {
    status.textContent = 'GATED'
    status.className = 'm-val gated'
  } else {
    status.textContent = 'TRACKING'
    status.className = 'm-val tracking'
  }
  lastState = { lufs: res.lufs, gainDb: res.gainDb }
  updateBars(lastState, currentParams)
}

let pollHandle: number | null = null

function startPolling(): void {
  if (pollHandle !== null) return
  void pollMeasurement()
  pollHandle = window.setInterval(() => void pollMeasurement(), POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollHandle !== null) {
    window.clearInterval(pollHandle)
    pollHandle = null
  }
}

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  currentTabId = tab?.id ?? null
  $('tab-title').textContent = tab?.title ?? '(현재 탭 없음)'

  setupSliders()
  setupReset()
  $<HTMLButtonElement>('toggle-btn').addEventListener('click', () => {
    void onToggleClick()
  })

  // refreshToggleState가 isCurrentTabActive를 설정 → loadAndApplyParams가 이를 사용하므로 순차 실행.
  await refreshToggleState()
  await loadAndApplyParams()
  startPolling()
}

document.addEventListener('DOMContentLoaded', () => {
  void init()
})

window.addEventListener('beforeunload', stopPolling)
