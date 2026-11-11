import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CITIES,
  LABEL_SCALE,
  cityVariantOf,
  variantVisibleAtScale,
  type CityPlace,
} from './cities';

describe('CITIES 注记城市表', () => {
  it('名称非空且唯一', () => {
    const names = CITIES.map((city) => city.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it('坐标有限且落在地图初始视野内（73–136E, 15–54N）', () => {
    for (const city of CITIES) {
      expect(Number.isFinite(city.lon)).toBe(true);
      expect(Number.isFinite(city.lat)).toBe(true);
      expect(city.lon).toBeGreaterThanOrEqual(73);
      expect(city.lon).toBeLessThanOrEqual(136);
      expect(city.lat).toBeGreaterThanOrEqual(15);
      expect(city.lat).toBeLessThanOrEqual(54);
    }
  });

  it('覆盖全部省级行政中心（≥34）且 kind 取值合法', () => {
    expect(CITIES.filter((city) => city.kind === 'capital').length).toBeGreaterThanOrEqual(34);
    for (const city of CITIES) {
      expect(['capital', 'major']).toContain(city.kind);
    }
  });
});

describe('城市注记渐进展示', () => {
  it('阈值有序：县级比地级需要更细的比例尺', () => {
    expect(LABEL_SCALE.countyMaxMetersPerPixel).toBeGreaterThan(0);
    expect(LABEL_SCALE.countyMaxMetersPerPixel).toBeLessThan(
      LABEL_SCALE.prefMaxMetersPerPixel,
    );
  });

  it('变体映射：省会/主要城市名单优先，其余按行政层级', () => {
    expect(cityVariantOf('成都', 'city')).toBe('city');
    expect(cityVariantOf('绵阳', 'city')).toBe('city-major');
    expect(cityVariantOf('秦皇岛', 'city')).toBe('city-pref');
    expect(cityVariantOf('锦江', 'county')).toBe('city-county');
  });

  it('比例尺门控：省会恒显，地级/县级按阈值渐进', () => {
    expect(variantVisibleAtScale('city', 99999)).toBe(true);
    expect(variantVisibleAtScale('city-major', 99999)).toBe(true);
    expect(variantVisibleAtScale('city-pref', 99999)).toBe(false);
    expect(variantVisibleAtScale('city-pref', LABEL_SCALE.prefMaxMetersPerPixel)).toBe(true);
    expect(variantVisibleAtScale('city-county', LABEL_SCALE.prefMaxMetersPerPixel)).toBe(false);
    expect(variantVisibleAtScale('city-county', LABEL_SCALE.countyMaxMetersPerPixel)).toBe(true);
  });

  it('快照 public/data/cities.json 符合契约（若已生成）', () => {
    const file = resolve(process.cwd(), 'public/data/cities.json');
    if (!existsSync(file)) {
      return; // 首跑未执行 npm run fetch:cities 时跳过
    }
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { places?: unknown };
    expect(Array.isArray(raw.places)).toBe(true);
    const places = raw.places as CityPlace[];
    expect(places.length).toBeGreaterThan(2000);
    for (const place of places) {
      expect(['city', 'county']).toContain(place.level);
      expect(Number.isFinite(place.lon)).toBe(true);
      expect(Number.isFinite(place.lat)).toBe(true);
      expect(place.name.length).toBeGreaterThan(0);
    }
  });
});
