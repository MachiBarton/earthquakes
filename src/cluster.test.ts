import { describe, expect, it } from 'vitest';

import type { QuakeEvent } from './data';
import {
  FOREIGN_PROVINCE_LABEL,
  MAG_COLOR_3TO4,
  MAG_COLOR_4TO5,
  MAG_COLOR_5TO6,
  MAG_COLOR_GTE6,
  MAG_COLOR_LT3,
  corePixelSize,
  computeStats,
  defaultFilters,
  filterEvents,
  formatLatLon,
  groupByLocation,
  haloPixelSize,
  magColor,
  magDistribution,
  magTier,
  monthOptions,
  provinceStats,
  type QuakeFilters,
} from './cluster';

let seq = 0;

/** 构造测试事件；timeText 为北京时间（UTC+8），测试里直接给定，不做换算。 */
function ev(partial: Partial<QuakeEvent> = {}): QuakeEvent {
  seq += 1;
  return {
    id: `TEST.${seq}`,
    time: '2026-03-05T04:06:07.000Z',
    timeText: '2026-03-05 12:06:07',
    lat: 30,
    lon: 100,
    depth: 10,
    mag: 3,
    location: '四川某县',
    province: '四川',
    domestic: true,
    ...partial,
  };
}

function filters(partial: Partial<QuakeFilters> = {}): QuakeFilters {
  return {
    scope: 'domestic',
    minMag: 1,
    monthStart: '2026-01',
    monthEnd: '2026-11',
    ...partial,
  };
}

describe('groupByLocation：按 location 完整字符串分组', () => {
  it('同 location 归为一组，不同 location 分开', () => {
    const clusters = groupByLocation([
      ev({ location: '西藏昌都市八宿县', lat: 30, lon: 96 }),
      ev({ location: '西藏昌都市八宿县', lat: 32, lon: 98 }),
      ev({ location: '青海海西州直辖区', lat: 36, lon: 95 }),
    ]);
    expect(clusters).toHaveLength(2);
    const keys = clusters.map((c) => c.key).sort();
    expect(keys).toEqual(['西藏昌都市八宿县', '青海海西州直辖区']);
  });

  it('centroid = 成员 lat/lon 平均值', () => {
    const [cluster] = groupByLocation([
      ev({ location: 'A', lat: 30.1, lon: 96.2 }),
      ev({ location: 'A', lat: 30.3, lon: 96.4 }),
      ev({ location: 'A', lat: 30.5, lon: 96.6 }),
    ]);
    expect(cluster.lat).toBeCloseTo(30.3, 6);
    expect(cluster.lon).toBeCloseTo(96.4, 6);
  });

  it('count / maxMag / latestTime 正确，成员按时间倒序', () => {
    const early = ev({
      location: 'A',
      time: '2026-02-01T00:00:00.000Z',
      timeText: '2026-02-01 08:00:00',
      mag: 4.2,
    });
    const latest = ev({
      location: 'A',
      time: '2026-05-03T10:00:00.000Z',
      timeText: '2026-05-03 18:00:00',
      mag: 2.8,
    });
    const middle = ev({
      location: 'A',
      time: '2026-03-05T04:06:07.000Z',
      timeText: '2026-03-05 12:06:07',
      mag: 5.1,
    });
    // 故意乱序传入，验证排序不依赖输入顺序。
    const [cluster] = groupByLocation([middle, early, latest]);
    expect(cluster.count).toBe(3);
    expect(cluster.maxMag).toBe(5.1);
    expect(cluster.latestTime).toBe('2026-05-03T10:00:00.000Z');
    expect(cluster.events.map((e) => e.id)).toEqual([latest.id, middle.id, early.id]);
  });

  it('空输入返回空数组', () => {
    expect(groupByLocation([])).toEqual([]);
  });
});

describe('色标边界值（M<3 / 3≤M<4 / 4≤M<5 / 5≤M<6 / M≥6）', () => {
  it('magTier 边界', () => {
    expect(magTier(2.99)).toBe('lt3');
    expect(magTier(3)).toBe('m3to4');
    expect(magTier(3.99)).toBe('m3to4');
    expect(magTier(4)).toBe('m4to5');
    expect(magTier(4.99)).toBe('m4to5');
    expect(magTier(5)).toBe('m5to6');
    expect(magTier(5.99)).toBe('m5to6');
    expect(magTier(6)).toBe('gte6');
  });

  it('magColor 对应 hex', () => {
    expect(magColor(2.99)).toBe(MAG_COLOR_LT3);
    expect(magColor(3)).toBe(MAG_COLOR_3TO4);
    expect(magColor(3.99)).toBe(MAG_COLOR_3TO4);
    expect(magColor(4)).toBe(MAG_COLOR_4TO5);
    expect(magColor(5)).toBe(MAG_COLOR_5TO6);
    expect(magColor(6)).toBe(MAG_COLOR_GTE6);
    // 数据实际极值：min 1.7 / max 7.9。
    expect(magColor(1.7)).toBe(MAG_COLOR_LT3);
    expect(magColor(7.9)).toBe(MAG_COLOR_GTE6);
  });

  it('色标 hex 与任务契约一致', () => {
    expect(MAG_COLOR_LT3).toBe('#3ba55d');
    expect(MAG_COLOR_3TO4).toBe('#f2c94c');
    expect(MAG_COLOR_4TO5).toBe('#f2994a');
    expect(MAG_COLOR_5TO6).toBe('#eb5757');
    expect(MAG_COLOR_GTE6).toBe('#9b51e0');
  });
});

describe('filterEvents：范围 / 震级 / 月份过滤', () => {
  const domestic = ev({ id: 'D1', domestic: true, province: '西藏', mag: 3.4 });
  const foreign = ev({
    id: 'F1',
    domestic: false,
    province: null,
    location: '美国阿拉斯加州',
    mag: 5.7,
  });

  it('scope=domestic 只保留国内（默认），scope=all 含国外', () => {
    expect(filterEvents([domestic, foreign], filters({ scope: 'domestic' })).map((e) => e.id)).toEqual([
      'D1',
    ]);
    expect(filterEvents([domestic, foreign], filters({ scope: 'all' })).map((e) => e.id)).toEqual([
      'D1',
      'F1',
    ]);
  });

  it('最小震级为含边界：mag == minMag 保留，mag < minMag 过滤', () => {
    const weak = ev({ id: 'W', mag: 2.4 });
    const equal = ev({ id: 'E', mag: 2.5 });
    const strong = ev({ id: 'S', mag: 2.6 });
    const kept = filterEvents([weak, equal, strong], filters({ minMag: 2.5 }));
    expect(kept.map((e) => e.id)).toEqual(['E', 'S']);
  });

  it('月份范围含两端（按北京时间 timeText 取月）', () => {
    const jan = ev({ id: 'JAN', timeText: '2026-01-15 09:00:00' });
    const feb = ev({ id: 'FEB', timeText: '2026-02-15 09:00:00' });
    const mar = ev({ id: 'MAR', timeText: '2026-03-15 09:00:00' });
    const kept = filterEvents(
      [jan, feb, mar],
      filters({ monthStart: '2026-01', monthEnd: '2026-02' }),
    );
    expect(kept.map((e) => e.id)).toEqual(['JAN', 'FEB']);
    const onlyFeb = filterEvents([jan, feb, mar], filters({ monthStart: '2026-02', monthEnd: '2026-02' }));
    expect(onlyFeb.map((e) => e.id)).toEqual(['FEB']);
  });

  it('UTC 跨日事件按北京时间归月：2026-01-31T23:00Z（北京 2026-02-01 07:00）属于 2 月', () => {
    const boundary = ev({
      id: 'B',
      time: '2026-01-31T23:00:00.000Z',
      timeText: '2026-02-01 07:00:00',
    });
    expect(
      filterEvents([boundary], filters({ monthStart: '2026-02', monthEnd: '2026-02' })).map((e) => e.id),
    ).toEqual(['B']);
    expect(
      filterEvents([boundary], filters({ monthStart: '2026-01', monthEnd: '2026-01' })),
    ).toEqual([]);
  });
});

describe('monthOptions / defaultFilters', () => {
  it('生成 rangeStart … rangeEnd 全部月份（含端点）', () => {
    expect(monthOptions('2026-01-01', '2026-11-10')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
  });

  it('非法或倒置区间返回空数组', () => {
    expect(monthOptions('2026-11', '2026-01')).toEqual([]);
    expect(monthOptions('bad', '2026-01')).toEqual([]);
  });

  it('默认过滤：仅国内、minMag=1.0、月份全范围', () => {
    expect(defaultFilters('2026-01-01', '2026-11-10')).toEqual({
      scope: 'domestic',
      minMag: 1.0,
      monthStart: '2026-01',
      monthEnd: '2026-11',
    });
  });
});

describe('provinceStats / magDistribution / computeStats', () => {
  const events = [
    ev({ province: '西藏', mag: 3.4 }),
    ev({ province: '西藏', mag: 2.9 }),
    ev({ province: '四川', mag: 4.1 }),
    ev({ province: '四川', mag: 5.2 }),
    ev({ province: '四川', mag: 6.3 }),
    ev({ province: null, domestic: false, location: '美国阿拉斯加州', mag: 5.7 }),
  ];

  it('国外事件 province=null 归入「境外」，降序取前 N', () => {
    expect(provinceStats(events, 10)).toEqual([
      { name: '四川', count: 3 },
      { name: '西藏', count: 2 },
      { name: FOREIGN_PROVINCE_LABEL, count: 1 },
    ]);
    expect(provinceStats(events, 1)).toEqual([{ name: '四川', count: 3 }]);
  });

  it('震级分布五档计数（固定顺序，含 0）', () => {
    const dist = magDistribution([
      ev({ mag: 1.7 }),
      ev({ mag: 2.99 }),
      ev({ mag: 3 }),
      ev({ mag: 4 }),
      ev({ mag: 5 }),
      ev({ mag: 6 }),
      ev({ mag: 7.9 }),
    ]);
    expect(dist.map((d) => [d.tier, d.count])).toEqual([
      ['lt3', 2],
      ['m3to4', 1],
      ['m4to5', 1],
      ['m5to6', 1],
      ['gte6', 2],
    ]);
  });

  it('computeStats：总数、最大震级及地点、覆盖时间段', () => {
    const stats = computeStats([
      ev({
        mag: 3.0,
        location: 'A',
        timeText: '2026-06-01 00:00:00',
      }),
      ev({
        mag: 5.7,
        location: '美国阿拉斯加州',
        timeText: '2026-03-02 08:00:00',
      }),
      ev({
        mag: 4.0,
        location: 'B',
        timeText: '2026-09-30 23:59:59',
      }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.maxMagEvent?.mag).toBe(5.7);
    expect(stats.maxMagEvent?.location).toBe('美国阿拉斯加州');
    expect(stats.fromText).toBe('2026-03-02 08:00:00');
    expect(stats.toText).toBe('2026-09-30 23:59:59');
    expect(stats.distribution.find((d) => d.tier === 'm5to6')?.count).toBe(1);
  });

  it('computeStats 空集合：total=0，maxMagEvent/时间段为 null', () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.maxMagEvent).toBeNull();
    expect(stats.fromText).toBeNull();
    expect(stats.toText).toBeNull();
    expect(stats.provinces).toEqual([]);
  });
});

describe('corePixelSize / haloPixelSize / formatLatLon', () => {
  it('核心点直径按震级分档 6/7/8/10/12', () => {
    expect(corePixelSize(2.5)).toBe(6);
    expect(corePixelSize(3.5)).toBe(7);
    expect(corePixelSize(4.5)).toBe(8);
    expect(corePixelSize(5.5)).toBe(10);
    expect(corePixelSize(6.5)).toBe(12);
  });

  it('光晕直径随 count 增大：8 + sqrt(count)*3.4，下限 10 上限 46', () => {
    expect(haloPixelSize(0)).toBe(10);
    expect(haloPixelSize(1)).toBeCloseTo(11.4, 6);
    expect(haloPixelSize(4)).toBeCloseTo(14.8, 6);
    expect(haloPixelSize(79)).toBeLessThanOrEqual(46);
    expect(haloPixelSize(1000)).toBe(46);
    expect(haloPixelSize(9)).toBeGreaterThan(haloPixelSize(4));
  });

  it('经纬度格式化保留 2 位小数并带半球后缀（西经/南纬为负值场景）', () => {
    expect(formatLatLon(30.17, 96.86)).toBe('30.17°N, 96.86°E');
    expect(formatLatLon(60.48, -140.1)).toBe('60.48°N, 140.10°W');
    expect(formatLatLon(-33.456, 70.667)).toBe('33.46°S, 70.67°E');
  });
});
