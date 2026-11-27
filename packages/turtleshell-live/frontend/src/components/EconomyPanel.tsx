import React from 'react';
import { useSimStore } from '../store/useSimStore';
import { translations } from '../locales/translations';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const smartTick = (v: number): string => {
  if (!isFinite(v) || isNaN(v)) return '?';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs === 0) return '0';
  if (abs >= 1e12) return sign + (abs / 1e12).toPrecision(3).replace(/\.?0+$/, '') + 'T';
  if (abs >= 1e9)  return sign + (abs / 1e9).toPrecision(3).replace(/\.?0+$/, '')  + 'G';
  if (abs >= 1e6)  return sign + (abs / 1e6).toPrecision(3).replace(/\.?0+$/, '')  + 'M';
  if (abs >= 1e3)  return sign + (abs / 1e3).toPrecision(3).replace(/\.?0+$/, '')  + 'k';
  return sign + parseFloat(abs.toPrecision(4)).toString();
};

export const EconomyPanel: React.FC = () => {
  const store = useSimStore();
  const metrics = store.metrics;
  const history = store.history;
  const lang = store.language;
  const t = translations[lang];
  const isRu = lang === 'RU';

  if (!metrics) return null;

  // ── Chart history & Scrub-aware metrics ──────────────────────────────────────
  const scrubIndex    = store.scrubIndex;
  const historyLength = history.labels.length;
  const activeIndex   = scrubIndex !== null && historyLength > 0 ? Math.min(scrubIndex, historyLength - 1) : historyLength - 1;
  const isScrubbing   = scrubIndex !== null && historyLength > 0;

  const baseFidelity    = store.qpuType.includes('trapped_ion')
    ? 0.995
    : store.qpuType.includes('sr_optical')
      ? 0.999
      : 0.94;
  const displayFidelity = isScrubbing && history.fidelity[activeIndex] !== undefined
    ? history.fidelity[activeIndex] / 100.0
    : (metrics.fidelity ?? baseFidelity);
  const displaySavings  = isScrubbing ? (history.savings[activeIndex] ?? metrics.cumulative_savings) : metrics.cumulative_savings;
  const displayCosts    = isScrubbing ? (history.costs[activeIndex] ?? metrics.cumulative_costs) : metrics.cumulative_costs;
  const displayWasted   = isScrubbing
    ? (history.wastedCash[activeIndex] ?? metrics.cumulative_wasted_cash ?? 0)
    : (metrics.cumulative_wasted_cash ?? 0);
  const displayDropPct  = isScrubbing
    ? Math.max(0.0, (baseFidelity - displayFidelity) * 100.0)
    : Math.max(0.0, metrics.fidelity_drop);
  const parsedLabelStep = isScrubbing && history.labels[activeIndex]
    ? parseInt(history.labels[activeIndex].replace('#', ''), 10)
    : metrics.time_step;
  const displayStep     = Number.isFinite(parsedLabelStep) && parsedLabelStep > 0 ? parsedLabelStep : metrics.time_step;

  const baseRunCost     = (store.hourlyCost * (store.utilization / 100.0)) / 360.0;
  const perStepCost     = baseRunCost + (displayStep > 0 ? (displayCosts / displayStep) : 0);
  const costPerJob      = perStepCost / Math.max(0.1, displayFidelity / baseFidelity);

  const chartData = history.labels.slice(0, activeIndex + 1).map((lbl, idx) => ({
    time:    lbl,
    savings: history.savings[idx] ?? 0,
    costs:   history.costs[idx]   ?? 0,
  }));

  // ── Metric cards config ──────────────────────────────────────────────────────
  const cards = [
    { label: t.avoidedLoss,           value: `$${displaySavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: t.operationOpex,         value: `$${displayCosts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: t.wastedQpuCash,         value: `$${displayWasted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: t.slaBreachProb,         value: `${displayDropPct.toFixed(2)}%` },
    { label: t.costPerLogicalFidelity, value: `$${costPerJob.toFixed(2)}` },
    {
      label: t.hourlyQpuCost,
      isSlider: true,
      sliderProps: { min: 800, max: 2200, step: 50, value: store.hourlyCost },
      display: `$${store.hourlyCost}${isRu ? '/час' : '/hr'}`,
      onChange: (v: number) => store.setConfigs({ hourlyCost: v }),
    },
    {
      label: t.processorUtilization,
      isSlider: true,
      sliderProps: { min: 40, max: 85, step: 1, value: store.utilization },
      display: `${store.utilization}%`,
      onChange: (v: number) => store.setConfigs({ utilization: v }),
    },
  ];

  return (
    <div className="w-full hud-panel flex flex-col font-mono text-xs select-text overflow-hidden">
      <div className="hud-header-bar">
        <span>{t.financialEvaluationTitle}</span>
      </div>

      <div className="p-3.5 flex flex-col gap-4">

        {/* All cards + sliders in a single flex-wrap row */}
        <div className="flex flex-wrap gap-2">
          {cards.map((card, i) => (
            <div key={i} className="p-2 hud-inset flex flex-col gap-0.5 flex-1 min-w-[130px]">
              <span className="text-xs text-[var(--text-muted)] font-bold leading-tight">{card.label}</span>
              {(card as any).isSlider ? (
                <>
                  <span className="text-base font-bold font-mono">{(card as any).display}</span>
                  <input
                    type="range"
                    aria-label={card.label}
                    min={(card as any).sliderProps.min}
                    max={(card as any).sliderProps.max}
                    step={(card as any).sliderProps.step}
                    value={(card as any).sliderProps.value}
                    onChange={(e) => (card as any).onChange(parseInt(e.target.value))}
                    className="mt-0.5"
                  />
                </>
              ) : (
                <span className="text-base font-bold font-mono">{(card as any).value}</span>
              )}
            </div>
          ))}
        </div>

        {/* Break-even chart */}
        <div className="flex flex-col gap-1.5">
          <span className="font-bold text-[var(--text-muted)] text-xs">{t.cumulativeLossOpex}</span>
          <div className="h-40 w-full hud-inset p-1.5 bg-[var(--bg-color)]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 12, left: 6, bottom: 5 }}>
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                <YAxis
                  stroke="var(--text-muted)"
                  domain={[0, 'auto']}
                  padding={{ top: 15, bottom: 0 }}
                  fontSize={10}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => '$' + smartTick(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--panel-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0px',
                    color: 'var(--text-main)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <Legend verticalAlign="top" height={15} iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                <Line
                  type="linear" dataKey="savings"
                  name={isRu ? 'Предотвращённый ущерб ($)' : 'Avoided Loss ($)'}
                  stroke="var(--text-main)" strokeWidth={1.5} dot={false}
                  isAnimationActive={false} strokeLinejoin="round" strokeLinecap="round"
                  activeDot={{ r: 3.5, stroke: 'var(--text-main)', strokeWidth: 1.5, fill: 'var(--bg-color)' }}
                />
                <Line
                  type="linear" dataKey="costs"
                  name={isRu ? 'Операционные расходы ($)' : 'OpEx ($)'}
                  stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="3 3" dot={false}
                  isAnimationActive={false} strokeLinejoin="round" strokeLinecap="round"
                  activeDot={{ r: 3.5, stroke: 'var(--text-muted)', strokeWidth: 1.5, fill: 'var(--bg-color)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};
