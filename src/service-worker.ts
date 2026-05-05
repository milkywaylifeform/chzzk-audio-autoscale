import type { CaptureMessage, CaptureResponse } from './messages'

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html'

interface TabState {
  streamId: string
  enabledAt: number
}

const tabStates = new Map<number, TabState>()

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  return contexts.length > 0
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification:
      '치지직 탭의 오디오를 가로채 음량 정규화(AGC) 처리를 위해 백그라운드 오디오 컨텍스트가 필요합니다.',
  })
}

async function closeOffscreenIfEmpty(): Promise<void> {
  if (tabStates.size > 0) return
  if (!(await hasOffscreenDocument())) return
  await chrome.offscreen.closeDocument()
}

async function send(msg: CaptureMessage): Promise<CaptureResponse> {
  return chrome.runtime.sendMessage<CaptureMessage, CaptureResponse>(msg)
}

async function getStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const err = chrome.runtime.lastError
      if (err || !streamId) {
        reject(new Error(err?.message ?? 'tabCapture 실패: streamId 없음'))
        return
      }
      resolve(streamId)
    })
  })
}

async function startForTab(tabId: number): Promise<void> {
  const streamId = await getStreamId(tabId)
  await ensureOffscreenDocument()
  tabStates.set(tabId, { streamId, enabledAt: Date.now() })

  const res = await send({ type: 'START_CAPTURE', tabId, streamId })
  if (!res.ok) {
    tabStates.delete(tabId)
    await closeOffscreenIfEmpty()
    throw new Error(`오프스크린 캡처 시작 실패: ${res.error}`)
  }
  await chrome.action.setBadgeText({ tabId, text: 'ON' })
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#00C73C' })
}

async function stopForTab(tabId: number): Promise<void> {
  if (!tabStates.has(tabId)) return
  await send({ type: 'STOP_CAPTURE', tabId })
  tabStates.delete(tabId)
  await closeOffscreenIfEmpty()
  await chrome.action.setBadgeText({ tabId, text: '' })
}

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    if (!tab.id) return
    try {
      if (tabStates.has(tab.id)) {
        await stopForTab(tab.id)
      } else {
        await startForTab(tab.id)
      }
    } catch (e) {
      console.error('[sound-autoscale] 토글 실패:', e)
    }
  })()
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void stopForTab(tabId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && tabStates.has(tabId)) {
    void stopForTab(tabId)
  }
})

console.log('[sound-autoscale] service worker 시작')
