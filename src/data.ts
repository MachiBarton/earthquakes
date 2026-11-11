/**
 * 地震数据契约与加载（快照 public/data/earthquakes.json，运行时 fetch './data/earthquakes.json'）。
 *
 * 契约（由 scripts/fetch-earthquakes.mjs 生成，本模块只读）：
 * - 顶层：source / sourceName / fetchedAt(ISO) / rangeStart("2026-01-01") /
 *   rangeEnd / count / events[]
 * - event：{ id, time(UTC ISO), timeText(北京时间 "YYYY-MM-DD HH:mm:ss"),
 *   lat, lon(WGS84), depth(km|null), mag, location, province(省级短名|null),
 *   domestic }
 *
 * 加载带 AbortController 超时（10s）与中文错误提示；不打印原始数据到 console。
 */
import type { CityPlace } from './cities';
import type { PlateLine } from './plates';

/** 单条地震事件（WGS84 坐标，lat/lon 顺序与 Cesium 的 lon/lat 相反，注意转换）。 */
export interface QuakeEvent {
  id: string;
  /** UTC ISO 时间，如 "2026-11-10T03:09:41.000Z"。 */
  time: string;
  /** 北京时间展示文本 "YYYY-MM-DD HH:mm:ss"。 */
  timeText: string;
  lat: number;
  lon: number;
  /** 深度 km，源数据可能为 null。 */
  depth: number | null;
  mag: number;
  /** 完整地点字符串，聚合分组键（如 "西藏昌都市八宿县"）。 */
  location: string;
  /** 国内为省级短名，国外为 null。 */
  province: string | null;
  domestic: boolean;
}

/** 快照顶层结构。 */
export interface QuakeSnapshot {
  source: string;
  sourceName: string;
  fetchedAt: string;
  rangeStart: string;
  rangeEnd: string;
  count: number;
  events: QuakeEvent[];
}

export const DATA_URL = './data/earthquakes.json';

/** fetch 超时预算（任务契约：10s）。 */
export const FETCH_TIMEOUT_MS = 10_000;

export const DATA_TIMEOUT_MESSAGE = '地震数据请求超时（10 秒），请检查网络后重试';
export const DATA_HTTP_MESSAGE_PREFIX = '地震数据加载失败（HTTP ';
export const DATA_INVALID_MESSAGE = '地震数据格式不符合契约，请运行 npm run fetch:quakes 重新生成';

/** 中国地震台网中心（CEIC）官网，页脚署名链接。 */
export const CEIC_URL = 'https://www.ceic.ac.cn/';
export const CEIC_SOURCE_NAME = '中国地震台网中心 CENC';

function isQuakeEvent(value: unknown): value is QuakeEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.time === 'string' &&
    typeof e.timeText === 'string' &&
    typeof e.lat === 'number' &&
    Number.isFinite(e.lat) &&
    typeof e.lon === 'number' &&
    Number.isFinite(e.lon) &&
    typeof e.mag === 'number' &&
    Number.isFinite(e.mag) &&
    (e.depth === null || (typeof e.depth === 'number' && Number.isFinite(e.depth))) &&
    typeof e.location === 'string' &&
    (e.province === null || typeof e.province === 'string') &&
    typeof e.domestic === 'boolean'
  );
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * 校验并收窄快照结构：events 必须是非空数组，逐条通过 isQuakeEvent 守卫，
 * 不合规条目丢弃（不打印内容，只保留计数用于内部校验）。
 */
export function parseSnapshot(raw: unknown): QuakeSnapshot {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(DATA_INVALID_MESSAGE);
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.events)) {
    throw new Error(DATA_INVALID_MESSAGE);
  }
  const events = (r.events as unknown[]).filter(isQuakeEvent);
  if (events.length === 0) {
    throw new Error(DATA_INVALID_MESSAGE);
  }
  return {
    source: stringField(r.source, CEIC_URL),
    sourceName: stringField(r.sourceName, CEIC_SOURCE_NAME),
    fetchedAt: stringField(r.fetchedAt, ''),
    rangeStart: stringField(r.rangeStart, '2026-01-01'),
    rangeEnd: stringField(r.rangeEnd, ''),
    count: events.length,
    events,
  };
}

/**
 * 加载地震快照。
 * - 内置 10s AbortController 超时；调用方可传入自己的 signal（组件卸载时 abort）。
 * - 超时 → 中文超时错误；外部 abort → 原样抛出 AbortError（调用方自行忽略）。
 * - 不打印原始数据到 console。
 */
export async function loadEarthquakes(externalSignal?: AbortSignal): Promise<QuakeSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('timeout', 'TimeoutError'));
  }, FETCH_TIMEOUT_MS);
  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  try {
    const response = await fetch(DATA_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${DATA_HTTP_MESSAGE_PREFIX}${response.status}）`);
    }
    const raw: unknown = await response.json();
    return parseSnapshot(raw);
  } catch (error) {
    // 区分「10s 超时」与「调用方卸载 abort」：后者原样抛出，由调用方忽略。
    if (controller.signal.aborted && !(externalSignal?.aborted ?? false)) {
      throw new Error(DATA_TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/* ---------- 城市注记快照（public/data/cities.json，可选图层数据） ---------- */

export const CITIES_URL = './data/cities.json';

export const CITIES_INVALID_MESSAGE =
  '城市注记数据格式不符合契约，请运行 npm run fetch:cities 重新生成';

function isCityPlace(value: unknown): value is CityPlace {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const p = value as Record<string, unknown>;
  return (
    typeof p.adcode === 'number' &&
    Number.isFinite(p.adcode) &&
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    typeof p.lon === 'number' &&
    Number.isFinite(p.lon) &&
    typeof p.lat === 'number' &&
    Number.isFinite(p.lat) &&
    (p.level === 'city' || p.level === 'county')
  );
}

/**
 * 加载城市注记快照（地级/县级行政中心）。
 * 与地震快照同款的 10s 超时与 abort 语义；该数据仅服务于可选注记图层，
 * 加载失败由调用方降级为空列表（省会/主要城市手写名单仍可用）。
 */
export async function loadCityPlaces(externalSignal?: AbortSignal): Promise<CityPlace[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('timeout', 'TimeoutError'));
  }, FETCH_TIMEOUT_MS);
  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  try {
    const response = await fetch(CITIES_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${DATA_HTTP_MESSAGE_PREFIX}${response.status}）`);
    }
    const raw: unknown = await response.json();
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(CITIES_INVALID_MESSAGE);
    }
    const places = (raw as Record<string, unknown>).places;
    if (!Array.isArray(places)) {
      throw new Error(CITIES_INVALID_MESSAGE);
    }
    return (places as unknown[]).filter(isCityPlace);
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/* ---------- 板块边界快照（public/data/plates.json，可选图层数据） ---------- */

export const PLATES_URL = './data/plates.json';

export const PLATES_INVALID_MESSAGE =
  '板块边界数据格式不符合契约，请运行 npm run fetch:plates 重新生成';

function isPlateLine(value: unknown): value is PlateLine {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const line = value as Record<string, unknown>;
  if (typeof line.name !== 'string' || !Array.isArray(line.points) || line.points.length < 2) {
    return false;
  }
  return line.points.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      typeof point[0] === 'number' &&
      Number.isFinite(point[0]) &&
      typeof point[1] === 'number' &&
      Number.isFinite(point[1]),
  );
}

/**
 * 加载全球板块边界快照（PB2002, Bird 2003）。
 * 与城市注记同款的可选图层语义：10s 超时，失败由调用方降级为空列表，
 * 不占主数据错误通道。
 */
export async function loadPlateLines(externalSignal?: AbortSignal): Promise<PlateLine[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('timeout', 'TimeoutError'));
  }, FETCH_TIMEOUT_MS);
  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  try {
    const response = await fetch(PLATES_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${DATA_HTTP_MESSAGE_PREFIX}${response.status}）`);
    }
    const raw: unknown = await response.json();
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(PLATES_INVALID_MESSAGE);
    }
    const lines = (raw as Record<string, unknown>).lines;
    if (!Array.isArray(lines)) {
      throw new Error(PLATES_INVALID_MESSAGE);
    }
    return (lines as unknown[]).filter(isPlateLine);
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
