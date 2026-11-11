/**
 * 抓取中国地震台网中心（CEIC, https://www.ceic.ac.cn/）公开地震目录快照。
 *
 * 数据端点：https://www.ceic.ac.cn/data/data.json
 * （CEIC 官网「地震目录」页面自身使用的静态 JSON，字段：
 *   id / time / latitude / longitude / depth / magnitude / location）
 *
 * 浏览器端直连该端点会被 CORS 拦截（响应无 Access-Control-Allow-Origin），
 * 因此在构建期用本脚本抓取并落盘到 public/data/earthquakes.json，
 * 页面运行时只读取本地快照。需要更新数据时执行：npm run fetch:quakes
 *
 * 处理规则：
 * - 只保留当年 1 月 1 日起的事件（与页面需求「1 月至今」一致）。
 * - 按省级前缀白名单判定国内/国外，并提取省份短名；国外事件 province 为 null。
 * - 校验字段合法性（有限数值、时间可解析），跳过非法条目并按 id 去重。
 * - 输出按时间倒序。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://www.ceic.ac.cn/data/data.json';
const SITE = 'https://www.ceic.ac.cn/';
const SOURCE_NAME = '中国地震台网中心 CENC';
const TIMEOUT_MS = 30_000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * 省级行政区短名白名单（CEIC location 字段使用短名，如「新疆阿克苏地区库车市」
 * 「内蒙古呼伦贝尔市…」）。按长度降序匹配，保证「内蒙古/黑龙江」优先于两字省名。
 */
const PROVINCES = [
  '内蒙古',
  '黑龙江',
  '北京',
  '天津',
  '河北',
  '山西',
  '辽宁',
  '吉林',
  '上海',
  '江苏',
  '浙江',
  '安徽',
  '福建',
  '江西',
  '山东',
  '河南',
  '湖北',
  '湖南',
  '广东',
  '广西',
  '海南',
  '重庆',
  '四川',
  '贵州',
  '云南',
  '西藏',
  '陕西',
  '甘肃',
  '青海',
  '宁夏',
  '新疆',
  '台湾',
  '香港',
  '澳门',
].sort((a, b) => b.length - a.length);

function matchProvince(location) {
  if (typeof location !== 'string') return null;
  for (const p of PROVINCES) {
    if (location.startsWith(p)) return p;
  }
  return null;
}

function toNumber(value) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** 解析 "YYYY-MM-DD HH:mm:ss"（CEIC 使用北京时间）为 UTC ISO 字符串；非法返回 null。 */
function parseTime(time) {
  if (typeof time !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+08:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchCatalog() {
  const res = await fetch(ENDPOINT, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`CEIC 数据请求失败：HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('CEIC 数据格式异常：期望数组');
  }
  return data;
}

function normalize(raw, yearStartIso) {
  const events = [];
  const seen = new Set();
  let skipped = 0;
  let beforeRange = 0;

  for (const item of raw) {
    const iso = parseTime(item?.time);
    const lat = toNumber(item?.latitude);
    const lon = toNumber(item?.longitude);
    const mag = toNumber(item?.magnitude);
    const depth = toNumber(item?.depth);
    const location = typeof item?.location === 'string' ? item.location.trim() : '';
    const id = typeof item?.id === 'string' ? item.id.trim() : '';

    if (!iso || lat === null || lon === null || mag === null || !location) {
      skipped += 1;
      continue;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      skipped += 1;
      continue;
    }
    if (iso < yearStartIso) {
      beforeRange += 1;
      continue;
    }
    const key = id || `${iso}|${lat}|${lon}|${mag}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const province = matchProvince(location);
    events.push({
      id: id || key,
      time: iso,
      // 同时保留 CEIC 原始北京时间字符串，便于页面直接展示。
      timeText: String(item.time).trim(),
      lat,
      lon,
      depth: depth ?? null,
      mag,
      location,
      province,
      domestic: province !== null,
    });
  }

  events.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  return { events, skipped, beforeRange };
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const now = new Date();
  // 北京时间当年 1 月 1 日 00:00 起。
  const bjYear = new Date(now.getTime() + 8 * 3600 * 1000).getUTCFullYear();
  const yearStartIso = new Date(`${bjYear}-01-01T00:00:00+08:00`).toISOString();

  console.log(`[fetch-earthquakes] GET ${ENDPOINT}`);
  const raw = await fetchCatalog();
  const { events, skipped, beforeRange } = normalize(raw, yearStartIso);

  if (events.length === 0) {
    throw new Error('CEIC 数据经过滤后为空，拒绝覆盖已有快照');
  }

  const payload = {
    source: SITE,
    sourceName: SOURCE_NAME,
    endpoint: ENDPOINT,
    fetchedAt: now.toISOString(),
    rangeStart: `${bjYear}-01-01`,
    rangeEnd: events[0].timeText.slice(0, 10),
    totalInSource: raw.length,
    skippedInvalid: skipped,
    excludedBeforeRange: beforeRange,
    count: events.length,
    events,
  };

  const outPath = join(root, 'public', 'data', 'earthquakes.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload), 'utf8');

  const domestic = events.filter((e) => e.domestic).length;
  const maxMag = events.reduce((m, e) => Math.max(m, e.mag), 0);
  console.log(
    `[fetch-earthquakes] 写入 ${outPath}\n` +
      `  范围 ${payload.rangeStart} ~ ${payload.rangeEnd}，共 ${events.length} 条` +
      `（国内 ${domestic} / 国外 ${events.length - domestic}），最大震级 M${maxMag}；` +
      `跳过非法 ${skipped} 条，早于范围 ${beforeRange} 条`,
  );
}

main().catch((err) => {
  console.error(`[fetch-earthquakes] 失败：${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
