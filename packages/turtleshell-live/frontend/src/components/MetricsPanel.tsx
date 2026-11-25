import React from 'react';
import { useSimStore } from '../store/useSimStore';
import { translations } from '../locales/translations';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

// Shared tooltip style
const TOOLTIP_STYLE = {
  background: 'var(--panel-bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '0px',
  color: 'var(--text-main)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
};

const AXIS_PROPS = {
  stroke: 'var(--text-muted)',
  fontSize: 9,
  tickLine: false,
  axisLine: false,
} as const;

const LINE_PROPS = {
  type: 'linear' as const,      // Linear segments — crisp, exact & hover dot is always 100% on the line!
  strokeWidth: 1.5,
  dot: false,
  isAnimationActive: false,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

const ACTIVE_DOT = { r: 3.5, strokeWidth: 1.5, fill: 'var(--bg-color)' };

export const MetricsPanel: React.FC = () => {
  const store = useSimStore();
  const metrics = store.metrics;
  const history = store.history;
  const scrubIndex = store.scrubIndex;
  
  const lang = store.language;
  const t = translations[lang];

  if (!metrics) {
    return (
      <div className="w-full text-center text-[var(--text-muted)] font-mono text-xs p-4 hud-panel">
        AWAITING TELEMETRY STREAM...
      </div>
    );
  }

  // Support Playback Scrubbing & Synchronized History
  const historyLength = history.labels.length;
  const activeIndex = scrubIndex !== null ? Math.min(scrubIndex, historyLength - 1) : historyLength - 1;

  const displayLabels = history.labels.slice(0, activeIndex + 1);
  const displayFidelity = history.fidelity.slice(0, activeIndex + 1);
  const displayLossL4 = history.lossL4.slice(0, activeIndex + 1);
  const displayZScore = history.zScore.slice(0, activeIndex + 1);

  const chartData = displayLabels.map((lbl, idx) => ({
    label: lbl,
    fidelity: displayFidelity[idx],
    lossL4: displayLossL4[idx],
    zScore: displayZScore[idx],
  }));

  // Dynamic Y-axis domain with flush zero-baseline alignment
  const minFidelity = Math.min(85, ...displayFidelity);

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs select-text">
      {/* Chart 1: Fidelity over time */}
      <div className="hud-panel flex flex-col overflow-hidden">
        <div className="hud-header-bar">
          <span>{t.fidelityHistLog}</span>
        </div>
        <div className="p-2 flex-1">
          <div className="h-36 w-full bg-[var(--bg-color)]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 30, bottom: 8 }}>
                <XAxis dataKey="label" {...AXIS_PROPS} />
                <YAxis
                  {...AXIS_PROPS}
                  domain={[Math.floor(minFidelity - 1), 100]}
                  padding={{ top: 10, bottom: 0 }}
                  width={48}
                  tickFormatter={(v) => typeof v === 'number' ? `${v.toFixed(0)}%` : v}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  {...LINE_PROPS}
                  dataKey="fidelity"
                  stroke="var(--text-main)"
                  activeDot={{ ...ACTIVE_DOT, stroke: 'var(--text-main)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Chart 2: Contour 4 AE Reconstruction Loss */}
      <div className="hud-panel flex flex-col overflow-hidden">
        <div className="hud-header-bar">
          <span>{t.l4Loss}</span>
        </div>
        <div className="p-2 flex-1">
          <div className="h-36 w-full bg-[var(--bg-color)]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 30, bottom: 8 }}>
                <XAxis dataKey="label" {...AXIS_PROPS} />
                <YAxis
                  {...AXIS_PROPS}
                  domain={[0, 'auto']}
                  padding={{ top: 12, bottom: 0 }}
                  width={48}
                  tickFormatter={(v) => typeof v === 'number' ? v.toFixed(3) : v}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  {...LINE_PROPS}
                  dataKey="lossL4"
                  stroke="var(--text-main)"
                  activeDot={{ ...ACTIVE_DOT, stroke: 'var(--text-main)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Chart 3: Contour 4 Z-Score Threat Monitor */}
      <div className="hud-panel flex flex-col overflow-hidden">
        <div className="hud-header-bar">
          <span>{t.zScoreLog}</span>
        </div>
        <div className="p-2 flex-1">
          <div className="h-36 w-full bg-[var(--bg-color)]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 30, bottom: 8 }}>
                <XAxis dataKey="label" {...AXIS_PROPS} />
                <YAxis
                  {...AXIS_PROPS}
                  domain={[0, 'auto']}
                  padding={{ top: 12, bottom: 0 }}
                  width={48}
                  tickFormatter={(v) => typeof v === 'number' ? `${v.toFixed(1)}σ` : v}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  {...LINE_PROPS}
                  dataKey="zScore"
                  stroke="var(--text-main)"
                  activeDot={{ ...ACTIVE_DOT, stroke: 'var(--text-main)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
