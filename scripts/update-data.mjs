#!/usr/bin/env node
/**
 * 一次性收集全部数据源并写入 public/data/：
 *   1. fetch-earthquakes.mjs  CEIC 中国地震台网中心地震速报（页面核心数据）
 *   2. fetch-cities.mjs       阿里云 DataV GeoAtlas 行政区划中心点（城市渐进注记）
 *   3. fetch-plates.mjs       PB2002 板块边界模型（全球板块图层）
 * 任一数据源失败即以非零码退出并中止后续收集（CI 定时任务据此不提交、不部署）。
 * 用法：npm run update:data
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const steps = ['fetch-earthquakes.mjs', 'fetch-cities.mjs', 'fetch-plates.mjs'];

for (const step of steps) {
  console.log(`\n=== ${step} ===`);
  const result = spawnSync(process.execPath, [join(scriptsDir, step)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`[update-data] ${step} 失败（exit ${result.status}），中止后续收集。`);
    process.exit(result.status || 1);
  }
}

console.log('\n[update-data] 全部数据源已更新。');
