/**
 * 全球板块边界快照管线：PB2002（Bird, 2003）→ public/data/plates.json。
 *
 * 来源：fraxen/tectonicplates 仓库镜像的 PB2002_boundaries.json（GeoJSON
 * LineString FeatureCollection，241 条边界，属性含 PlateA/PlateB 板块代码对）。
 * 与地震/城市快照同款约定：Node 原生 fetch + UA + 30s 超时、坐标校验、
 * 结果不足时拒绝覆盖旧文件。输出为「白线 = 板块边界」图层数据，
 * 署名要求见 plates.json 的 sourceName（渲染页脚/图例需保留 PB2002 归属）。
 *
 * 运行：npm run fetch:plates
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL =
  'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json';
const SOURCE_NAME = 'PB2002 板块边界模型（Bird, 2003）';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) earth-atlas/0.1.0';
const FETCH_TIMEOUT_MS = 30_000;
/** 少于该线数视为异常响应（正常 241 条），拒绝覆盖旧快照。 */
const MIN_LINES = 200;

const OUTPUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'data',
  'plates.json',
);

/** 坐标保留 3 位小数（~100m，远超示意精度需求），并去掉连续重复点。 */
function normalizePoints(rawCoordinates) {
  const points = [];
  for (const coord of rawCoordinates) {
    if (!Array.isArray(coord) || coord.length < 2) {
      continue;
    }
    const lon = Number(coord[0]);
    const lat = Number(coord[1]);
    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      lon < -180 ||
      lon > 180 ||
      lat < -90 ||
      lat > 90
    ) {
      continue;
    }
    const rounded = [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000];
    const last = points[points.length - 1];
    if (last && last[0] === rounded[0] && last[1] === rounded[1]) {
      continue;
    }
    points.push(rounded);
  }
  return points;
}

function beltName(properties) {
  if (properties && typeof properties === 'object') {
    if (typeof properties.Name === 'string' && properties.Name.trim()) {
      return properties.Name.trim();
    }
    if (typeof properties.PlateA === 'string' && typeof properties.PlateB === 'string') {
      return `${properties.PlateA.trim()}-${properties.PlateB.trim()}`;
    }
  }
  return '';
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} @ ${url}`);
  }
  return response.json();
}

async function main() {
  console.log(`抓取 ${SOURCE_URL}`);
  const geojson = await fetchJson(SOURCE_URL);
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('响应不是 GeoJSON FeatureCollection');
  }

  const lines = [];
  let skipped = 0;
  for (const feature of geojson.features) {
    const geometry = feature?.geometry;
    if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
      skipped += 1;
      continue;
    }
    const points = normalizePoints(geometry.coordinates);
    if (points.length < 2) {
      skipped += 1;
      continue;
    }
    lines.push({ name: beltName(feature.properties), points });
  }

  if (lines.length < MIN_LINES) {
    throw new Error(`仅解析出 ${lines.length} 条边界（< ${MIN_LINES}），疑似异常响应，拒绝覆盖旧快照`);
  }

  const snapshot = {
    source: SOURCE_URL,
    sourceName: SOURCE_NAME,
    fetchedAt: new Date().toISOString(),
    count: lines.length,
    skippedInvalid: skipped,
    lines,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const json = `${JSON.stringify(snapshot)}\n`;
  await writeFile(OUTPUT_PATH, json, 'utf8');

  console.log(
    `已写入 ${OUTPUT_PATH}: ${lines.length} 条板块边界（跳过 ${skipped}），` +
      `${(json.length / 1024).toFixed(0)}KB`,
  );
}

main().catch((error) => {
  console.error('板块边界抓取失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
