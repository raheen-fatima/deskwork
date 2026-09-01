import { useMemo } from 'react';
import { CHART_COLORS, extractChartData } from './chartData.js';

export function ChartSvg({ chart, sheet }) {
  const { labels, series } = useMemo(() => extractChartData(sheet, chart.range), [sheet.cells, chart.range]);
  const W = 318;
  const H = 180;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  if (!labels.length || !series.length) {
    return (
      <div
        style={{
          height: H + 'px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px'
        }}
      >
        {'No numeric data in ' + chart.range}
      </div>
    );
  }
  const allVals = series.flatMap((s) => s.values);
  const maxV = Math.max(0, ...allVals);
  const minV = Math.min(0, ...allVals);
  const span = maxV - minV || 1;
  if (chart.type === 'pie') {
    const vals = series[0].values.map((v) => Math.max(0, v));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = 100;
    const cy = H / 2;
    const r = 68;
    let angle = -Math.PI / 2;
    const slices = vals.map((v, i) => {
      const frac = v / total;
      const nextAngle = angle + frac * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(nextAngle);
      const y2 = cy + r * Math.sin(nextAngle);
      const large = frac > 0.5 ? 1 : 0;
      const d =
        frac >= 0.9999
          ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
          : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      angle = nextAngle;
      return (
        <path
          key={i}
          d={d}
          fill={CHART_COLORS[i % CHART_COLORS.length]}
          stroke="var(--surface)"
          strokeWidth={1.5}
        />
      );
    });
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title}>
        {slices}
        {labels.slice(0, 6).map((lbl, i) => (
          <g key={i} transform={`translate(185, ${24 + i * 22})`}>
            <rect width={10} height={10} rx={2} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            <text x={15} y={9} fontSize={10} fill="var(--text)">
              {String(lbl).slice(0, 14) + ' (' + vals[i] + ')'}
            </text>
          </g>
        ))}
      </svg>
    );
  }
  if (chart.type === 'bar') {
    const rowStep = plotH / labels.length;
    const barH = Math.max(3, (rowStep * 0.72) / series.length);
    const zeroX = padL + ((0 - minV) / span) * plotW;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title}>
        <line x1={zeroX} y1={padT} x2={zeroX} y2={padT + plotH} stroke="var(--border-strong)" />
        {labels.map((lbl, i) => (
          <g key={i}>
            <text
              x={padL - 4}
              y={padT + i * rowStep + rowStep / 2 + 3}
              fontSize={9}
              textAnchor="end"
              fill="var(--text-muted)"
            >
              {String(lbl).slice(0, 6)}
            </text>
            {series.map((s, si) => {
              const v = s.values[i];
              const vx = padL + ((v - minV) / span) * plotW;
              const x = Math.min(zeroX, vx);
              const w = Math.max(1, Math.abs(vx - zeroX));
              const y = padT + i * rowStep + rowStep * 0.14 + si * barH;
              return (
                <rect
                  key={si}
                  x={x}
                  y={y}
                  width={w}
                  height={barH - 1}
                  fill={CHART_COLORS[si % CHART_COLORS.length]}
                />
              );
            })}
          </g>
        ))}
      </svg>
    );
  }

  // Column, Line, Area
  const zeroY = padT + plotH - ((0 - minV) / span) * plotH;
  const colStep = plotW / labels.length;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title}>
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="var(--border-strong)" />
      <line x1={padL} y1={zeroY} x2={padL + plotW} y2={zeroY} stroke="var(--border-strong)" />
      <text x={padL - 4} y={padT + 8} fontSize={9} textAnchor="end" fill="var(--text-muted)">
        {Math.round(maxV * 100) / 100}
      </text>
      <text x={padL - 4} y={padT + plotH} fontSize={9} textAnchor="end" fill="var(--text-muted)">
        {Math.round(minV * 100) / 100}
      </text>
      {labels.map((lbl, i) => (
        <text
          key={i}
          x={padL + i * colStep + colStep / 2}
          y={H - 8}
          fontSize={9}
          textAnchor="middle"
          fill="var(--text-muted)"
        >
          {String(lbl).slice(0, 6)}
        </text>
      ))}
      {chart.type === 'column'
        ? labels.map((_, i) => {
            const bw = Math.max(3, (colStep * 0.72) / series.length);
            return series.map((s, si) => {
              const v = s.values[i];
              const vy = padT + plotH - ((v - minV) / span) * plotH;
              const y = Math.min(zeroY, vy);
              const barH = Math.max(1, Math.abs(vy - zeroY));
              const x = padL + i * colStep + colStep * 0.14 + si * bw;
              return (
                <rect
                  key={i + '_' + si}
                  x={x}
                  y={y}
                  width={bw - 1}
                  height={barH}
                  fill={CHART_COLORS[si % CHART_COLORS.length]}
                />
              );
            });
          })
        : series.map((s, si) => {
            const pts = s.values.map((v, i) => {
              const x = padL + i * colStep + colStep / 2;
              const y = padT + plotH - ((v - minV) / span) * plotH;
              return [x, y];
            });
            const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');
            const areaPath =
              pts.length > 0
                ? linePath + ` L ${pts[pts.length - 1][0]} ${zeroY} L ${pts[0][0]} ${zeroY} Z`
                : '';
            return (
              <g key={si}>
                {chart.type === 'area' ? (
                  <path d={areaPath} fill={CHART_COLORS[si % CHART_COLORS.length]} fillOpacity={0.22} />
                ) : null}
                <path
                  d={linePath}
                  fill="none"
                  stroke={CHART_COLORS[si % CHART_COLORS.length]}
                  strokeWidth={2}
                />
                {pts.map((p, pi) => (
                  <circle
                    key={pi}
                    cx={p[0]}
                    cy={p[1]}
                    r={2.5}
                    fill={CHART_COLORS[si % CHART_COLORS.length]}
                  />
                ))}
              </g>
            );
          })}
    </svg>
  );
}
