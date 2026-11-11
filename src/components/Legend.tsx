import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { ZONES } from '../belts';
import { MAG_TIERS, haloPixelSize } from '../cluster';

/** 光晕尺寸参考档（次数）：与地图 haloPixelSize 同一函数，保证图例与图元一致。 */
const SIZE_REFS = [10, 50, 100] as const;

/**
 * 图例：震级色标五档 + 光晕大小 = 次数参考圆 + 地震区色标 + 全球板块 + 注记说明。
 * 色标是数据色（AGENTS.md 允许），容器 chrome 保持黑白灰。
 * includeOverseas（过滤范围「含国外」）时追加全球地震带色标。
 * 整块可收起（用户 m02582「这边也要可以收起」）：折叠后仅留标题行按钮，
 * 与左侧面板的收起按钮同款语义（aria-expanded + 图标方向）。
 */
export default function Legend({ includeOverseas }: { includeOverseas: boolean }) {
  const [open, setOpen] = useState(true);
  const zones = ZONES.filter((zone) => includeOverseas || zone.scope === 'domestic');
  return (
    <div className="quake-legend" aria-label="图例">
      <button
        type="button"
        className="legend-toggle"
        aria-expanded={open}
        aria-label={open ? '收起图例' : '展开图例'}
        title={open ? '收起图例' : '展开图例'}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="legend-title">图例</span>
        {open ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronUp size={14} aria-hidden="true" />
        )}
      </button>
      {open && (
        <>
          <span className="legend-title">震级色标</span>
          <ul className="legend-items">
            {MAG_TIERS.map((tier) => (
              <li key={tier.tier}>
                <i className="quake-mag-dot" style={{ background: tier.color }} aria-hidden="true" />
                {tier.label}
              </li>
            ))}
          </ul>
          <span className="legend-title">光晕大小 = 发生次数</span>
          <div className="legend-sizes">
            {SIZE_REFS.map((count) => {
              const px = Math.round(haloPixelSize(count));
              return (
                <span key={count} className="legend-size-item">
                  <i
                    className="legend-size-dot"
                    style={{ width: `${px}px`, height: `${px}px` }}
                    aria-hidden="true"
                  />
                  {count} 次
                </span>
              );
            })}
          </div>
          <span className="legend-note">圆心颜色 = 该地区最大震级；悬浮/点击看每次明细</span>
          <span className="legend-title">地震区 / 地震带（简化示意）</span>
          <ul className="legend-items">
            {zones.map((zone) => (
              <li key={zone.id}>
                <i
                  className="legend-zone-swatch"
                  style={{ color: zone.dashColor }}
                  aria-hidden="true"
                />
                {zone.name}
              </li>
            ))}
          </ul>
          <span className="legend-note">
            {includeOverseas
              ? '中国 4 地震区 · 23 地震带 + 全球主要地震带；虚线 = 带中心线，注记同区色'
              : '4 地震区 · 23 地震带；虚线 = 带中心线，注记同区色（选「含国外」追加全球带）'}
          </span>
          <span className="legend-title">全球板块</span>
          <ul className="legend-items">
            <li>
              <i className="legend-plate-swatch" aria-hidden="true" />
              板块边界（PB2002）
            </li>
          </ul>
          <span className="legend-note">
            白色细线 = 板块边界（Bird, 2003）；灰白字 = 板块名（「图层」可开关）
          </span>
          <span className="legend-note">
            灰字 = 城市名（「图层」可开关）；省会/主要城市常显，地级/县级随放大渐进显示；重叠时自动隐藏
          </span>
        </>
      )}
    </div>
  );
}
