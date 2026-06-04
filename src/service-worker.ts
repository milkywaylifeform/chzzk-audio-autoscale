import type {
  ActiveTab,
  ActiveTabsResponse,
  CaptureMessage,
  SimpleResponse,
} from './messages'
import { loadParams } from './storage'

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html'

// 동시 활성 탭 한도. Phase 4에서 사용자 설정으로 노출 예정(1~8).
const MAX_ACTIVE_TABS = 4

// 배지 디자인:
// - 'ON' (녹색): 캡처 진행 중
// - '!'  (주황): 풀 네비게이션·새로고침 등으로 캡처가 끊어짐 — 재클릭 필요
// - ''   (없음): 비활성
const BADGE_ON = { text: 'ON', color: '#00C73C' }
const BADGE_REACTIVATE = { text: '!', color: '#FFA500' }

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

async function getActiveTabs(): Promise<ActiveTab[]> {
  if (!(await hasOffscreenDocument())) return []
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'GET_ACTIVE_TABS',
    } satisfies CaptureMessage)) as ActiveTabsResponse | undefined
    return res?.activeTabs ?? []
  } catch (e) {
    console.warn('[sound-autoscale] GET_ACTIVE_TABS 실패:', e)
    return []
  }
}

async function closeOffscreenIfEmpty(): Promise<void> {
  if (!(await hasOffscreenDocument())) return
  const active = await getActiveTabs()
  if (active.length === 0) {
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

/**
 * LRU 기반 한도 관리. 새 탭이 추가되어 한도를 초과하면 가장 오래된
 * (startedAt이 가장 작은) 탭부터 자동으로 종료한다.
 */
async function enforceLruLimit(reservingForTabId: number): Promise<void> {
  const active = await getActiveTabs()
  // 새로 추가될 탭을 위한 자리를 미리 비운다(active.length + 1 > MAX 일 때).
  if (active.length < MAX_ACTIVE_TABS) return

  const candidates = active
    .filter((t) => t.tabId !== reservingForTabId)
    .sort((a, b) => a.startedAt - b.startedAt)
  const evictCount = active.length - MAX_ACTIVE_TABS + 1
  for (let i = 0; i < evictCount && i < candidates.length; i++) {
    const victim = candidates[i]
    console.log(
      `[sound-autoscale] LRU 자동 해제: tab ${victim.tabId} (한도 ${MAX_ACTIVE_TABS}개)`,
    )
    await stopForTab(victim.tabId)
  }
}

async function startForTab(tabId: number): Promise<void> {
  await enforceLruLimit(tabId)
  const streamId = await getStreamId(tabId)
  await ensureOffscreenDocument()
  // 오프스크린은 chrome.storage 접근이 안 되므로 SW가 읽어 전달한다.
  const params = await loadParams()
  const res = await send({ type: 'START_CAPTURE', tabId, streamId, params })
  if (!res.ok) {
    await closeOffscreenIfEmpty()
    throw new Error(`오프스크린 캡처 시작 실패: ${res.error}`)
  }
  await chrome.action.setBadgeText({ tabId, text: BADGE_ON.text })
  await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_ON.color })
}

async function stopForTab(tabId: number, finalBadgeText: string = ''): Promise<void> {
  if (await hasOffscreenDocument()) {
    await send({ type: 'STOP_CAPTURE', tabId })
    await closeOffscreenIfEmpty()
  }
  await chrome.action.setBadgeText({ tabId, text: finalBadgeText })
  if (finalBadgeText === BADGE_REACTIVATE.text) {
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: BADGE_REACTIVATE.color,
    })
  }
}

// 팝업 UI에서 TOGGLE_TAB 메시지로 토글 요청. (action.onClicked는 default_popup이
// 설정되면 더 이상 발화하지 않으므로 여기서 처리.)
chrome.runtime.onMessage.addListener((msg: CaptureMessage, _sender, sendResponse) => {
  if (msg.type === 'TOGGLE_TAB') {
    void (async () => {
      try {
        const active = await getActiveTabs()
        const isActive = active.some((t) => t.tabId === msg.tabId)
        if (isActive) {
          await stopForTab(msg.tabId)
        } else {
          await startForTab(msg.tabId)
        }
        sendResponse({ ok: true } satisfies SimpleResponse)
      } catch (e) {
        console.error('[sound-autoscale] 토글 실패:', e)
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        } satisfies SimpleResponse)
      }
    })()
    return true
  }
  // SET_PARAMS, GET_PARAMS, GET_ACTIVE_TABS, START/STOP_CAPTURE는 offscreen이 처리.
  // SW는 자기 책임 메시지가 아니면 false 반환하여 sendResponse 권한을 양보.
  return false
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void stopForTab(tabId)
})

// 풀 네비게이션·새로고침 감지: 활성 탭이 loading 상태로 들어가면 캡처가 끊긴다.
// 자동 재획득은 user activation 제약으로 불가하므로, 사용자에게 재클릭이 필요함을
// 배지('!' 주황)로 시각적으로 알린다.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return
  void (async () => {
    const active = await getActiveTabs()
    const wasActive = active.some((t) => t.tabId === tabId)
    if (!wasActive) return
    await stopForTab(tabId, BADGE_REACTIVATE.text)
  })()
})

console.log('[sound-autoscale] service worker 시작')
