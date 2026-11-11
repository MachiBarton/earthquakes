/**
 * 地震区 / 地震带（简化示意）。
 *
 * 国内部分 —— 中国四大地震区 · 23 条地震带：
 * 分区与带名口径：中国大陆地震主要分布在华北、西北、西南、华南四个地震区、
 * 23 条地震带上（维基百科「地震带」条目中国大陆分布章节列出的 21 带 ——
 * 华北 5 / 西北 7 / 西南 8 / 东南沿海 1 —— 补入台湾东、台湾西 2 带凑足 23；
 * 另有的「东北深震带」属深源地震、不在 23 带之列，故不绘制）。
 * 参考：zh.wikipedia.org/wiki/地震帶；新浪新闻 2006-07-04《中国地震带的分布》
 * （该文分区口径略异：华北区含银川-河套带等，本文件采用维基的区域归属）。
 *
 * 国外部分 —— 全球主要地震带（地震学界通行的三大体系 + 东非裂谷）：
 * 1. 环太平洋地震带（约 80% 的浅源地震能量）：美洲西岸、阿留申—堪察加、
 *    千岛—日本—伊豆小笠原马里亚纳—西南太平洋岛弧—新西兰；
 * 2. 地中海—喜马拉雅地震带（欧亚带，约 15%）：亚速尔—地中海—安纳托利亚—
 *    扎格罗斯—莫克兰—兴都库什—帕米尔（东段即中国西南区诸带，国内段单列）；
 * 3. 大洋中脊地震带（约 5–10%）：大西洋中脊、印度洋中脊、东太平洋海隆；
 * 4. 东非裂谷地震带（大洋中脊系的大陆裂谷分支）。
 * 国外带仅当过滤范围选「含国外」时显示（beltsForScope）。
 *
 * 坐标为公开构造概要的人工简化中心线，仅用于地图示意叠加，**不是**权威活动
 * 断裂边界；精度不高于百公里量级。统一 WGS84 经纬度（AGENTS.md 坐标契约），
 * [经度, 纬度] 序。跨 180° 经线的带（阿留申、汤加—克马德克、东太平洋海隆南段）
 * 依赖 3D 下相邻折线点在椭球面天然相邻，不做展开处理。
 */
export type SeismicZoneId =
  | 'north-china'
  | 'northwest'
  | 'southwest'
  | 'south-china'
  | 'circum-pacific'
  | 'alpide'
  | 'ridge'
  | 'rift';

/** 过滤范围联动口径：'domestic' 只画国内带；'all'（含国外）追加全球带。 */
export type BeltsScope = 'domestic' | 'all';

export interface SeismicZone {
  id: SeismicZoneId;
  name: string;
  /** 国内四区仅「仅国内」范围即显示；国外区随「含国外」显示。 */
  scope: 'domestic' | 'overseas';
  /** 虚线中心线颜色（数据色，AGENTS.md 允许）。 */
  dashColor: string;
  /** 半透明宽带颜色（同色系低不透明度）。 */
  bandColor: string;
  /** 带名注记文字颜色（暗底 chip 上可读的浅色）。 */
  labelColor: string;
}

export const ZONES: readonly SeismicZone[] = [
  {
    id: 'north-china',
    name: '华北地震区',
    scope: 'domestic',
    dashColor: 'rgba(255, 169, 77, 0.9)',
    bandColor: 'rgba(255, 169, 77, 0.1)',
    labelColor: 'rgba(255, 216, 168, 0.95)',
  },
  {
    id: 'northwest',
    name: '西北地震区',
    scope: 'domestic',
    dashColor: 'rgba(204, 93, 232, 0.9)',
    bandColor: 'rgba(204, 93, 232, 0.1)',
    labelColor: 'rgba(238, 190, 250, 0.95)',
  },
  {
    id: 'southwest',
    name: '西南地震区（青藏）',
    scope: 'domestic',
    dashColor: 'rgba(255, 107, 107, 0.9)',
    bandColor: 'rgba(255, 107, 107, 0.1)',
    labelColor: 'rgba(255, 201, 201, 0.95)',
  },
  {
    id: 'south-china',
    name: '华南地震区（东南沿海·台湾）',
    scope: 'domestic',
    dashColor: 'rgba(77, 171, 247, 0.9)',
    bandColor: 'rgba(77, 171, 247, 0.12)',
    labelColor: 'rgba(165, 216, 255, 0.95)',
  },
  {
    id: 'circum-pacific',
    name: '环太平洋地震带',
    scope: 'overseas',
    dashColor: 'rgba(255, 92, 92, 0.9)',
    bandColor: 'rgba(255, 92, 92, 0.1)',
    labelColor: 'rgba(255, 197, 197, 0.95)',
  },
  {
    id: 'alpide',
    name: '地中海—喜马拉雅地震带（西段）',
    scope: 'overseas',
    dashColor: 'rgba(240, 183, 59, 0.9)',
    bandColor: 'rgba(240, 183, 59, 0.1)',
    labelColor: 'rgba(252, 229, 176, 0.95)',
  },
  {
    id: 'ridge',
    name: '大洋中脊地震带',
    scope: 'overseas',
    dashColor: 'rgba(38, 198, 218, 0.9)',
    bandColor: 'rgba(38, 198, 218, 0.1)',
    labelColor: 'rgba(178, 236, 245, 0.95)',
  },
  {
    id: 'rift',
    name: '东非裂谷地震带',
    scope: 'overseas',
    dashColor: 'rgba(129, 199, 132, 0.9)',
    bandColor: 'rgba(129, 199, 132, 0.1)',
    labelColor: 'rgba(205, 236, 207, 0.95)',
  },
] as const;

const ZONE_BY_ID: ReadonlyMap<SeismicZoneId, SeismicZone> = new Map(
  ZONES.map((zone): [SeismicZoneId, SeismicZone] => [zone.id, zone]),
);

export function zoneById(id: SeismicZoneId): SeismicZone {
  const zone = ZONE_BY_ID.get(id);
  if (!zone) {
    throw new Error(`未知地震区 ${id}`);
  }
  return zone;
}

export interface SeismicBelt {
  id: string;
  zone: SeismicZoneId;
  name: string;
  /** 国内带始终显示；国外带仅「含国外」范围显示。 */
  scope: 'domestic' | 'overseas';
  /** 中心线折线点，[lon, lat] 度，至少 3 点。 */
  points: readonly (readonly [number, number])[];
  /** 名称注记在中心线上的位置比例 0–1，默认 0.5；用于避开城市注记压盖。 */
  labelAt?: number;
}

export const BELTS: readonly SeismicBelt[] = [
  // ---- 华北地震区（5） ----
  {
    id: 'tan-lu',
    zone: 'north-china',
    scope: 'domestic',
    name: '郯城—庐江地震带',
    labelAt: 0.7,
    points: [
      [117.3, 31.2],
      [118.3, 33.9],
      [118.6, 34.9],
      [120.0, 37.6],
      [121.2, 39.6],
      [122.2, 40.7],
      [123.4, 42.0],
    ],
  },
  {
    id: 'yanshan',
    zone: 'north-china',
    scope: 'domestic',
    name: '燕山地震带',
    points: [
      [114.3, 40.9],
      [116.2, 40.5],
      [118.0, 40.2],
      [119.8, 40.8],
      [121.0, 41.4],
    ],
  },
  {
    id: 'hebei-plain',
    zone: 'north-china',
    scope: 'domestic',
    name: '河北平原地震带',
    labelAt: 0.2,
    points: [
      [114.0, 35.0],
      [114.9, 36.6],
      [115.8, 38.0],
      [116.9, 39.0],
      [117.8, 39.6],
    ],
  },
  {
    id: 'shanxi',
    zone: 'north-china',
    scope: 'domestic',
    name: '山西地震带',
    labelAt: 0.2,
    points: [
      [110.9, 35.1],
      [111.5, 36.1],
      [112.5, 37.8],
      [112.9, 38.8],
      [113.3, 40.1],
      [114.5, 40.8],
    ],
  },
  {
    id: 'weihe',
    zone: 'north-china',
    scope: 'domestic',
    name: '渭河平原地震带',
    labelAt: 0.15,
    points: [
      [107.1, 34.4],
      [108.9, 34.3],
      [110.0, 34.6],
      [110.6, 35.0],
    ],
  },
  // ---- 西北地震区（7） ----
  {
    id: 'yinchuan',
    zone: 'northwest',
    scope: 'domestic',
    name: '银川地震带',
    labelAt: 0.9,
    points: [
      [105.5, 37.3],
      [106.3, 38.5],
      [106.8, 39.6],
      [107.1, 40.4],
    ],
  },
  {
    id: 'liupanshan',
    zone: 'northwest',
    scope: 'domestic',
    name: '六盘山地震带',
    points: [
      [105.6, 36.9],
      [106.3, 36.0],
      [106.5, 35.2],
      [106.9, 34.5],
    ],
  },
  {
    id: 'tianshui-lanzhou',
    zone: 'northwest',
    scope: 'domestic',
    name: '天水—兰州地震带',
    points: [
      [103.6, 36.3],
      [104.6, 35.6],
      [105.7, 34.6],
      [106.3, 34.0],
    ],
  },
  {
    id: 'hexi',
    zone: 'northwest',
    scope: 'domestic',
    name: '河西走廊地震带',
    points: [
      [102.8, 37.7],
      [100.4, 38.9],
      [98.5, 39.8],
      [97.0, 40.4],
    ],
  },
  {
    id: 'tarim-south',
    zone: 'northwest',
    scope: 'domestic',
    name: '塔里木南缘地震带',
    points: [
      [79.0, 37.1],
      [81.7, 36.9],
      [84.8, 37.8],
      [88.0, 38.8],
    ],
  },
  {
    id: 'tianshan-south',
    zone: 'northwest',
    scope: 'domestic',
    name: '南天山地震带',
    points: [
      [76.2, 39.6],
      [79.5, 40.6],
      [82.9, 41.7],
      [86.0, 41.9],
    ],
  },
  {
    id: 'tianshan-north',
    zone: 'northwest',
    scope: 'domestic',
    name: '北天山地震带',
    points: [
      [88.5, 43.9],
      [86.0, 44.3],
      [83.5, 44.6],
      [81.5, 44.9],
    ],
  },
  // ---- 西南地震区 / 青藏（8） ----
  {
    id: 'longmenshan',
    zone: 'southwest',
    scope: 'domestic',
    name: '武都—马边地震带（龙门山）',
    points: [
      [104.9, 33.4],
      [104.4, 32.3],
      [103.6, 31.4],
      [103.0, 30.2],
      [103.5, 28.9],
    ],
  },
  {
    id: 'xianshuihe',
    zone: 'southwest',
    scope: 'domestic',
    name: '康定—甘孜地震带（鲜水河）',
    points: [
      [99.9, 31.6],
      [101.1, 30.9],
      [101.9, 30.0],
      [102.3, 29.4],
    ],
  },
  {
    id: 'anninghe',
    zone: 'southwest',
    scope: 'domestic',
    name: '安宁河谷地震带',
    points: [
      [102.2, 28.7],
      [102.3, 27.9],
      [101.9, 27.0],
      [101.7, 26.5],
    ],
  },
  {
    id: 'yunnan-east',
    zone: 'southwest',
    scope: 'domestic',
    name: '滇东地震带（小江）',
    points: [
      [103.7, 27.3],
      [103.2, 26.4],
      [102.9, 25.5],
      [103.0, 24.6],
    ],
  },
  {
    id: 'yunnan-west',
    zone: 'southwest',
    scope: 'domestic',
    name: '滇西地震带',
    points: [
      [99.7, 28.0],
      [100.2, 26.9],
      [100.2, 25.6],
      [99.8, 24.6],
    ],
  },
  {
    id: 'tengchong-lancang',
    zone: 'southwest',
    scope: 'domestic',
    name: '腾冲—澜沧地震带',
    points: [
      [98.5, 25.1],
      [99.2, 23.9],
      [99.9, 22.6],
    ],
  },
  {
    id: 'zayu',
    zone: 'southwest',
    scope: 'domestic',
    name: '西藏察隅地震带',
    points: [
      [97.6, 28.6],
      [96.5, 29.3],
      [95.2, 29.5],
      [94.0, 29.2],
    ],
  },
  {
    id: 'tibet-central',
    zone: 'southwest',
    scope: 'domestic',
    name: '西藏中部地震带',
    labelAt: 0.15,
    points: [
      [89.0, 30.6],
      [91.1, 30.0],
      [92.5, 29.6],
      [94.0, 29.6],
    ],
  },
  // ---- 华南地震区（东南沿海 + 台湾，3） ----
  {
    id: 'southeast-coast',
    zone: 'south-china',
    scope: 'domestic',
    name: '东南沿海地震带',
    labelAt: 0.35,
    points: [
      [119.5, 25.8],
      [118.6, 24.9],
      [116.7, 23.4],
      [115.0, 22.6],
      [113.5, 22.0],
      [111.9, 21.8],
      [110.4, 20.1],
    ],
  },
  {
    id: 'taiwan-east',
    zone: 'south-china',
    scope: 'domestic',
    name: '台湾东地震带',
    points: [
      [121.9, 25.0],
      [121.7, 24.0],
      [121.2, 22.8],
      [120.9, 21.9],
    ],
  },
  {
    id: 'taiwan-west',
    zone: 'south-china',
    scope: 'domestic',
    name: '台湾西地震带',
    points: [
      [120.6, 24.3],
      [120.4, 23.5],
      [120.2, 22.9],
    ],
  },
  // ---- 环太平洋地震带（国外，3 段） ----
  {
    id: 'ring-americas',
    zone: 'circum-pacific',
    scope: 'overseas',
    name: '环太平洋地震带（美洲西岸）',
    labelAt: 0.55,
    points: [
      [-75, -46],
      [-73, -37],
      [-71, -27],
      [-76, -14],
      [-79, -6],
      [-80, -1],
      [-78, 4],
      [-82, 9],
      [-88, 12],
      [-95, 15],
      [-101, 17],
      [-105, 20],
      [-109, 24],
      [-114, 30],
      [-119, 34],
      [-122, 38],
      [-125, 44],
      [-127, 49],
      [-140, 58],
      [-150, 61],
      [-155, 58],
    ],
  },
  {
    id: 'ring-aleutian',
    zone: 'circum-pacific',
    scope: 'overseas',
    name: '环太平洋地震带（堪察加—阿留申）',
    points: [
      [162, 56],
      [168, 55],
      [174, 53],
      [180, 52],
      [-176, 52],
      [-170, 53],
      [-163, 55],
      [-157, 57],
    ],
  },
  {
    id: 'ring-west-pacific',
    zone: 'circum-pacific',
    scope: 'overseas',
    name: '环太平洋地震带（千岛—日本—西南太平洋）',
    labelAt: 0.3,
    points: [
      [156, 50],
      [152, 46],
      [146, 44],
      [143, 40],
      [140, 36],
      [140, 31],
      [142, 27],
      [145, 18],
      [144, 13],
      [138, 9],
      [134, 7],
      [128, 2],
      [133, -2],
      [143, -3],
      [150, -5],
      [157, -8],
      [166, -11],
      [169, -16],
      [177, -19],
      [-176, -22],
      [-178, -30],
      [177, -38],
      [173, -42],
      [168, -45],
    ],
  },
  // ---- 地中海—喜马拉雅地震带（国外西段，1） ----
  {
    id: 'alpide-west',
    zone: 'alpide',
    scope: 'overseas',
    name: '地中海—喜马拉雅地震带（亚速尔—帕米尔）',
    labelAt: 0.4,
    points: [
      [-28, 38],
      [-10, 36],
      [-2, 36],
      [5, 38],
      [15, 38],
      [21, 38],
      [27, 37],
      [33, 38],
      [40, 38],
      [46, 37],
      [52, 32],
      [58, 28],
      [63, 26],
      [68, 30],
      [71, 36],
      [74, 38],
    ],
  },
  // ---- 大洋中脊地震带（国外，3 段） ----
  {
    id: 'mid-atlantic',
    zone: 'ridge',
    scope: 'overseas',
    name: '大洋中脊地震带（大西洋中脊）',
    labelAt: 0.25,
    points: [
      [-18, 65],
      [-24, 57],
      [-25, 52],
      [-28, 40],
      [-30, 25],
      [-25, 12],
      [-19, 1],
      [-13, -7],
      [-13, -20],
      [-12, -37],
      [-24, -52],
      [-33, -56],
    ],
  },
  {
    id: 'indian-ridge',
    zone: 'ridge',
    scope: 'overseas',
    name: '大洋中脊地震带（印度洋中脊）',
    labelAt: 0.3,
    points: [
      [43, 12],
      [51, 9],
      [58, 6],
      [65, -6],
      [68, -16],
      [64, -26],
      [72, -34],
      [80, -37],
      [95, -43],
      [115, -47],
      [135, -50],
      [152, -58],
    ],
  },
  {
    id: 'east-pacific-rise',
    zone: 'ridge',
    scope: 'overseas',
    name: '大洋中脊地震带（东太平洋海隆）',
    labelAt: 0.2,
    points: [
      [-108, 23],
      [-105, 10],
      [-102, 0],
      [-96, -3],
      [-105, -12],
      [-112, -20],
      [-109, -27],
      [-124, -35],
      [-135, -48],
      [-152, -57],
      [-170, -59],
    ],
  },
  // ---- 东非裂谷地震带（国外，1） ----
  {
    id: 'east-africa-rift',
    zone: 'rift',
    scope: 'overseas',
    name: '东非裂谷地震带',
    points: [
      [40, 11],
      [39, 6],
      [37, 2],
      [36, -2],
      [35, -8],
      [34, -13],
      [35, -16],
    ],
  },
] as const;

/** 按过滤范围取带：'domestic' 仅国内 23 带；'all' 追加国外 8 带。 */
export function beltsForScope(scope: BeltsScope): readonly SeismicBelt[] {
  return scope === 'all' ? BELTS : BELTS.filter((belt) => belt.scope === 'domestic');
}

/** 名称注记锚点：中心线上 labelAt（默认中点）处的折线点（HTML 叠加层渲染，见 overlayLabels.ts）。 */
export function beltLabelPoint(belt: SeismicBelt): readonly [number, number] {
  const t = Math.min(1, Math.max(0, belt.labelAt ?? 0.5));
  const index = Math.round(t * (belt.points.length - 1));
  const point = belt.points[index] ?? belt.points[0];
  if (!point) {
    throw new Error(`地震带 ${belt.id} 缺少中心线点`);
  }
  return point;
}

/** 地震带叠加层几何参数（颜色按地震区取 zoneById(...).bandColor/dashColor）。 */
export const BELT_STYLE = {
  bandWidthPx: 12,
  dashWidthPx: 2,
  dashLengthPx: 12,
} as const;
