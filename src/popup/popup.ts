import { DEFAULT_AGC_PARAMS } from '../agc'
import type {
  ActiveTabsResponse,
  AgcParams,
  CaptureMessage,
  ParamsResponse,
  SimpleResponse,
} from '../messages'

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
let currentParams: AgcParams = { ...DEFAULT_AGC_PARAMS }

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
    return
  }
  btn.disabled = false
  const res = await sendCapture<ActiveTabsResponse>({ type: 'GET_ACTIVE_TABS' })
  const isActive = res?.activeTabs?.some((t) => t.tabId === currentTabId) ?? false
  btn.textContent = isActive ? 'ON' : 'OFF'
  btn.classList.toggle('active', isActive)
  btn.classList.remove('reactivate')
}

async function onToggleClick(): Promise<void> {
  if (currentTabId === null) return
  const btn = $<HTMLButtonElement>('toggle-btn')
  btn.disabled = true
  const res = await sendCapture<SimpleResponse>({
    type: 'TOGGLE_TAB',
    tabId: currentTabId,
  })
  if (res && !res.ok) {
    console.error('[popup] 토글 실패:', res.error)
  }
  await refreshToggleState()
}

async function loadParams(): Promise<void> {
  const res = await sendCapture<ParamsResponse>({ type: 'GET_PARAMS' })
  currentParams = res?.params ?? { ...DEFAULT_AGC_PARAMS }
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
      void sendCapture<SimpleResponse>({
        type: 'SET_PARAMS',
        params: { [key]: val } as Partial<AgcParams>,
      })
    })
  }
}

function setupReset(): void {
  $<HTMLButtonElement>('reset-btn').addEventListener('click', () => {
    currentParams = { ...DEFAULT_AGC_PARAMS }
    applyParamsToUi(currentParams)
    void sendCapture<SimpleResponse>({
      type: 'SET_PARAMS',
      params: currentParams,
    })
  })
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

  await Promise.all([refreshToggleState(), loadParams()])
}

document.addEventListener('DOMContentLoaded', () => {
  void init()
})
