export type CaptureMessage =
  | { type: 'START_CAPTURE'; tabId: number; streamId: string }
  | { type: 'STOP_CAPTURE'; tabId: number }

export type CaptureResponse = { ok: true } | { ok: false; error: string }
