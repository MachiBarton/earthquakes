/**
 * 聚合、色标、过滤与统计 —— 全部为纯函数，便于 vitest 单测（cluster.test.ts）。
 *
 * 注意：本模块不得 import cesium（cesium 的 ESM 入口在 vitest 下无法加载，
 * 见 src/layers/imagery.test.ts 头部说明）；颜色只输出 CSS hex，
 * Cesium.Color 转换留在地图适配层（components/MapCanvas.tsx）。
 */

import type { QuakeEvent } from './data';

/** 范围切换：仅国内（默认）/ 含国外。 */
export type QuakeScope = 'domestic' | 'all';

export interface QuakeFilters {
  scope: QuakeScope;
  /** 最小震级（含），滑块 1.0–6.0 步进 0.5。 */
  minMag: number;
  /** 起始月（含），"YYYY-MM"，按北京时间（timeText）取月。 */
  monthStart: string;
  /** 结束月（含），"YYYY-MM"。 */
  monthEnd: string;
}

/** 震级档位。 */
export type MagTier = 'lt3' | 'm3to4' | 'm4to5' | 'm5to6' | 'gte6';

export const MAG_COLOR_LT3 = '#3ba55d';
export const MAG_COLOR_3TO4 = '#f2c94c';
export const MAG_COLOR_4TO5 = '#f2994a';
export const MAG_COLOR_5TO6 = '#eb5757';
export const MAG_COLOR_GTE6 = '#9b51e0';

/** 色标边界：M<3 绿；3≤M<4 黄；4≤M<5 橙；5≤M<6 红；M≥6 紫。 */
export function magTier(mag: number): MagTier {
  if (mag < 3) return 'lt3';
  if (mag < 4) return 'm3to4';
  if (mag < 5) return 'm4to5';
  if (mag < 6) return 'm5to6';
  return 'gte6';
}

export function magColor(mag: number): string {
  switch (magTier(mag)) {
    case 'lt3':
      return MAG_COLOR_LT3;
    case 'm3to4':
      return MAG_COLOR_3TO4;
    case 'm4to5':
      return MAG_COLOR_4TO5;
    case 'm5to6':
      return MAG_COLOR_5TO6;
    case 'gte6':
      return MAG_COLOR_GTE6;
  }
}

/** 图例/分布共用的档位元信息（数据色标允许彩色，AGENTS.md 例外项）。 */
export const MAG_TIERS: ReadonlyArray<{ tier: MagTier; label: string; color: string }> = [
  { tier: 'lt3', label: 'M<3', color: MAG_COLOR_LT3 },
  { tier: 'm3to4', label: '3≤M<4', color: MAG_COLOR_3TO4 },
  { tier: 'm4to5', label: '4≤M<5', color: MAG_COLOR_4TO5 },
  { tier: 'm5to6', label: '5≤M<6', color: MAG_COLOR_5TO6 },
  { tier: 'gte6', label: 'M≥6', color: MAG_COLOR_GTE6 },
];

/** 国外事件 province 为 null 时统计归入的名称。 */
export const FOREIGN_PROVINCE_LABEL = '境外';

/**
 * 事件所属月份 "YYYY-MM"。
 * 采用北京时间 timeText（展示口径一致）；UTC time 在跨日边界会归错月
 * （如 2026-01-31T23:00Z 北京时间已是 2 月 1 日）。
 */
export function eventMonth(event: QuakeEvent): string {
  return event.timeText.slice(0, 7);
}

/** 月份范围过滤（含两端；空字符串视为无界）。 */
export function monthInRange(month: string, monthStart: string, monthEnd: string): boolean {
  if (monthStart && month < monthStart) return false;
  if (monthEnd && month > monthEnd) return false;
  return true;
}

/** 组合过滤：范围（国内/含国外）+ 最小震级（含）+ 月份范围（含）。 */
export function filterEvents(
  events: readonly QuakeEvent[],
  filters: QuakeFilters,
): QuakeEvent[] {
  return events.filter((e) => {
    if (filters.scope === 'domestic' && !e.domestic) return false;
    if (e.mag < filters.minMag) return false;
    return monthInRange(eventMonth(e), filters.monthStart, filters.monthEnd);
  });
}

/** 按 location 完整字符串分组的聚合结果。 */
export interface QuakeCluster {
  /** 分组键 = location 完整字符串（同时用作 Cesium Entity id）。 */
  key: string;
  location: string;
  /** 组内第一个事件的省份（同 location 省份一致；国外为 null）。 */
  province: string | null;
  /** 成员 lat/lon 平均值（质心），保留 4 位小数。 */
  lat: number;
  lon: number;
  count: number;
  maxMag: number;
  /** 组内最新一次地震的 UTC ISO 时间。 */
  latestTime: string;
  /** 组内成员，按时间倒序（与数据源顺序一致）。 */
  events: QuakeEvent[];
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * 按 event.location 完整字符串分组（=「同一地区」）。
 * 每组：centroid(成员 lat/lon 平均值)、count、maxMag、latestTime、成员时间倒序。
 */
export function groupByLocation(events: readonly QuakeEvent[]): QuakeCluster[] {
  interface Accumulator {
    key: string;
    province: string | null;
    sumLat: number;
    sumLon: number;
    count: number;
    maxMag: number;
    latestMs: number;
    latestTime: string;
    events: QuakeEvent[];
  }
  const byLocation = new Map<string, Accumulator>();
  for (const e of events) {
    let acc = byLocation.get(e.location);
    if (!acc) {
      acc = {
        key: e.location,
        province: e.province,
        sumLat: 0,
        sumLon: 0,
        count: 0,
        maxMag: -Infinity,
        latestMs: -Infinity,
        latestTime: '',
        events: [],
      };
      byLocation.set(e.location, acc);
    }
    acc.sumLat += e.lat;
    acc.sumLon += e.lon;
    acc.count += 1;
    acc.events.push(e);
    if (e.mag > acc.maxMag) acc.maxMag = e.mag;
    const ms = Date.parse(e.time);
    if (Number.isFinite(ms) && ms > acc.latestMs) {
      acc.latestMs = ms;
      acc.latestTime = e.time;
    }
  }
  const clusters: QuakeCluster[] = [];
  for (const acc of byLocation.values()) {
    acc.events.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    clusters.push({
      key: acc.key,
      location: acc.key,
      province: acc.province,
      lat: round4(acc.sumLat / acc.count),
      lon: round4(acc.sumLon / acc.count),
      count: acc.count,
      maxMag: acc.maxMag,
      latestTime: acc.latestTime,
      events: acc.events,
    });
  }
  return clusters;
}

/**
 * 核心点像素直径：按该地区最大震级分档 6/7/8/10/12（颜色已编码震级，
 * 尺寸再轻度同步，便于一眼区分严重度）。
 */
export function corePixelSize(maxMag: number): number {
  switch (magTier(maxMag)) {
    case 'lt3':
      return 6;
    case 'm3to4':
      return 7;
    case 'm4to5':
      return 8;
    case 'm5to6':
      return 10;
    case 'gte6':
      return 12;
  }
}

/**
 * 光晕（半透明外圈）像素直径：编码同一地区发生次数，8 + sqrt(count)*3.4，
 * 下限 10、上限 46（79 次的大组不至于遮住邻县）。取代旧版「N 次」文字标注。
 */
export function haloPixelSize(count: number): number {
  return Math.min(46, Math.max(10, 8 + Math.sqrt(Math.max(0, count)) * 3.4));
}

export interface ProvinceStat {
  name: string;
  count: number;
}

/** 省份次数统计（国外事件 province 为 null 归入「境外」），降序取前 topN，并列按名称排序保证确定性。 */
export function provinceStats(events: readonly QuakeEvent[], topN = 10): ProvinceStat[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const name = e.province ?? FOREIGN_PROVINCE_LABEL;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, topN);
}

export interface MagDistributionEntry {
  tier: MagTier;
  label: string;
  color: string;
  count: number;
}

/** 震级分布：<3 / 3–4 / 4–5 / 5–6 / ≥6 五档固定顺序计数（含 0）。 */
export function magDistribution(events: readonly QuakeEvent[]): MagDistributionEntry[] {
  const counts = new Map<MagTier, number>([
    ['lt3', 0],
    ['m3to4', 0],
    ['m4to5', 0],
    ['m5to6', 0],
    ['gte6', 0],
  ]);
  for (const e of events) {
    const tier = magTier(e.mag);
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
  }
  return MAG_TIERS.map((t) => ({ ...t, count: counts.get(t.tier) ?? 0 }));
}

export interface QuakeStats {
  total: number;
  /** 最大震级事件（并列时取时间最新者：数据源为时间倒序，用 >= 保留首个即最新）。 */
  maxMagEvent: QuakeEvent | null;
  /** 覆盖时间段（北京时间展示文本，含）。 */
  fromText: string | null;
  toText: string | null;
  provinces: ProvinceStat[];
  distribution: MagDistributionEntry[];
}

/** 当前过滤结果的统计卡数据。 */
export function computeStats(events: readonly QuakeEvent[]): QuakeStats {
  let maxMagEvent: QuakeEvent | null = null;
  let fromText: string | null = null;
  let toText: string | null = null;
  for (const e of events) {
    if (maxMagEvent === null || e.mag > maxMagEvent.mag) {
      maxMagEvent = e;
    }
    // timeText 为 "YYYY-MM-DD HH:mm:ss" 定长格式，字典序即时间序。
    if (fromText === null || e.timeText < fromText) fromText = e.timeText;
    if (toText === null || e.timeText > toText) toText = e.timeText;
  }
  return {
    total: events.length,
    maxMagEvent,
    fromText,
    toText,
    provinces: provinceStats(events, 10),
    distribution: magDistribution(events),
  };
}

/** 月份下拉选项：rangeStart 所在月 … rangeEnd 所在月（含），"YYYY-MM"。 */
export function monthOptions(rangeStart: string, rangeEnd: string): string[] {
  const start = rangeStart.slice(0, 7);
  const end = rangeEnd.slice(0, 7);
  const options: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) {
    return options;
  }
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    options.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return options;
}

/** 快照到达后构造默认过滤：仅国内、minMag=1.0（全量）、月份全范围。 */
export function defaultFilters(rangeStart: string, rangeEnd: string): QuakeFilters {
  const months = monthOptions(rangeStart, rangeEnd);
  return {
    scope: 'domestic',
    minMag: 1.0,
    monthStart: months[0] ?? rangeStart.slice(0, 7),
    monthEnd: months[months.length - 1] ?? rangeEnd.slice(0, 7),
  };
}

/** 经纬度格式化（2 位小数，带半球后缀），如 30.17°N / 140.10°W。 */
export function formatLatLon(lat: number, lon: number): string {
  const latText = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonText = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latText}, ${lonText}`;
}
