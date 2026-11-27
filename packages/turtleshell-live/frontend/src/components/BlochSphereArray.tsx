import React, { useEffect, useState } from 'react';
import { useSimStore, QubitState } from '../store/useSimStore';
import { translations } from '../locales/translations';
import { getTenantColor } from './Chip3DViewer';

/**
 * Format coherence time (in µs) to the most readable SI unit.
 * Examples:
 *   50_000_000µs → "50s"
 *   3e14µs       → "300Gs"  (giga-seconds)
 *   0.5µs        → "500ns"
 */
const fmtTime = (us: number, isRu: boolean = false): string => {
  if (!isFinite(us) || isNaN(us) || us <= 0) return '—';
  const sec = us / 1e6;
  if (sec >= 1e12) return (sec / 1e12).toPrecision(3).replace(/\.?0+$/, '') + (isRu ? 'Тс' : 'Ts');
  if (sec >= 1e9)  return (sec / 1e9).toPrecision(3).replace(/\.?0+$/, '')  + (isRu ? 'Гс' : 'Gs');
  if (sec >= 1e6)  return (sec / 1e6).toPrecision(3).replace(/\.?0+$/, '')  + (isRu ? 'Мс' : 'Ms');
  if (sec >= 1e3)  return (sec / 1e3).toPrecision(3).replace(/\.?0+$/, '')  + (isRu ? 'кс' : 'ks');
  if (sec >= 1)    return sec.toPrecision(3).replace(/\.?0+$/, '')           + (isRu ? 'с' : 's');
  // fall back to µs
  if (us >= 1e3)   return (us / 1e3).toPrecision(3).replace(/\.?0+$/, '')   + (isRu ? 'мс' : 'ms');
  if (us >= 1)     return us.toPrecision(3).replace(/\.?0+$/, '')            + (isRu ? 'мкс' : 'µs');
  return (us * 1e3).toPrecision(3).replace(/\.?0+$/, '')                    + (isRu ? 'нс' : 'ns');
};

export const BlochSphereArray: React.FC = () => {
  const store = useSimStore();
  const metrics = store.metrics;
  const scrubIndex = store.scrubIndex;
  const history = store.history;
  const connected = store.connected;
  
  const lang = store.language;
  const t = translations[lang];

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, [connected]);

  if (!metrics || !metrics.qpu) {
    return (
      <div className="w-full text-center text-[var(--text-muted)] font-mono text-xs p-6">
        AWAITING QUBIT SPIN STATE DATA...
      </div>
    );
  }

  // Determine active metrics frame (scrubbed or live)
  const isScrubbing = scrubIndex !== null && history.qpu.length > 0;
  const clampedScrub = isScrubbing ? Math.max(0, Math.min(scrubIndex as number, history.qpu.length - 1)) : 0;
  const activeQpu = isScrubbing ? history.qpu[clampedScrub] : metrics.qpu;
  const activeStep = isScrubbing ? clampedScrub : tick;
  const displayFidelity = isScrubbing && history.fidelity[clampedScrub] !== undefined
    ? history.fidelity[clampedScrub] / 100.0
    : metrics.fidelity;
  const baseBenchFidelity = store.qpuType.includes('trapped_ion')
    ? 0.995
    : store.qpuType.includes('sr_optical')
    ? 0.999
    : 0.94;
  const displayFidelityDrop = isScrubbing
    ? Math.max(0.0, (baseBenchFidelity - displayFidelity) * 100.0)
    : Math.max(0.0, Math.abs(metrics.fidelity_drop ?? 0));
  const activeQubitsList = activeQpu?.qubits ?? [];
  const displayAvgT1 = isScrubbing && activeQubitsList.length > 0
    ? activeQubitsList.reduce((acc, q) => acc + q.t1, 0) / activeQubitsList.length
    : metrics.average_t1;
  const displayAvgT2 = isScrubbing && activeQubitsList.length > 0
    ? activeQubitsList.reduce((acc, q) => acc + q.t2, 0) / activeQubitsList.length
    : metrics.average_t2;
  const displayRfDb = isScrubbing && activeQpu?.rf_leakage_db !== undefined
    ? activeQpu.rf_leakage_db
    : (metrics.rf_leakage_db ?? -80);

  const R = 62;
  const x0 = 80;
  const y0 = 80;

  const getVectorCoords = (theta: number, phi: number, mag: number) => {
    const x3d = mag * Math.sin(theta) * Math.cos(phi);
    const y3d = mag * Math.sin(theta) * Math.sin(phi);
    const z3d = mag * Math.cos(theta);

    const x_screen = x3d * Math.cos(0.5) - y3d * Math.sin(0.5);
    const y_screen = z3d * Math.cos(0.3) - (x3d * Math.sin(0.5) + y3d * Math.cos(0.5)) * Math.sin(0.3);

    return {
      x: x0 + x_screen * R,
      y: y0 - y_screen * R,
    };
  };

  const qubits = activeQpu.qubits;
  if (qubits.length === 0) {
    return (
      <div className="w-full text-center text-[var(--text-muted)] font-mono text-xs p-6">
        AWAITING QUBIT SPIN STATE DATA...
      </div>
    );
  }

  const qVictim = qubits.find(q => q.active_tenant === 0) || qubits[0];
  const qAggressor = qubits.find(q => q.active_tenant === 1) || qubits[1] || qubits[0];
  const qNeighbor = qubits.find(q => q.active_tenant === 2) || qubits[2] || qubits[0];
  const freeQubit = qubits.find(q => q.active_tenant === null);
  const qIdle = freeQubit || qubits[3] || qubits[0];

  const t0Label = lang === 'RU' ? 'T0 Жертва' : 'T0 Victim';
  const t1Label = lang === 'RU' ? 'T1 Агрессор' : 'T1 Aggressor';
  const t2Label = lang === 'RU' ? 'T2 Сосед' : 'T2 Neighbor';
  const idleLabel = lang === 'RU' ? 'Свободный' : 'Idle Qubit';
  const roleLabel = (q: QubitState) =>
    q.active_tenant === 0 ? t0Label :
    q.active_tenant === 1 ? t1Label :
    q.active_tenant === 2 ? t2Label :
    q.active_tenant !== null ? `T${q.active_tenant}` : idleLabel;

  const inspectQubits = [
    { qRef: qVictim, label: `Q${qVictim.id} ${roleLabel(qVictim)}`, isIdle: qVictim.active_tenant === null, color: getTenantColor(qVictim.active_tenant) },
    { qRef: qAggressor, label: `Q${qAggressor.id} ${roleLabel(qAggressor)}`, isIdle: qAggressor.active_tenant === null, color: getTenantColor(qAggressor.active_tenant) },
    { qRef: qNeighbor, label: `Q${qNeighbor.id} ${roleLabel(qNeighbor)}`, isIdle: qNeighbor.active_tenant === null, color: getTenantColor(qNeighbor.active_tenant) },
    { qRef: qIdle, label: `Q${qIdle.id} ${roleLabel(qIdle)}`, isIdle: qIdle.active_tenant === null, color: getTenantColor(qIdle.active_tenant) }
  ];

  const scrubbedZ = isScrubbing ? (history.zScore[clampedScrub] ?? 0) : (metrics.monitor_z_score ?? 0);
  const scrubbedLoss = isScrubbing ? (history.lossL4[clampedScrub] ?? 0) : (metrics.autoencoder_loss_l4 ?? 0);
  const threatLevel = isScrubbing
    ? (scrubbedZ >= 5.25 ? 3 : scrubbedZ >= 3.5 ? 2 : scrubbedZ >= 2.5 ? 1 : 0)
    : (metrics.monitor_threat_level ?? 0);
  const isAnomalyL4 = isScrubbing ? (scrubbedLoss > 0.08 || threatLevel >= 2) : metrics.anomaly_flagged_l4;
  const threatLabels = [t.threatLevel0, t.threatLevel1, t.threatLevel2, t.threatLevel3];
  const threatLabel = threatLevel === 0 && !isAnomalyL4 ? t.threatLevelNone : (threatLabels[threatLevel] ?? t.threatLevelNone);
  const cleanThreatLabel = threatLabel.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '');

  return (
    <div className="w-full h-[520px] hud-panel p-4 flex flex-row gap-5 font-mono text-xs select-text">
      
      {/* Left Column: Enlarged Bloch Spheres Grid (160x160) */}
      <div className="flex-1 grid grid-cols-2 gap-4 items-center justify-items-center">
        {inspectQubits.map((iq, idx) => {
          const q = iq.qRef;
          let theta = 0.0;
          let phi = 0.0;
          let mag = 1.0;

          if (!iq.isIdle && q) {
            const cohRatio = Math.max(0.0, Math.min(1.0, displayFidelity / baseBenchFidelity));
            const t2Health = q.t1 > 0 ? Math.max(0.15, Math.min(1.0, q.t2 / (1.0 * q.t1))) : 1.0;
            const theta_phase = (q.gate_count * 0.25) + (activeStep * 0.12);
            theta = (Math.PI / 4) + (Math.PI / 4) * Math.sin(theta_phase + q.id) * cohRatio;
            mag = Math.max(0.08, Math.min(1.0, cohRatio * (0.75 + 0.25 * t2Health)));
            phi = q.gate_count * 0.45 + activeStep * 0.18;
          }

          const vec = getVectorCoords(theta, phi, mag);
          const zero = getVectorCoords(0, 0, 1);
          const one = getVectorCoords(Math.PI, 0, 1);

          return (
            <div key={`${q.id}-${idx}`} className="flex flex-col items-center gap-1.5">
              {/* SVG Canvas - Enlarged to 160x160 */}
              <svg width="160" height="160" viewBox="0 0 160 160" className="overflow-visible">
                <circle cx={x0} cy={y0} r={R} fill="none" stroke="var(--border-bright)" strokeWidth="1.2" />
                <ellipse cx={x0} cy={y0} rx={R} ry={R * 0.3} fill="none" stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3" />
                <ellipse cx={x0} cy={y0} rx={R * 0.3} ry={R} fill="none" stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3" />
                <line x1={zero.x} y1={zero.y} x2={one.x} y2={one.y} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="2,3" />
                
                {/* Spaced out |0⟩ and |1⟩ labels */}
                <text x={zero.x} y={zero.y - 8} textAnchor="middle" fill="var(--text-main)" fontSize="11" fontWeight="bold">|0⟩</text>
                <text x={one.x} y={one.y + 18} textAnchor="middle" fill="var(--text-main)" fontSize="11" fontWeight="bold">|1⟩</text>

                {/* Tactical Colored Spin Vector Line & Arrow Dot */}
                <line x1={x0} y1={y0} x2={vec.x} y2={vec.y} stroke={iq.color} strokeWidth="3" strokeLinecap="round" />
                <circle cx={vec.x} cy={vec.y} r="4" fill={iq.color} />
              </svg>

              {/* 3 Rows of Text under each sphere */}
              <div className="flex flex-col items-center text-center leading-tight">
                {/* Row 1: Label */}
                <span className="font-bold text-xs truncate max-w-[150px] text-[var(--text-main)]">
                  {iq.label}
                </span>

                {/* Row 2: T1 & T2 Telemetry */}
                <span className="text-xs text-[var(--text-muted)] font-mono">
                  T1: {fmtTime(q.t1, lang === 'RU')} / T2: {fmtTime(q.t2, lang === 'RU')}
                </span>

                {/* Row 3: Spin Coherence Magnitude & Dephasing Status */}
                <span className="text-xs text-[var(--text-muted)] opacity-90 font-mono">
                  R: {mag.toFixed(3)} ({mag >= 0.98 ? (lang === 'RU' ? 'чистый' : 'pure') : (lang === 'RU' ? 'дефазировка' : 'dephased')})
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right Column: Real-time Telemetry Metrics Column */}
      <div className="w-52 flex flex-col gap-3 border-l border-[var(--border-color)] pl-4 justify-center">
        <div className="p-2.5 hud-inset flex flex-col gap-1">
          <span className="text-xs text-[var(--text-muted)] uppercase font-bold">{t.fidelity}</span>
          <span className="text-base font-bold font-mono text-[var(--text-main)]">
            {(displayFidelity * 100).toFixed(2)}%
          </span>
        </div>

        <div className="p-2.5 hud-inset flex flex-col gap-1">
          <span className="text-xs text-[var(--text-muted)] uppercase font-bold">{t.fidelityDrop}</span>
          <span className="text-base font-bold font-mono text-[var(--text-main)]">
            -{displayFidelityDrop.toFixed(2)}%
          </span>
        </div>

        <div className="p-2.5 hud-inset flex flex-col gap-1">
          <span className="text-xs text-[var(--text-muted)] uppercase font-bold">{t.avgT1}</span>
          <span className="text-base font-bold font-mono text-[var(--text-main)]">
            {fmtTime(displayAvgT1, lang === 'RU')}
          </span>
        </div>

        <div className="p-2.5 hud-inset flex flex-col gap-1">
          <span className="text-xs text-[var(--text-muted)] uppercase font-bold">{t.avgT2}</span>
          <span className="text-base font-bold font-mono text-[var(--text-main)]">
            {fmtTime(displayAvgT2, lang === 'RU')}
          </span>
        </div>

        <div className="p-2.5 hud-inset flex flex-col gap-1">
          <span className="text-xs text-[var(--text-muted)] uppercase font-bold">{t.rfLeakageDb}</span>
          <span className="text-base font-bold font-mono text-[var(--text-main)]">
            {displayRfDb.toFixed(1)} {lang === 'RU' ? 'дБм' : 'dBm'}
          </span>
        </div>

        <div className="p-2.5 hud-inset flex flex-col gap-1">
          <span className="text-xs text-[var(--text-muted)] uppercase font-bold">{t.threatLevel}</span>
          <span className="text-xs font-bold font-mono text-[var(--text-main)]">
            {cleanThreatLabel}
          </span>
        </div>
      </div>

    </div>
  );
};
