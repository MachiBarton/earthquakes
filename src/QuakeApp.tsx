import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import FilterPanel from './components/FilterPanel';
import Legend from './components/Legend';
import MapCanvas, { type MapPickInfo } from './components/MapCanvas';
import StatsPanel from './components/StatsPanel';
import Tooltip from './components/Tooltip';
import {
  computeStats,
  defaultFilters,
  filterEvents,
  groupByLocation,
  monthOptions,
  type QuakeFilters,
} from './cluster';
import { CEIC_URL, loadCityPlaces, loadEarthquakes, loadPlateLines, type QuakeSnapshot } from './data';
import type { CityPlace } from './cities';
import type { PlateLine } from './plates';

/** fetchedAt(ISO) → 北京时间可读文本。 */
function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) {
    return '未知';
  }
  return `${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）`;
}

/**
 * 全国地震分布页面根组件（标题/区间/页签标题随数据源动态修正）：
 * 数据加载（超时/错误态）→ 过滤 → 聚合 → 地图图元 + hover/钉住 tooltip + 统计面板。
 */
export default function QuakeApp() {
  const [snapshot, setSnapshot] = useState<QuakeSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState<QuakeFilters | null>(null);
  const [hover, setHover] = useState<MapPickInfo | null>(null);
  const [pin, setPin] = useState<MapPickInfo | null>(null);
  const [showBelts, setShowBelts] = useState(true);
  const [showCities, setShowCities] = useState(true);
  const [showPlates, setShowPlates] = useState(true);
  const [cityPlaces, setCityPlaces] = useState<readonly CityPlace[]>([]);
  const [plateLines, setPlateLines] = useState<readonly PlateLine[]>([]);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 760);
  const mapAreaRef = useRef<HTMLElement | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  // 数据加载：AbortController 超时（data.ts 内 10s）+ 卸载时 abort。
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadError(null);
    loadEarthquakes(controller.signal)
      .then((loaded) => {
        if (!active) {
          return;
        }
        setSnapshot(loaded);
        setFilters((prev) => prev ?? defaultFilters(loaded.rangeStart, loaded.rangeEnd));
      })
      .catch((error: unknown) => {
        // 卸载 abort 不上报错误；不打印原始数据（AGENTS.md）。
        if (!active || controller.signal.aborted) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : '地震数据加载失败');
      });
    // 城市注记快照为可选图层数据：失败降级为空列表（省会/主要城市手写名单仍可用），
    // 不占用主数据错误通道。
    loadCityPlaces(controller.signal)
      .then((places) => {
        if (active) {
          setCityPlaces(places);
        }
      })
      .catch(() => {
        if (active) {
          setCityPlaces([]);
        }
      });
    // 板块边界快照同为可选图层数据：失败降级为空列表（板块名注记仍可用）。
    loadPlateLines(controller.signal)
      .then((lines) => {
        if (active) {
          setPlateLines(lines);
        }
      })
      .catch(() => {
        if (active) {
          setPlateLines([]);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  // 地图容器尺寸（tooltip clamp 用）。
  useEffect(() => {
    const element = mapAreaRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setMapSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 过滤变化后旧的 hover/钉住聚合可能已不存在，直接清除。
  useEffect(() => {
    setHover(null);
    setPin(null);
  }, [filters]);

  const months = useMemo(
    () => (snapshot ? monthOptions(snapshot.rangeStart, snapshot.rangeEnd) : []),
    [snapshot],
  );
  const filteredEvents = useMemo(
    () => (snapshot && filters ? filterEvents(snapshot.events, filters) : []),
    [snapshot, filters],
  );
  const clusters = useMemo(() => groupByLocation(filteredEvents), [filteredEvents]);
  const stats = useMemo(() => computeStats(filteredEvents), [filteredEvents]);

  // 头部标题与区间由数据源动态推导：标题年份取 rangeStart，
  // 区间取 events 实际首末地震日期（events 按时间倒序）；空则回退快照区间。
  const coverage = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    const events = snapshot.events;
    const first =
      events.length > 0 ? events[events.length - 1].timeText.slice(0, 10) : snapshot.rangeStart;
    const last = events.length > 0 ? events[0].timeText.slice(0, 10) : snapshot.rangeEnd;
    return { first, last, year: snapshot.rangeStart.slice(0, 4) };
  }, [snapshot]);

  // 浏览器页签标题同样按数据源年份修正。
  useEffect(() => {
    if (coverage) {
      document.title = `${coverage.year} 全国地震分布 · CEIC 数据`;
    }
  }, [coverage]);

  // 钉住同一聚合时不再叠加 hover tooltip。
  const hoverTip = hover && !(pin && pin.cluster.key === hover.cluster.key) ? hover : null;

  return (
    <div className="quake-app">
      <header className="quake-topbar">
        <button
          type="button"
          className="panel-toggle"
          aria-expanded={panelOpen}
          aria-label={panelOpen ? '收起过滤与统计面板' : '展开过滤与统计面板'}
          title={panelOpen ? '收起面板' : '展开面板'}
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? (
            <PanelLeftClose size={16} aria-hidden="true" />
          ) : (
            <PanelLeftOpen size={16} aria-hidden="true" />
          )}
        </button>
        <h1 className="quake-title">
          {coverage ? `${coverage.year} 年 1 月至今全国地震分布` : '全国地震分布'}
        </h1>
        {snapshot && coverage && (
          <p className="quake-summary">
            {coverage.first} ~ {coverage.last} · 快照 {snapshot.count} 条 · 当前过滤{' '}
            {filteredEvents.length} 条 / {clusters.length} 个地区
          </p>
        )}
      </header>

      <main className="quake-body">
        {panelOpen && filters && (
          <aside className="quake-panel-col" aria-label="过滤与统计面板">
            <FilterPanel
              filters={filters}
              months={months}
              showBelts={showBelts}
              showCities={showCities}
              showPlates={showPlates}
              onChange={setFilters}
              onShowBeltsChange={setShowBelts}
              onShowCitiesChange={setShowCities}
              onShowPlatesChange={setShowPlates}
            />
            <StatsPanel stats={stats} />
          </aside>
        )}

        <section className="quake-map-area" ref={mapAreaRef} aria-label="地震分布地图">
          <MapCanvas
            clusters={clusters}
            showBelts={showBelts}
            scope={filters?.scope ?? 'domestic'}
            showCities={showCities}
            cityPlaces={cityPlaces}
            showPlates={showPlates}
            plateLines={plateLines}
            onHoverChange={setHover}
            onPinChange={setPin}
          />

          {hoverTip && (
            <Tooltip
              cluster={hoverTip.cluster}
              x={hoverTip.x}
              y={hoverTip.y}
              containerWidth={mapSize.width}
              containerHeight={mapSize.height}
              pinned={false}
            />
          )}
          {pin && (
            <Tooltip
              cluster={pin.cluster}
              x={pin.x}
              y={pin.y}
              containerWidth={mapSize.width}
              containerHeight={mapSize.height}
              pinned
              onClose={() => setPin(null)}
            />
          )}

          <Legend includeOverseas={filters?.scope === 'all'} />

          {snapshot && (
            <footer className="quake-credit">
              数据来源：
              <a href={snapshot.source || CEIC_URL} target="_blank" rel="noopener noreferrer">
                {snapshot.sourceName || '中国地震台网中心（CEIC）'}
              </a>
              {' · 快照时间 '}
              {formatFetchedAt(snapshot.fetchedAt)}
              {' · 板块边界 PB2002（Bird, 2003） · 运行 '}
              <code>npm run fetch:quakes</code> / <code>fetch:plates</code> 更新数据
            </footer>
          )}
        </section>
      </main>

      {!snapshot && !loadError && (
        <div className="quake-overlay" role="status" aria-live="polite">
          <span className="quake-spinner" aria-hidden="true" />
          地震数据加载中…
        </div>
      )}
      {loadError && (
        <div className="quake-overlay quake-overlay-error" role="alert">
          <p className="quake-error-text">{loadError}</p>
          <button type="button" className="quake-retry" onClick={() => setReloadKey((key) => key + 1)}>
            重试
          </button>
        </div>
      )}
    </div>
  );
}
