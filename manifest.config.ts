import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

export default defineManifest({
  manifest_version: 3,
  name: 'Chzzk Audio Auto-Scale',
  version: pkg.version,
  description: pkg.description,
  minimum_chrome_version: '116',
  permissions: ['tabCapture', 'offscreen', 'activeTab', 'tabs', 'storage'],
  host_permissions: ['https://chzzk.naver.com/*'],
  background: {
    service_worker: 'src/service-worker.ts',
    type: 'module',
  },
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    64: 'icons/icon-64.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'Chzzk Audio Auto-Scale',
    default_popup: 'src/popup/popup.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
    },
  },
  web_accessible_resources: [
    {
      resources: ['src/offscreen/offscreen.html', 'loudness-processor.js'],
      matches: ['<all_urls>'],
    },
  ],
})
