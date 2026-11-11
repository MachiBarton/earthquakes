import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLATE_LABELS, PLATE_STYLE, type PlateLine } from './plates';

describe('PLATE_LABELS 板块名称注记', () => {
  it('名称非空且唯一', () => {
    const names = PLATE_LABELS.map((plate) => plate.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(0);
      expect(name.endsWith('板块')).toBe(true);
    }
  });

  it('坐标有限且落在合法经纬度范围', () => {
    for (const plate of PLATE_LABELS) {
      expect(Number.isFinite(plate.lon)).toBe(true);
      expect(Number.isFinite(plate.lat)).toBe(true);
      expect(plate.lon).toBeGreaterThanOrEqual(-180);
      expect(plate.lon).toBeLessThanOrEqual(180);
      expect(plate.lat).toBeGreaterThanOrEqual(-90);
      expect(plate.lat).toBeLessThanOrEqual(90);
    }
  });

  it('覆盖主要板块（≥12）', () => {
    expect(PLATE_LABELS.length).toBeGreaterThanOrEqual(12);
  });

  it('样式常量为有限正数 / 非空 CSS 颜色', () => {
    expect(PLATE_STYLE.lineWidthPx).toBeGreaterThan(0);
    expect(PLATE_STYLE.lineColor.length).toBeGreaterThan(0);
    expect(PLATE_STYLE.labelColor.length).toBeGreaterThan(0);
  });
});

describe('板块边界快照', () => {
  it('public/data/plates.json 符合契约（若已生成）', () => {
    const file = resolve(process.cwd(), 'public/data/plates.json');
    if (!existsSync(file)) {
      return; // 未执行 npm run fetch:plates 时跳过
    }
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { lines?: unknown };
    expect(Array.isArray(raw.lines)).toBe(true);
    const lines = raw.lines as PlateLine[];
    // PB2002 正常 241 条；管线守卫为 ≥200。
    expect(lines.length).toBeGreaterThanOrEqual(200);
    for (const line of lines) {
      expect(line.points.length).toBeGreaterThanOrEqual(2);
      for (const [lon, lat] of line.points) {
        expect(Number.isFinite(lon)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      }
    }
  });
});
