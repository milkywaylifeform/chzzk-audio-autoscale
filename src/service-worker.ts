import type {
  ActiveTabsResponse,
  CaptureMessage,
  SimpleResponse,
} from './messages'

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html'

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

async function getActiveTabs(): Promise<Set<number>> {
  if (!(await hasOffscreenDocument())) return new Set()
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'GET_ACTIVE_TABS',
    } satisfies CaptureMessage)) as ActiveTabsResponse | undefined
    return new Set(res?.activeTabIds ?? [])
  } catch (e) {
    console.warn('[sound-autoscale] GET_ACTIVE_TABS 실패:', e)
    return new Set()
  }
}

async function closeOffscreenIfEmpty(): Promise<void> {
  if (!(await hasOffscreenDocument())) return
  const active = await getActiveTabs()
  if (active.size === 0) {
    await chrome.offscreen.closeDocument()
  }
}

async function send(msg: CaptureMessage): Promise<SimpleResponse> {
  return (await chrome.runtime.sendMessage(msg)) as SimpleResponse
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
  const res = await send({ type: 'START_CAPTURE', tabId, streamId })
  if (!res.ok) {
    await closeOffscreenIfEmpty()
    throw new Error(`오프스크린 캡처 시작 실패: ${res.error}`)
  }
  await chrome.action.setBadgeText({ tabId, text: 'ON' })
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#00C73C' })
}

async function stopForTab(tabId: number): Promise<void> {
  if (!(await hasOffscreenDocument())) {
    await chrome.action.setBadgeText({ tabId, text: '' })
    return
  }
  await send({ type: 'STOP_CAPTURE', tabId })
  await closeOffscreenIfEmpty()
  await chrome.action.setBadgeText({ tabId, text: '' })
}

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    if (!tab.id) return
    try {
      const active = await getActiveTabs()
      if (active.has(tab.id)) {
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
  if (changeInfo.status !== 'loading') return
  void (async () => {
    const active = await getActiveTabs()
    if (active.has(tabId)) {
      await stopForTab(tabId)
    }
  })()
})

console.log('[sound-autoscale] service worker 시작')
