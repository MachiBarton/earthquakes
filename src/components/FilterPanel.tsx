import type { QuakeFilters, QuakeScope } from '../cluster';

interface FilterPanelProps {
  filters: QuakeFilters;
  /** 月份下拉选项（2026-01 … rangeEnd 所在月）。 */
  months: readonly string[];
  /** 地震带示意层开关（图层状态，不属于数据过滤条件）。 */
  showBelts: boolean;
  /** 城市名注记开关（图层状态）。 */
  showCities: boolean;
  /** 全球板块图层开关（图层状态）。 */
  showPlates: boolean;
  onChange: (next: QuakeFilters) => void;
  onShowBeltsChange: (show: boolean) => void;
  onShowCitiesChange: (show: boolean) => void;
  onShowPlatesChange: (show: boolean) => void;
}

const SCOPE_OPTIONS: ReadonlyArray<{ value: QuakeScope; label: string }> = [
  { value: 'domestic', label: '仅国内' },
  { value: 'all', label: '含国外' },
];

function monthLabel(month: string): string {
  const [year, mm] = month.split('-');
  return `${year} 年 ${Number(mm)} 月`;
}

/**
 * 过滤面板：范围切换（仅国内默认 / 含国外）、最小震级滑块（1.0–6.0 步进 0.5）、
 * 月份范围两个 select、地震带示意层开关。过滤变化时由父组件重建聚合与地图图元。
 */
export default function FilterPanel({
  filters,
  months,
  showBelts,
  showCities,
  showPlates,
  onChange,
  onShowBeltsChange,
  onShowCitiesChange,
  onShowPlatesChange,
}: FilterPanelProps) {
  const patch = (partial: Partial<QuakeFilters>) => {
    onChange({ ...filters, ...partial });
  };
  const onMonthStart = (monthStart: string) => {
    // 保证 monthStart ≤ monthEnd。
    patch({ monthStart, monthEnd: monthStart > filters.monthEnd ? monthStart : filters.monthEnd });
  };
  const onMonthEnd = (monthEnd: string) => {
    patch({ monthEnd, monthStart: monthEnd < filters.monthStart ? monthEnd : filters.monthStart });
  };

  return (
    <section className="panel quake-filters" aria-label="地震过滤条件">
      <h2 className="panel-title">过滤</h2>
      <fieldset className="filter-field">
        <legend className="filter-legend">范围</legend>
        <div className="filter-scope">
          {SCOPE_OPTIONS.map((option) => (
            <label key={option.value} className="filter-radio">
              <input
                type="radio"
                name="quake-scope"
                value={option.value}
                checked={filters.scope === option.value}
                onChange={() => patch({ scope: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="filter-field">
        <label className="filter-label" htmlFor="quake-min-mag">
          最小震级
          <output className="filter-output" htmlFor="quake-min-mag">
            ≥ {filters.minMag.toFixed(1)}
          </output>
        </label>
        <input
          id="quake-min-mag"
          type="range"
          min={1}
          max={6}
          step={0.5}
          value={filters.minMag}
          onChange={(event) => patch({ minMag: Number(event.target.value) })}
          aria-label="最小震级"
        />
      </div>
      <div className="filter-field">
        <label className="filter-label" htmlFor="quake-month-start">
          月份范围
        </label>
        <div className="filter-months">
          <select
            id="quake-month-start"
            value={filters.monthStart}
            onChange={(event) => onMonthStart(event.target.value)}
            aria-label="起始月份"
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
          <span aria-hidden="true">—</span>
          <select
            id="quake-month-end"
            value={filters.monthEnd}
            onChange={(event) => onMonthEnd(event.target.value)}
            aria-label="结束月份"
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="filter-field filter-layers">
        <legend className="filter-legend">图层</legend>
        <label className="filter-radio" htmlFor="quake-show-belts">
          <input
            id="quake-show-belts"
            type="checkbox"
            checked={showBelts}
            onChange={(event) => onShowBeltsChange(event.target.checked)}
          />
          地震带（简化示意）
        </label>
        <label className="filter-radio" htmlFor="quake-show-cities">
          <input
            id="quake-show-cities"
            type="checkbox"
            checked={showCities}
            onChange={(event) => onShowCitiesChange(event.target.checked)}
          />
          城市名注记
        </label>
        <label className="filter-radio" htmlFor="quake-show-plates">
          <input
            id="quake-show-plates"
            type="checkbox"
            checked={showPlates}
            onChange={(event) => onShowPlatesChange(event.target.checked)}
          />
          全球板块
        </label>
      </fieldset>
    </section>
  );
}
