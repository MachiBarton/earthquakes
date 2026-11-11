/**
 * 全球板块图层：板块边界样式 + 主要板块名称注记（手写代表点）。
 *
 * 边界几何不在代码内：来自快照 public/data/plates.json
 * （npm run fetch:plates，源 PB2002 板块边界模型，Bird 2003），
 * 加载见 data.ts loadPlateLines；失败降级为空列表（图层不显示，不占主错误通道）。
 * 板块名为手写代表点（板块内部开阔处），仅作示意定位，非质心计算结果。
 */

/** 快照 plates.json 中的一条板块边界折线（name 为板块代码对，如 "PA-NA"）。 */
export interface PlateLine {
  name: string;
  /** [lon, lat] 度，WGS84，至少 2 点。 */
  points: readonly (readonly [number, number])[];
}

export interface PlateLabel {
  name: string;
  lon: number;
  lat: number;
}

/** 主要板块名称注记（大洋板块放洋心，微板块从略）。 */
export const PLATE_LABELS: readonly PlateLabel[] = [
  { name: '太平洋板块', lon: -160, lat: 0 },
  { name: '北美洲板块', lon: -100, lat: 50 },
  { name: '南美洲板块', lon: -55, lat: -18 },
  { name: '欧亚板块', lon: 62, lat: 56 },
  { name: '非洲板块', lon: 18, lat: 3 },
  { name: '南极洲板块', lon: 0, lat: -80 },
  { name: '印度洋-澳洲板块', lon: 114, lat: -22 },
  { name: '阿拉伯板块', lon: 45, lat: 24 },
  { name: '菲律宾海板块', lon: 132, lat: 16 },
  { name: '纳斯卡板块', lon: -93, lat: -24 },
  { name: '科科斯板块', lon: -101, lat: 10 },
  { name: '加勒比板块', lon: -76, lat: 15.5 },
  { name: '胡安·德富卡板块', lon: -130, lat: 46 },
  { name: '斯科舍板块', lon: -42, lat: -57 },
  { name: '鄂霍次克板块', lon: 146, lat: 49 },
  { name: '扬子板块', lon: 112, lat: 29 },
  { name: '印度板块', lon: 78, lat: 8 },
  { name: '巽他板块', lon: 103, lat: -5 },
] as const;

/** 板块边界线与名称注记样式（白色系中性色，与彩色地震带区分；数据色，AGENTS.md 允许）。 */
export const PLATE_STYLE = {
  lineColor: 'rgba(255, 255, 255, 0.5)',
  lineWidthPx: 1.2,
  labelColor: 'rgba(255, 255, 255, 0.55)',
} as const;
