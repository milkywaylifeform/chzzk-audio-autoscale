import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

export default defineManifest({
  manifest_version: 3,
  name: 'Chzzk Audio Auto-Scale',
  version: pkg.version,
  description: pkg.description,
  minimum_chrome_version: '116',
  permissions: ['tabCapture', 'offscreen', 'activeTab', 'tabs'],
  host_permissions: ['https://chzzk.naver.com/*'],
  background: {
    service_worker: 'src/service-worker.ts',
    type: 'module',
  },
  action: {
    default_title: '클릭하여 오디오 오토 스케일링 켜기/끄기',
  },
  web_accessible_resources: [
    {
      resources: ['src/offscreen/offscreen.html', 'loudness-processor.js'],
      matches: ['<all_urls>'],
    },
  ],
})
