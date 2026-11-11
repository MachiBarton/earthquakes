#!/usr/bin/env node
/**
 * 构建期快照：全国省/市/县三级行政区划中心点（地图注记渐进展示用）。
 *
 * 数据源：阿里云 DataV GeoAtlas（https://geo.datav.aliyun.com/areas_v3/），
 * 仅取各要素 properties 的 name/adcode/level/center（或 centroid），不取几何。
 * 层级拉取：100000_full（省）→ 各省 _full（地级）→ 各地级 _full（县级）。
 * 无下级文件的区划（如东莞、台湾）返回 404，跳过其下级。
 *
 * 输出 public/data/cities.json（提交入库，运行时只读快照，避免浏览器跨域与
 * 运行时依赖外部服务）。places 的 level 仅 'city'（地级，含直辖市）与
 * 'county'（县级）两档；省会/主要城市由前端 src/quake/cities.ts 的手写名单
 * 覆盖为最高优先级，脚本按 displayName 去重跳过这些名字。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const BASE = 'https://geo.datav.aliyun.com/areas_v3/bound/';
const OUT = resolve(process.cwd(), 'public/data/cities.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 与 src/quake/cities.ts 的省会/主要城市名单保持一致（displayName 去重用）。 */
const TIER0_NAMES = new Set([
  '北京', '天津', '石家庄', '太原', '呼和浩特', '沈阳', '长春', '哈尔滨', '上海', '南京',
  '杭州', '合肥', '福州', '南昌', '济南', '郑州', '武汉', '长沙', '广州', '南宁',
  '海口', '重庆', '成都', '贵阳', '昆明', '拉萨', '西安', '兰州', '西宁', '银川',
  '乌鲁木齐', '台北', '香港', '澳门',
  '深圳', '大连', '青岛', '厦门', '高雄', '花莲', '唐山', '绵阳', '喀什',
]);

/** 展示名：去掉常见行政后缀；自治州保留全称（截断会产生歧义）。 */
function displayName(name) {
  if (name.endsWith('自治州')) return name;
  return name.replace(/(市辖区|林区|地区|盟|市|区|县|旗)$/, '') || name;
}

async function fetchJson(code) {
  const url = `${BASE}${code}_full.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404) return null; // 无下级行政区划（东莞/台湾等）
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

/** 固定并发池，避免对数据源造成压力。 */
async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function pickCenter(feature) {
  const point = feature?.properties?.center ?? feature?.properties?.centroid;
  if (!Array.isArray(point) || point.length < 2) return null;
  const [lon, lat] = point;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

async function main() {
  const root = await fetchJson('100000');
  const provinces = (root?.features ?? []).filter(
    (f) => f.properties?.level === 'province' && typeof f.properties?.adcode === 'number',
  );
  if (provinces.length < 30) {
    throw new Error(`省级要素过少（${provinces.length}），拒绝继续`);
  }

  const places = new Map(); // adcode -> place
  const addPlace = (adcode, name, level, center) => {
    const short = displayName(name);
    if (!short || TIER0_NAMES.has(short)) return; // 省会/主要城市由前端手写名单负责
    if (places.has(adcode)) return;
    places.set(adcode, { adcode, name: short, lon: center.lon, lat: center.lat, level });
  };

  // 直辖市本身即地级口径。
  for (const feature of provinces) {
    const code = String(feature.properties.adcode);
    if (/^(11|12|31|50)/.test(code)) {
      const center = pickCenter(feature);
      if (center) addPlace(feature.properties.adcode, feature.properties.name, 'city', center);
    }
  }

  const provinceFiles = await pool(provinces, 6, async (feature) => {
    const code = String(feature.properties.adcode);
    return { code, json: await fetchJson(code) };
  });

  const cityFeatures = [];
  for (const { json } of provinceFiles) {
    for (const feature of json?.features ?? []) {
      const level = feature.properties?.level;
      if (level !== 'city' && level !== 'district') continue;
      const center = pickCenter(feature);
      if (!center) continue;
      if (level === 'district') {
        // 省直辖县级行政区（如仙桃、济源），直接归县级。
        addPlace(feature.properties.adcode, feature.properties.name, 'county', center);
      } else {
        cityFeatures.push(feature);
        addPlace(feature.properties.adcode, feature.properties.name, 'city', center);
      }
    }
  }

  const districtFiles = await pool(cityFeatures, 6, async (feature) => {
    const code = String(feature.properties.adcode);
    return { code, json: await fetchJson(code) };
  });
  let missingDistrictFiles = 0;
  for (const { code, json } of districtFiles) {
    if (!json) {
      missingDistrictFiles += 1;
      continue;
    }
    for (const feature of json.features ?? []) {
      if (feature.properties?.level !== 'district') continue;
      const center = pickCenter(feature);
      if (!center) continue;
      addPlace(feature.properties.adcode, feature.properties.name, 'county', center);
    }
  }

  const list = [...places.values()].sort((a, b) => a.adcode - b.adcode);
  const counts = {
    city: list.filter((p) => p.level === 'city').length,
    county: list.filter((p) => p.level === 'county').length,
  };
  if (list.length < 1000) {
    throw new Error(`快照仅 ${list.length} 条，疑似抓取不完整，拒绝覆盖 ${OUT}`);
  }

  const payload = {
    source: 'https://geo.datav.aliyun.com/areas_v3/',
    sourceName: '阿里云 DataV GeoAtlas（行政区划中心点）',
    fetchedAt: new Date().toISOString(),
    counts: { ...counts, total: list.length, missingDistrictFiles },
    places: list,
  };
  let previous = null;
  try {
    previous = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    /* 首跑无旧文件 */
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(
    `[fetch:cities] 地级 ${counts.city} / 县级 ${counts.county} / 合计 ${list.length}` +
      `（缺下级文件 ${missingDistrictFiles}）→ ${OUT}` +
      (previous ? `（覆盖旧快照 ${previous.counts?.total ?? '?'} 条）` : ''),
  );
}

main().catch((error) => {
  console.error('[fetch:cities] 失败:', error?.message ?? error);
  process.exitCode = 1;
});
