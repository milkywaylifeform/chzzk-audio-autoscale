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
  action: {
    default_title: 'Chzzk Audio Auto-Scale',
    default_popup: 'src/popup/popup.html',
  },
  web_accessible_resources: [
    {
      resources: ['src/offscreen/offscreen.html', 'loudness-processor.js'],
      matches: ['<all_urls>'],
    },
  ],
})
