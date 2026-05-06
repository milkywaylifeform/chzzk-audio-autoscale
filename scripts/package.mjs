// 크롬 웹 스토어 제출용 ZIP 빌드.
// 사전 조건: `npm run build`로 dist/가 최신 상태일 것.
// 출력: releases/chzzk-audio-autoscale-<version>.zip

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const distDir = resolve(root, 'dist')
const releasesDir = resolve(root, 'releases')

if (!existsSync(distDir)) {
  console.error('dist/ 디렉토리가 없습니다. 먼저 `npm run build`를 실행하세요.')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const zipName = `chzzk-audio-autoscale-${pkg.version}.zip`
const zipPath = resolve(releasesDir, zipName)

mkdirSync(releasesDir, { recursive: true })
if (existsSync(zipPath)) rmSync(zipPath)

// dist/ 내부를 zip 루트에 두기 위해 cwd를 dist로 잡고 . 을 zip
execFileSync('zip', ['-r', zipPath, '.'], {
  cwd: distDir,
  stdio: 'inherit',
})

console.log(`\n✓ ${zipPath}`)
