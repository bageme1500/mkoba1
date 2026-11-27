// Small hand-drawn SVG charts in the glass style (no chart library).
import { amount } from './format.js';

const compact = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));

/**
 * Grouped bars, e.g. expected vs collected per month.
 * @param data    [{ label, values: [number, number, ...], title? }]
 * @param series  [{ name, color }] (one per value)
 */
export function BarChart({ data, series, height = 200, ariaLabel }) {
    const W = 640;
    const H = height;
    const pad = { top: 12, right: 8, bottom: 26, left: 40 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const max = Math.max(1, ...data.flatMap((d) => d.values));
    const step = plotW / Math.max(1, data.length);
    const barW = Math.min(18, (step * 0.7) / series.length);
    const y = (v) => pad.top + plotH - (v / max) * plotH;
    const ticks = [0, 0.5, 1].map((f) => f * max);

    return (
        <figure>
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
                <defs>
                    {series.map((s, i) => (
                        <linearGradient key={i} id={`bar-${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity="0.95" />
                            <stop offset="100%" stopColor={s.color} stopOpacity="0.35" />
                        </linearGradient>
                    ))}
                </defs>
                {ticks.map((v) => (
                    <g key={v}>
                        <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} stroke="rgb(255 255 255 / 0.08)" strokeDasharray={v ? '3 4' : undefined} />
                        <text x={pad.left - 6} y={y(v) + 3} textAnchor="end" className="fill-slate-500" fontSize="10">
                            {compact(v)}
                        </text>
                    </g>
                ))}
                {data.map((d, i) => {
                    const cx = pad.left + step * i + step / 2;
                    const groupW = barW * series.length + 3 * (series.length - 1);
                    return (
                        <g key={d.label + i}>
                            {d.values.map((v, j) => {
                                const x = cx - groupW / 2 + j * (barW + 3);
                                const h = Math.max(v > 0 ? 2 : 0, pad.top + plotH - y(v));
                                return (
                                    <rect key={j} x={x} y={pad.top + plotH - h} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={`url(#bar-${j})`}>
                                        <title>{`${d.title || d.label} · ${series[j].name}: ${amount(v)}`}</title>
                                    </rect>
                                );
                            })}
                            <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-400" fontSize="11">
                                {d.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                {series.map((s) => (
                    <span key={s.name} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                        {s.name}
                    </span>
                ))}
            </figcaption>
        </figure>
    );
}

/**
 * Donut with a legend.
 * @param segments [{ label, value, color }]
 */
export function Donut({ segments, centerValue, centerLabel, ariaLabel }) {
    const total = segments.reduce((t, s) => t + s.value, 0);
    const r = 42;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return (
        <div className="flex items-center gap-5">
            <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label={ariaLabel}>
                <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="14" />
                {total > 0 &&
                    segments.map((s) => {
                        const len = (s.value / total) * c;
                        const el = (
                            <circle
                                key={s.label}
                                cx="60"
                                cy="60"
                                r={r}
                                fill="none"
                                stroke={s.color}
                                strokeWidth="14"
                                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                                strokeDashoffset={-offset}
                                strokeLinecap="round"
                            >
                                <title>{`${s.label}: ${s.value}`}</title>
                            </circle>
                        );
                        offset += len;
                        return s.value > 0 ? el : null;
                    })}
                <g className="rotate-90" style={{ transformOrigin: '60px 60px' }}>
                    <text x="60" y="58" textAnchor="middle" className="fill-white" fontSize="20" fontWeight="600">
                        {centerValue}
                    </text>
                    <text x="60" y="74" textAnchor="middle" className="fill-slate-400" fontSize="9">
                        {centerLabel}
                    </text>
                </g>
            </svg>
            <ul className="space-y-1.5 text-sm">
                {segments.map((s) => (
                    <li key={s.label} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                        <span className="text-slate-300">{s.label}</span>
                        <span className="font-semibold text-white">{s.value}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
