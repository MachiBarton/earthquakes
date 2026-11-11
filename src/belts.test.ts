import { describe, expect, it } from 'vitest';

import { BELTS, ZONES, beltLabelPoint, beltsForScope, zoneById } from './belts';

/** 地图初始视野（中国范围），国内地震带示意线应落在视野内才有意义。 */
const VIEW = { west: 73, south: 15, east: 136, north: 54 } as const;

/** 国内口径（见 belts.ts 头部）：四地震区 5/7/8/3 共 23 带。 */
const ZONE_COUNTS: Record<string, number> = {
  'north-china': 5,
  northwest: 7,
  southwest: 8,
  'south-china': 3,
};

/** 国外口径：环太平洋 3 段 + 地中海—喜马拉雅西段 1 + 大洋中脊 3 段 + 东非裂谷 1，共 8 带。 */
const OVERSEAS_ZONE_COUNTS: Record<string, number> = {
  'circum-pacific': 3,
  alpide: 1,
  ridge: 3,
  rift: 1,
};

const DOMESTIC = BELTS.filter((belt) => belt.scope === 'domestic');
const OVERSEAS = BELTS.filter((belt) => belt.scope === 'overseas');

describe('ZONES 地震区', () => {
  it('国内 4 区 + 国外 4 区，id 唯一、zoneById 可查', () => {
    expect(ZONES.length).toBe(8);
    expect(ZONES.filter((zone) => zone.scope === 'domestic').length).toBe(4);
    expect(ZONES.filter((zone) => zone.scope === 'overseas').length).toBe(4);
    const ids = ZONES.map((zone) => zone.id);
    expect(new Set(ids).size).toBe(8);
    for (const zone of ZONES) {
      expect(zoneById(zone.id)).toBe(zone);
      expect(zone.name.trim().length).toBeGreaterThan(0);
      expect(zone.dashColor.length).toBeGreaterThan(0);
      expect(zone.bandColor.length).toBeGreaterThan(0);
      expect(zone.labelColor.length).toBeGreaterThan(0);
    }
  });
});

describe('BELTS 地震带示意数据（国内 23 + 国外 8）', () => {
  it('id 唯一、名称含「地震带」、zone 均可查表', () => {
    expect(BELTS.length).toBe(31);
    const ids = BELTS.map((belt) => belt.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const belt of BELTS) {
      // 部分带名带括号别名（如「武都—马边地震带（龙门山）」），故断言包含而非结尾。
      expect(belt.name.includes('地震带')).toBe(true);
      expect(() => zoneById(belt.zone)).not.toThrow();
    }
  });

  it('国内各区带数符合口径 5/7/8/3，且国内带都属国内区', () => {
    expect(DOMESTIC.length).toBe(23);
    const counts = new Map<string, number>();
    for (const belt of DOMESTIC) {
      counts.set(belt.zone, (counts.get(belt.zone) ?? 0) + 1);
      expect(zoneById(belt.zone).scope).toBe('domestic');
    }
    for (const [zoneId, expected] of Object.entries(ZONE_COUNTS)) {
      expect(counts.get(zoneId)).toBe(expected);
    }
  });

  it('国外各区带数符合口径 3/1/3/1，且国外带都属国外区', () => {
    expect(OVERSEAS.length).toBe(8);
    const counts = new Map<string, number>();
    for (const belt of OVERSEAS) {
      counts.set(belt.zone, (counts.get(belt.zone) ?? 0) + 1);
      expect(zoneById(belt.zone).scope).toBe('overseas');
    }
    for (const [zoneId, expected] of Object.entries(OVERSEAS_ZONE_COUNTS)) {
      expect(counts.get(zoneId)).toBe(expected);
    }
  });

  it('每条带至少 3 个折线点，坐标为有限数值；国内带落在中国视野内', () => {
    for (const belt of BELTS) {
      expect(belt.points.length).toBeGreaterThanOrEqual(3);
      for (const [lon, lat] of belt.points) {
        expect(Number.isFinite(lon)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-70);
        expect(lat).toBeLessThanOrEqual(70);
      }
    }
    for (const belt of DOMESTIC) {
      for (const [lon, lat] of belt.points) {
        expect(lon).toBeGreaterThanOrEqual(VIEW.west);
        expect(lon).toBeLessThanOrEqual(VIEW.east);
        expect(lat).toBeGreaterThanOrEqual(VIEW.south);
        expect(lat).toBeLessThanOrEqual(VIEW.north);
      }
    }
  });

  it('beltsForScope：domestic 仅国内带，all 为全部', () => {
    expect(beltsForScope('domestic').length).toBe(23);
    expect(beltsForScope('domestic').every((belt) => belt.scope === 'domestic')).toBe(true);
    expect(beltsForScope('all')).toEqual(BELTS);
  });

  it('beltLabelPoint 返回中心线上的点，且尊重 labelAt 比例', () => {
    for (const belt of BELTS) {
      const point = beltLabelPoint(belt);
      expect(belt.points).toContainEqual(point);
    }
    const weihe = BELTS.find((belt) => belt.id === 'weihe');
    expect(weihe).toBeDefined();
    if (!weihe) return;
    // labelAt 0.15 × 3 段 → 索引 0（宝鸡端，避开西安城市注记）。
    expect(beltLabelPoint(weihe)).toEqual(weihe.points[0]);
    const tanLu = BELTS.find((belt) => belt.id === 'tan-lu');
    expect(tanLu).toBeDefined();
    if (!tanLu) return;
    const index = Math.round((tanLu.labelAt ?? 0.5) * (tanLu.points.length - 1));
    expect(beltLabelPoint(tanLu)).toEqual(tanLu.points[index]);
    expect(index).not.toBe(Math.floor(tanLu.points.length / 2));
  });
});
