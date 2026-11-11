/**
 * 地图注记城市表（HTML 叠加层渲染，见 overlayLabels.ts）。
 *
 * 覆盖全部 34 个省级行政中心（kind='capital'）+ 若干与地震活动或读图相关的
 * 主要城市（kind='major'）。坐标为市中心近似值，WGS84 经纬度（AGENTS.md 坐标
 * 契约），仅用于注记锚点，精度要求不高。
 */
export interface CityLabel {
  name: string;
  lon: number;
  lat: number;
  kind: 'capital' | 'major';
}

export const CITIES: readonly CityLabel[] = [
  // 省级行政中心
  { name: '北京', lon: 116.4, lat: 39.9, kind: 'capital' },
  { name: '天津', lon: 117.2, lat: 39.13, kind: 'capital' },
  { name: '石家庄', lon: 114.51, lat: 38.04, kind: 'capital' },
  { name: '太原', lon: 112.55, lat: 37.87, kind: 'capital' },
  { name: '呼和浩特', lon: 111.75, lat: 40.84, kind: 'capital' },
  { name: '沈阳', lon: 123.43, lat: 41.8, kind: 'capital' },
  { name: '长春', lon: 125.32, lat: 43.9, kind: 'capital' },
  { name: '哈尔滨', lon: 126.63, lat: 45.75, kind: 'capital' },
  { name: '上海', lon: 121.47, lat: 31.23, kind: 'capital' },
  { name: '南京', lon: 118.78, lat: 32.06, kind: 'capital' },
  { name: '杭州', lon: 120.16, lat: 30.29, kind: 'capital' },
  { name: '合肥', lon: 117.28, lat: 31.86, kind: 'capital' },
  { name: '福州', lon: 119.3, lat: 26.08, kind: 'capital' },
  { name: '南昌', lon: 115.89, lat: 28.68, kind: 'capital' },
  { name: '济南', lon: 117.0, lat: 36.65, kind: 'capital' },
  { name: '郑州', lon: 113.65, lat: 34.76, kind: 'capital' },
  { name: '武汉', lon: 114.31, lat: 30.59, kind: 'capital' },
  { name: '长沙', lon: 112.94, lat: 28.23, kind: 'capital' },
  { name: '广州', lon: 113.26, lat: 23.13, kind: 'capital' },
  { name: '南宁', lon: 108.32, lat: 22.82, kind: 'capital' },
  { name: '海口', lon: 110.35, lat: 20.02, kind: 'capital' },
  { name: '重庆', lon: 106.55, lat: 29.56, kind: 'capital' },
  { name: '成都', lon: 104.07, lat: 30.67, kind: 'capital' },
  { name: '贵阳', lon: 106.63, lat: 26.65, kind: 'capital' },
  { name: '昆明', lon: 102.71, lat: 25.04, kind: 'capital' },
  { name: '拉萨', lon: 91.11, lat: 29.65, kind: 'capital' },
  { name: '西安', lon: 108.94, lat: 34.34, kind: 'capital' },
  { name: '兰州', lon: 103.83, lat: 36.06, kind: 'capital' },
  { name: '西宁', lon: 101.78, lat: 36.62, kind: 'capital' },
  { name: '银川', lon: 106.27, lat: 38.47, kind: 'capital' },
  { name: '乌鲁木齐', lon: 87.62, lat: 43.82, kind: 'capital' },
  { name: '台北', lon: 121.56, lat: 25.03, kind: 'capital' },
  { name: '香港', lon: 114.17, lat: 22.32, kind: 'capital' },
  { name: '澳门', lon: 113.55, lat: 22.2, kind: 'capital' },
  // 主要城市（地震活跃或读图参照）
  { name: '深圳', lon: 114.06, lat: 22.55, kind: 'major' },
  { name: '大连', lon: 121.61, lat: 38.91, kind: 'major' },
  { name: '青岛', lon: 120.38, lat: 36.07, kind: 'major' },
  { name: '厦门', lon: 118.09, lat: 24.48, kind: 'major' },
  { name: '高雄', lon: 120.31, lat: 22.62, kind: 'major' },
  { name: '花莲', lon: 121.6, lat: 23.98, kind: 'major' },
  { name: '唐山', lon: 118.18, lat: 39.63, kind: 'major' },
  { name: '绵阳', lon: 104.73, lat: 31.47, kind: 'major' },
  { name: '喀什', lon: 75.99, lat: 39.47, kind: 'major' },
] as const;

/** 运行时快照中的行政中心点（public/data/cities.json，scripts/fetch-cities.mjs 生成）。 */
export interface CityPlace {
  adcode: number;
  /** 展示名（已去行政后缀，自治州保留全称）。 */
  name: string;
  lon: number;
  lat: number;
  /** 地级（含直辖市）或县级。 */
  level: 'city' | 'county';
}

/** 注记样式变体：省会 / 主要城市 / 地级 / 县级，字号与锚点递减。 */
export type CityVariant = 'city' | 'city-major' | 'city-pref' | 'city-county';

/**
 * 渐进展示阈值（地面米/像素）：视图比例尺细于该值时才显示对应颗粒度。
 * 全国视图约 6000 m/px → 仅省会/主要城市；省级视图约 600–2000 → 加地级；
 * 地市视图 < 500 → 加县级。数值为读图经验值，见 DESIGN.md。
 */
export const LABEL_SCALE = {
  prefMaxMetersPerPixel: 2000,
  countyMaxMetersPerPixel: 500,
} as const;

const CAPITAL_NAMES = new Set(
  CITIES.filter((city) => city.kind === 'capital').map((city) => city.name),
);
const MAJOR_NAMES = new Set(
  CITIES.filter((city) => city.kind === 'major').map((city) => city.name),
);

/** 快照点 → 注记变体：省会/主要城市名单优先（与快照脚本的去重名单一致）。 */
export function cityVariantOf(name: string, level: CityPlace['level']): CityVariant {
  if (CAPITAL_NAMES.has(name)) {
    return 'city';
  }
  if (MAJOR_NAMES.has(name)) {
    return 'city-major';
  }
  return level === 'city' ? 'city-pref' : 'city-county';
}

/** 该变体在当前比例尺下是否参与展示（省会/主要城市恒显示）。 */
export function variantVisibleAtScale(variant: CityVariant, metersPerPixel: number): boolean {
  if (variant === 'city' || variant === 'city-major') {
    return true;
  }
  if (variant === 'city-pref') {
    return metersPerPixel <= LABEL_SCALE.prefMaxMetersPerPixel;
  }
  return metersPerPixel <= LABEL_SCALE.countyMaxMetersPerPixel;
}
