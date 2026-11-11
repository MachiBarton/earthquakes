import { cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Copy CesiumJS static assets into public/cesium so that both the dev server
// and the production build can resolve CESIUM_BASE_URL = "cesium/"（相对文档基址解析）.
// Idempotent; safe to run on every postinstall / predev.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'cesium', 'Build', 'Cesium');
const target = join(root, 'public', 'cesium');

for (const dir of ['Workers', 'Assets', 'ThirdParty', 'Widgets']) {
  await cp(join(source, dir), join(target, dir), { recursive: true });
}

console.log('[copy-cesium] static assets ready at public/cesium');
