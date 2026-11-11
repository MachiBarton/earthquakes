import type { QuakeStats } from '../cluster';

interface StatsPanelProps {
  stats: QuakeStats;
}

/** 覆盖时间段展示：只保留日期部分（timeText 前 10 位）。 */
function dateOnly(timeText: string | null): string {
  return timeText ? timeText.slice(0, 10) : '—';
}

/**
 * 统计卡：总次数、最大震级（及地点）、覆盖时间段、省份次数 Top10 横向条形、
 * 震级分布五档计数。UI chrome 黑白灰，只有震级色标用数据色（AGENTS.md 例外）。
 */
export default function StatsPanel({ stats }: StatsPanelProps) {
  const maxProvinceCount = stats.provinces[0]?.count ?? 0;
  return (
    <section className="panel quake-stats" aria-label="当前过滤统计">
      <h2 className="panel-title">统计</h2>
      {stats.total === 0 ? (
        <p className="stats-empty">当前过滤条件下没有地震记录，请放宽条件</p>
      ) : (
        <>
          <dl className="stat-grid">
            <div className="stat-cell">
              <dt>总次数</dt>
              <dd className="stat-value">{stats.total}</dd>
            </div>
            <div className="stat-cell">
              <dt>最大震级</dt>
              <dd className="stat-value">
                {stats.maxMagEvent ? `M${stats.maxMagEvent.mag.toFixed(1)}` : '—'}
                {stats.maxMagEvent && (
                  <span className="stat-sub">{stats.maxMagEvent.location}</span>
                )}
              </dd>
            </div>
            <div className="stat-cell">
              <dt>覆盖时间段</dt>
              <dd className="stat-value stat-range">
                {dateOnly(stats.fromText)} ~ {dateOnly(stats.toText)}
              </dd>
            </div>
          </dl>

          <h3 className="stats-subtitle">省份次数 Top10</h3>
          <ol className="prov-list">
            {stats.provinces.map((province) => (
              <li key={province.name} className="prov-row">
                <span className="prov-name" title={province.name}>
                  {province.name}
                </span>
                <span className="prov-track" aria-hidden="true">
                  <span
                    className="prov-bar"
                    style={{
                      width: `${maxProvinceCount > 0 ? (province.count / maxProvinceCount) * 100 : 0}%`,
                    }}
                  />
                </span>
                <span className="prov-count">{province.count}</span>
              </li>
            ))}
          </ol>

          <h3 className="stats-subtitle">震级分布</h3>
          <ul className="dist-list">
            {stats.distribution.map((entry) => (
              <li key={entry.tier} className="dist-row">
                <i className="quake-mag-dot" style={{ background: entry.color }} aria-hidden="true" />
                <span className="dist-label">{entry.label}</span>
                <b className="dist-count">{entry.count}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
