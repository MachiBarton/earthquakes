import { X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { formatLatLon, magColor, type QuakeCluster } from '../cluster';
import type { QuakeEvent } from '../data';

/** 与地图容器的间距及光标偏移（px）。 */
const CURSOR_OFFSET = 16;
const EDGE_MARGIN = 8;

interface TooltipProps {
  cluster: QuakeCluster;
  /** 地图容器内 CSS 像素坐标（来自 Cesium 拾取事件）。 */
  x: number;
  y: number;
  /** 容器尺寸，用于把 tooltip clamp 在视口内。 */
  containerWidth: number;
  containerHeight: number;
  /** 钉住态：可滚动、有关闭按钮；hover 态 pointer-events:none 不挡地图。 */
  pinned: boolean;
  onClose?: () => void;
}

/** 先按估计尺寸定位，布局后测量真实尺寸再 clamp 一次（绘制前完成，无闪跳）。 */
function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
): { left: number; top: number } {
  let left = x + CURSOR_OFFSET;
  if (left + width > containerWidth - EDGE_MARGIN) {
    left = x - CURSOR_OFFSET - width;
  }
  left = Math.max(EDGE_MARGIN, Math.min(left, Math.max(EDGE_MARGIN, containerWidth - width - EDGE_MARGIN)));
  let top = y + CURSOR_OFFSET;
  if (top + height > containerHeight - EDGE_MARGIN) {
    top = Math.max(EDGE_MARGIN, y - CURSOR_OFFSET - height);
  }
  top = Math.max(EDGE_MARGIN, Math.min(top, Math.max(EDGE_MARGIN, containerHeight - height - EDGE_MARGIN)));
  return { left, top };
}

function EventRow({ event }: { event: QuakeEvent }) {
  return (
    <li className="quake-tip-item">
      <span className="quake-tip-time">{event.timeText}</span>
      <span className="quake-mag">
        <i className="quake-mag-dot" style={{ background: magColor(event.mag) }} aria-hidden="true" />
        M{event.mag.toFixed(1)}
      </span>
      <span className="quake-tip-depth">
        深度 {event.depth === null ? '—' : `${event.depth} km`}
      </span>
      <span className="quake-tip-coord">{formatLatLon(event.lat, event.lon)}</span>
    </li>
  );
}

/**
 * 聚合点明细 tooltip（自绘 div，React state 驱动）。
 * 所有动态文本经 JSX 渲染，不拼接 innerHTML（AGENTS.md）。
 */
export default function Tooltip({
  cluster,
  x,
  y,
  containerWidth,
  containerHeight,
  pinned,
  onClose,
}: TooltipProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 288, height: 160 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    setSize((prev) =>
      Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1
        ? { width, height }
        : prev,
    );
    // 内容/位置变化后重新测量；size 未变时返回 prev，不会引起循环更新。
  }, [cluster, x, y, pinned]);

  const { left, top } = clampPosition(
    x,
    y,
    size.width,
    size.height,
    containerWidth,
    containerHeight,
  );

  return (
    <div
      ref={boxRef}
      className={pinned ? 'quake-tip quake-tip-pinned' : 'quake-tip'}
      style={{ left, top }}
      role={pinned ? 'dialog' : 'tooltip'}
      aria-label={`${cluster.location} 地震明细`}
    >
      <header className="quake-tip-head">
        <h2 className="quake-tip-title">
          {cluster.location}
          <span className="quake-tip-count">共 {cluster.count} 次</span>
        </h2>
        {pinned && (
          <button type="button" className="quake-tip-close" aria-label="关闭详情" title="关闭" onClick={onClose}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      <ul className="quake-tip-list">
        {cluster.events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ul>
      {pinned && (
        <p className="quake-tip-hint">再次点击地图空白处或本按钮可取消钉住</p>
      )}
    </div>
  );
}
