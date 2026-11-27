import React, { useEffect, useState } from 'react';
import { useSimStore } from '../store/useSimStore';
import { QubitState } from '../store/useSimStore';
import { translations } from '../locales/translations';
import { CustomSelect } from './CustomSelect';
import { getTenantColor } from '../utils/tenantColors';

interface Stabilizer {
  qubitIds: number[];
  type: 'X' | 'Z';
}

function normalizeCoords(qubits: QubitState[], width: number, height: number, padding: number) {
  if (qubits.length === 0) return new Map<number, { x: number; y: number }>();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const q of qubits) {
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.y > maxY) maxY = q.y;
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const map = new Map<number, { x: number; y: number }>();
  for (const q of qubits) {
    const nx = padding + ((q.x - minX) / spanX) * (width - 2 * padding);
    const ny = padding + ((q.y - minY) / spanY) * (height - 2 * padding);
    map.set(q.id, { x: nx, y: ny });
  }

  return map;
}

function generateStabilizers(qubits: QubitState[], adjList: Map<number, number[]>): Stabilizer[] {
  const stabilizers: Stabilizer[] = [];
  const visited = new Set<string>();

  // Skip O(V^4) 4-cycle search on dense all-to-all graphs (e.g. trapped ion Paul traps)
  const isDense = qubits.length > 8 && qubits.some(q => (adjList.get(q.id)?.length ?? 0) > 6);
  if (isDense) {
    for (let i = 0; i + 1 < qubits.length; i++) {
      stabilizers.push({ qubitIds: [qubits[i].id, qubits[i + 1].id], type: 'Z' });
    }
    return stabilizers;
  }

  for (const q of qubits) {
    const neighbors = adjList.get(q.id) ?? [];
    for (const n1 of neighbors) {
      const n1Neighbors = adjList.get(n1) ?? [];
      for (const n2 of n1Neighbors) {
        if (n2 === q.id) continue;
        const n2Neighbors = adjList.get(n2) ?? [];
        for (const n3 of n2Neighbors) {
          if (n3 === n1) continue;
          if (adjList.get(n3)?.includes(q.id)) {
            const quad = [q.id, n1, n2, n3].sort((a, b) => a - b);
            const key = quad.join(',');
            if (!visited.has(key)) {
              visited.add(key);
              const type = (quad[0] + quad[1]) % 2 === 0 ? 'Plaquette' : 'Star';
              stabilizers.push({
                qubitIds: quad,
                type: type === 'Plaquette' ? 'Z' : 'X',
              });
            }
          }
        }
      }
    }
  }

  if (stabilizers.length === 0) {
    for (const q of qubits) {
      const neighbors = adjList.get(q.id) ?? [];
      for (const n of neighbors) {
        if (n > q.id) {
          stabilizers.push({
            qubitIds: [q.id, n],
            type: 'Z'
          });
        }
      }
    }
  }

  return stabilizers;
}

const CHIP_W = 700;
const CHIP_H = 360;
const CHIP_PAD = 28;
const CHIP_BARRIER = 60;

function clampChipPan(tx: number, ty: number, s: number): { x: number; y: number } {
  const fieldL = tx + CHIP_PAD * s;
  const fieldR = tx + (CHIP_W - CHIP_PAD) * s;
  const fieldT = ty + CHIP_PAD * s;
  const fieldB = ty + (CHIP_H - CHIP_PAD) * s;

  let cx = tx;
  let cy = ty;
  if (fieldR < CHIP_BARRIER) cx = CHIP_BARRIER - (CHIP_W - CHIP_PAD) * s;
  if (fieldL > CHIP_W - CHIP_BARRIER) cx = (CHIP_W - CHIP_BARRIER) - CHIP_PAD * s;
  if (fieldB < CHIP_BARRIER) cy = CHIP_BARRIER - (CHIP_H - CHIP_PAD) * s;
  if (fieldT > CHIP_H - CHIP_BARRIER) cy = (CHIP_H - CHIP_BARRIER) - CHIP_PAD * s;
  return { x: cx, y: cy };
}

export const Chip3DViewer: React.FC = () => {
  const store = useSimStore();
  const metrics = store.metrics;
  const history = store.history;
  const connected = store.connected;
  const connectWS = store.connectWS;
  const disconnectWS = store.disconnectWS;
  const resetSim = store.resetSim;
  const activeScenario = store.activeScenario;
  const defenseL1 = store.defenseL1;
  const defenseL2 = store.defenseL2;
  const defenseL3 = store.defenseL3;
  const defenseL4 = store.defenseL4;
  const scrubIndex = store.scrubIndex;
  const isLight = store.theme === 'light';
  
  const lang = store.language;
  const t = translations[lang];

  const [hoveredQubitId, setHoveredQubitId] = useState<number | null>(null);
  const [animFrame, setAnimFrame] = useState(0);

  
  // Single atomic viewState object for synchronized, lag-free zoom & pan
  const [viewState, setViewState] = useState({ scale: 1.0, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null);
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const didDragRef = React.useRef(false);
  const touchStateRef = React.useRef<{
    mode: 'none' | 'pan' | 'pinch';
    lastClientX: number;
    lastClientY: number;
    startDist: number;
    startScale: number;
    startViewX: number;
    startViewY: number;
    centerSvgX: number;
    centerSvgY: number;
  }>({
    mode: 'none',
    lastClientX: 0,
    lastClientY: 0,
    startDist: 0,
    startScale: 1,
    startViewX: 0,
    startViewY: 0,
    centerSvgX: CHIP_W / 2,
    centerSvgY: CHIP_H / 2,
  });
  const viewStateRef = React.useRef(viewState);
  viewStateRef.current = viewState;

  const getClientToSvgScale = React.useCallback(() => {
    if (!svgElement) return { sx: 1, sy: 1 };
    const rect = svgElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return { sx: 1, sy: 1 };
    return { sx: CHIP_W / rect.width, sy: CHIP_H / rect.height };
  }, [svgElement]);

  // Animate pulses/effects every tick when playing live (paused during rewind scrubbing)
  useEffect(() => {
    if (!connected || scrubIndex !== null) return;
    const id = setInterval(() => setAnimFrame(f => f + 1), 120);
    return () => clearInterval(id);
  }, [connected, scrubIndex]);

  // Reset pan/zoom and hover cleanly when platform topology changes
  useEffect(() => {
    setViewState({ scale: 1.0, x: 0, y: 0 });
    setHoveredQubitId(null);
  }, [store.qpuType]);

  // Native non-passive listeners on map viewport for smooth mouse wheel zoom & touch pan/pinch
  useEffect(() => {
    const target = containerElement || svgElement;
    if (!target) return;

    const handleScrollZoom = (e: Event) => {
      const wheelEv = e as WheelEvent;
      wheelEv.preventDefault();
      wheelEv.stopPropagation();

      if (!svgElement) return;
      const ctm = svgElement.getScreenCTM();
      if (!ctm) return;

      const pt = svgElement.createSVGPoint();
      pt.x = wheelEv.clientX;
      pt.y = wheelEv.clientY;
      const svgCursor = pt.matrixTransform(ctm.inverse());
      const mouseX = svgCursor.x;
      const mouseY = svgCursor.y;

      setViewState((prev) => {
        const factor = wheelEv.deltaY < 0 ? 1.12 : 0.89;
        const nextScale = Math.min(3.5, Math.max(0.6, prev.scale * factor));
        const ratio = nextScale / prev.scale;

        const rawX = mouseX - (mouseX - prev.x) * ratio;
        const rawY = mouseY - (mouseY - prev.y) * ratio;
        const clamped = clampChipPan(rawX, rawY, nextScale);

        return { scale: nextScale, x: clamped.x, y: clamped.y };
      });
    };

    const getSvgPoint = (clientX: number, clientY: number) => {
      if (svgElement) {
        const ctm = svgElement.getScreenCTM();
        if (ctm) {
          const pt = svgElement.createSVGPoint();
          pt.x = clientX;
          pt.y = clientY;
          const tPt = pt.matrixTransform(ctm.inverse());
          return { x: tPt.x, y: tPt.y };
        }
      }
      return { x: CHIP_W / 2, y: CHIP_H / 2 };
    };

    const handleTouchStartNative = (e: Event) => {
      const touchEv = e as TouchEvent;
      if (touchEv.touches.length === 1) {
        didDragRef.current = false;
        touchStateRef.current = {
          ...touchStateRef.current,
          mode: 'pan',
          lastClientX: touchEv.touches[0].clientX,
          lastClientY: touchEv.touches[0].clientY,
        };
      } else if (touchEv.touches.length === 2) {
        touchEv.preventDefault();
        didDragRef.current = true;
        const t0 = touchEv.touches[0];
        const t1 = touchEv.touches[1];
        const dist = Math.max(1, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
        const mid = getSvgPoint((t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2);
        const cur = viewStateRef.current;
        touchStateRef.current = {
          ...touchStateRef.current,
          mode: 'pinch',
          startDist: dist,
          startScale: cur.scale,
          startViewX: cur.x,
          startViewY: cur.y,
          centerSvgX: mid.x,
          centerSvgY: mid.y,
        };
      }
    };

    const handleTouchMoveNative = (e: Event) => {
      const touchEv = e as TouchEvent;
      const state = touchStateRef.current;
      if (touchEv.touches.length === 1 && state.mode === 'pan') {
        const dxClient = touchEv.touches[0].clientX - state.lastClientX;
        const dyClient = touchEv.touches[0].clientY - state.lastClientY;
        if (Math.hypot(dxClient, dyClient) > 2) {
          didDragRef.current = true;
          touchEv.preventDefault();
        }
        state.lastClientX = touchEv.touches[0].clientX;
        state.lastClientY = touchEv.touches[0].clientY;
        const { sx, sy } = getClientToSvgScale();
        setViewState((prev) => {
          const clamped = clampChipPan(prev.x + dxClient * sx, prev.y + dyClient * sy, prev.scale);
          return { ...prev, x: clamped.x, y: clamped.y };
        });
      } else if (touchEv.touches.length === 2 && state.mode === 'pinch') {
        touchEv.preventDefault();
        const t0 = touchEv.touches[0];
        const t1 = touchEv.touches[1];
        const dist = Math.max(1, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
        const nextScale = Math.min(3.5, Math.max(0.6, state.startScale * (dist / state.startDist)));
        const ratio = nextScale / state.startScale;
        const rawX = state.centerSvgX - (state.centerSvgX - state.startViewX) * ratio;
        const rawY = state.centerSvgY - (state.centerSvgY - state.startViewY) * ratio;
        const clamped = clampChipPan(rawX, rawY, nextScale);
        setViewState({ scale: nextScale, x: clamped.x, y: clamped.y });
      }
    };

    const handleTouchEndNative = (e: Event) => {
      const touchEv = e as TouchEvent;
      if (touchEv.touches.length === 0) {
        touchStateRef.current.mode = 'none';
      } else if (touchEv.touches.length === 1) {
        touchStateRef.current = {
          ...touchStateRef.current,
          mode: 'pan',
          lastClientX: touchEv.touches[0].clientX,
          lastClientY: touchEv.touches[0].clientY,
        };
      }
    };

    target.addEventListener('wheel', handleScrollZoom, { passive: false });
    target.addEventListener('touchstart', handleTouchStartNative, { passive: false });
    target.addEventListener('touchmove', handleTouchMoveNative, { passive: false });
    target.addEventListener('touchend', handleTouchEndNative);

    return () => {
      target.removeEventListener('wheel', handleScrollZoom);
      target.removeEventListener('touchstart', handleTouchStartNative);
      target.removeEventListener('touchmove', handleTouchMoveNative);
      target.removeEventListener('touchend', handleTouchEndNative);
    };
  }, [containerElement, svgElement, getClientToSvgScale]);

  const W = CHIP_W;
  const H = CHIP_H;
  const PAD = CHIP_PAD;

  if (!metrics || !metrics.qpu) {
    return (
      <div className="w-full h-full min-h-[350px] flex flex-col font-mono text-xs gap-3 p-0 hud-panel">
        <div className="hud-inset p-2 font-bold select-none text-xs">{t.diagnosticErrorTitle}</div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="hud-inset bg-[var(--inset-bg)] p-4 font-bold text-xs leading-relaxed w-72">
            {t.noTelemetryStream}
            <br />
            {t.qpuTimeout}
            <br />
            {t.portProtocol}
          </div>
          <span className="text-xs text-[var(--text-muted)] max-w-sm">
            {t.ensurePythonServer}
          </span>
          <button
            type="button"
            onClick={connectWS}
            className="hud-button px-4 py-1 text-xs"
          >
            {t.retryConnectTelemetry}
          </button>
        </div>
      </div>
    );
  }

  // Determine active metrics frame (scrubbed or live)
  const isScrubbing = scrubIndex !== null && history.qpu.length > 0;
  const clampedScrub = isScrubbing ? Math.max(0, Math.min(scrubIndex as number, history.qpu.length - 1)) : 0;
  const activeQpu = isScrubbing ? history.qpu[clampedScrub] : metrics.qpu;

  const { qubits, couplers } = activeQpu;
  const coordMap = normalizeCoords(qubits, W, H, PAD);

  // Adjacency list for QEC stabilizers
  const adjMap = new Map<number, number[]>();
  for (const q of qubits) adjMap.set(q.id, []);
  for (const c of couplers) {
    if (c.active) {
      adjMap.get(c.q1)?.push(c.q2);
      adjMap.get(c.q2)?.push(c.q1);
    }
  }
  const stabilizers = generateStabilizers(qubits, adjMap);

  // Determine qubit radius based on count
  const nQ = qubits.length;
  const baseR = nQ > 100 ? 4.5 : nQ > 40 ? 6.5 : nQ > 10 ? 8 : 14;

  // Coupler thickness
  const couplerW = nQ > 100 ? 0.6 : 1.0;

  const getQubitBaseT1 = () => {
    const qpu = store.qpuType.toLowerCase();
    if (qpu.includes("sr_optical") || qpu.includes("optical")) return 6e7;
    if (qpu.includes("trapped_ion") || qpu.includes("paul")) return 1e6;
    if (qpu.includes("heron")) return 172.0;
    if (qpu.includes("sycamore") || qpu.includes("google")) return 20.0;
    if (qpu.includes("aspen") || qpu.includes("rigetti") || qpu.includes("braket")) return 30.0;
    if (qpu.includes("forte") || qpu.includes("ionq")) return 5e7;
    if (qpu.includes("simulated")) return 5e6;
    return 148.0;
  };

  const hoveredQubit = hoveredQubitId !== null ? (qubits.find((q) => q.id === hoveredQubitId) ?? null) : null;

  const fmtTime = (us: number): string => {
    if (!isFinite(us) || isNaN(us) || us <= 0) return '—';
    const isRu = lang === 'RU';
    const sec = us / 1e6;
    if (sec >= 1e3) return `${(sec / 1e3).toPrecision(3).replace(/\.?0+$/, '')} ${isRu ? 'кс' : 'ks'}`;
    if (sec >= 1) return `${sec.toPrecision(3).replace(/\.?0+$/, '')} ${isRu ? 'с' : 's'}`;
    if (us >= 1e3) return `${(us / 1e3).toPrecision(3).replace(/\.?0+$/, '')} ${isRu ? 'мс' : 'ms'}`;
    return `${us.toFixed(1)} ${isRu ? 'мкс' : 'µs'}`;
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const { sx, sy } = getClientToSvgScale();
    didDragRef.current = false;
    setIsDragging(true);
    setDragStart({
      x: e.clientX * sx - viewState.x,
      y: e.clientY * sy - viewState.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    const { sx, sy } = getClientToSvgScale();
    const rawX = e.clientX * sx - dragStart.x;
    const rawY = e.clientY * sy - dragStart.y;
    if (Math.abs(rawX - viewState.x) > 1.5 || Math.abs(rawY - viewState.y) > 1.5) {
      didDragRef.current = true;
    }
    const clamped = clampChipPan(rawX, rawY, viewState.scale);
    setViewState((prev) => ({ ...prev, x: clamped.x, y: clamped.y }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="relative w-full h-[340px] sm:h-[440px] lg:h-[520px] hud-panel overflow-hidden flex flex-col">
      
      {/* No display-mode tabs — always unified synthesis view */}

      {/* SVG Chip Map Display */}
      <div ref={setContainerElement} className="flex-1 bg-[var(--bg-color)] p-2 relative overflow-hidden touch-none">
        <svg
          ref={setSvgElement}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full cursor-grab active:cursor-grabbing select-text"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => {
            if (!didDragRef.current) setHoveredQubitId(null);
          }}
        >
          <g transform={`translate(${viewState.x}, ${viewState.y}) scale(${viewState.scale})`}>

            {/* Dot-grid INSIDE the transform — moves & scales with pan/zoom.
                 The rect is huge so it appears infinite in all directions.
                 patternUnits="userSpaceOnUse" means dots stay 20px apart in
                 SVG user space regardless of zoom (they scale with the view). */}
            <defs>
              <pattern id="qpu-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="0.7" fill="var(--text-main)" opacity="0.18" />
              </pattern>
            </defs>
            {/* 10000×10000 rect centred on origin — effectively infinite for any
                 pan/zoom combination the user can reach */}
            <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#qpu-grid)" />

            {/* QEC Stabilizer Plaquettes — always shown */}
            <g id="stabilizers-layer">
              {stabilizers.map((st, idx) => {
                const pts = st.qubitIds.map(id => coordMap.get(id)).filter(Boolean);
                if (pts.length < 2) return null;
                const pathStr = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p!.x} ${p!.y}`).join(' ') + ' Z';
                return (
                  <path
                    key={`st-${idx}`}
                    d={pathStr}
                    fill={st.type === 'Z' ? 'var(--inset-bg)' : 'var(--panel-bg)'}
                    fillOpacity={0.25}
                    stroke={st.type === 'Z' ? 'var(--border-bright)' : 'var(--border-color)'}
                    strokeWidth={0.8}
                    strokeDasharray="2,2"
                  />
                );
              })}
            </g>

            {/* Inter-Qubit Couplers */}
            <g id="couplers-layer">
              {couplers.map((c, idx) => {
                const p1 = coordMap.get(c.q1);
                const p2 = coordMap.get(c.q2);
                if (!p1 || !p2) return null;

                const isDetuned = !c.active;
                const strokeColor = isDetuned ? 'var(--border-color)' : 'var(--border-bright)';

                return (
                  <line
                    key={`c-${idx}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={strokeColor}
                    strokeWidth={couplerW}
                    strokeDasharray={isDetuned ? '2,2' : 'none'}
                    strokeOpacity={isDetuned ? 0.3 : 0.8}
                  />
                );
              })}
            </g>

            {/* Qubit Nodes Layer */}
            <g id="qubits-layer">
              {qubits.map((q) => {
                const pos = coordMap.get(q.id);
                if (!pos) return null;

                const isIdle = q.active_tenant === null;
                const r = baseR;

                const color = getTenantColor(q.active_tenant, isLight);
                const nodeOpacity = 0.95;

                // 100% Physics-Driven Contour-Specific Heatmap calculation
                const isVictim = q.active_tenant === 0;

                // 1. Empirical physical baseline error rate from active (or scrubbed) telemetry
                const baseErr1q = (q.err_1q ?? 0.0015);
                const baseErrReadout = (q.err_readout ?? 0.008);
                const phononVal = activeQpu.phonon_number ?? (isScrubbing ? (history.phonon[clampedScrub] ?? 0.05) : (metrics.phonon_number ?? 0.05));
                const rfLeakage = activeQpu.rf_leakage_db ?? (metrics.rf_leakage_db ?? -60.0);

                let physicalNoise = baseErr1q * 100.0 + baseErrReadout * 10.0;

                // 2. Scenario-specific attack heat elevation (aligned with backend defense contours)
                if (!isIdle && isVictim) {
                  if (activeScenario === 'crosstalk') {
                    if (!defenseL1 && !defenseL2) physicalNoise += 0.85;
                    else if (!defenseL1 || !defenseL2) physicalNoise += 0.35;
                  } else if (activeScenario === 'rowhammer') {
                    // Mitigated ONLY by Contour 3 (Cooling Buffer)
                    if (!defenseL3) physicalNoise += 0.90;
                  } else if (activeScenario === 'environment') {
                    // Scales with cryostat environment temperature excursion above 15 mK
                    const thermalFactor = store.qpuType.includes('sr_optical')
                      ? 0.05
                      : Math.max(0.1, (store.envTemperatureMk - 12.0) / 18.0 + phononVal * 0.25);
                    if (!defenseL3) physicalNoise += 0.75 * thermalFactor;
                  } else if (activeScenario === 'prime_probe') {
                    // Mitigated by Contour 3 (Reset) or Contour 4 (Monitoring)
                    if (!defenseL3 && !defenseL4) physicalNoise += 0.80;
                  } else if (activeScenario === 'rf_leakage') {
                    // RF leakage affects trapped-ion RF Paul traps; mitigated by Contour 1 (LMS)
                    if (store.qpuType.includes('trapped_ion') && !defenseL1) {
                      const rfFactor = Math.max(0.1, (rfLeakage + 60.0) / 30.0);
                      physicalNoise += 0.70 * rfFactor;
                    }
                  }
                }

                // Normalization bounded strictly [0.04, 1.0]
                const errRatio = Math.min(1.0, Math.max(0.04, physicalNoise));

                let heatAura = null;
                {
                  // Heatmap aura always rendered in unified mode
                  const heatColor = errRatio > 0.55 ? '#e63946' : errRatio > 0.28 ? '#f4a261' : '#2a9d8f';
                  const heatRadius = r * (0.9 + errRatio * 1.1);

                  heatAura = (
                    <g key={`heat-${q.id}`}>
                      <circle cx={pos.x} cy={pos.y} r={heatRadius * 1.5} fill={heatColor} fillOpacity={0.06 + errRatio * 0.12} />
                      <circle cx={pos.x} cy={pos.y} r={heatRadius} fill={heatColor} fillOpacity={0.10 + errRatio * 0.18} />
                      {errRatio > 0.30 && (
                        <circle cx={pos.x} cy={pos.y} r={heatRadius * 1.8} fill="none" stroke={heatColor} strokeWidth={0.7} strokeDasharray="2,3" strokeOpacity={0.35} />
                      )}
                    </g>
                  );
                }

                let extraEffect = null;
                if (!isIdle) {
                  if (activeScenario === 'prime_probe' && q.gate_count > 5) {
                    const ringR = r * (1.6 + 0.4 * Math.sin(animFrame * 0.25 + q.id));
                    extraEffect = (
                      <circle
                        key={`ring-${q.id}`}
                        cx={pos.x}
                        cy={pos.y}
                        r={ringR}
                        fill="none"
                        stroke={color}
                        strokeWidth={1}
                        strokeDasharray="2,2"
                        strokeOpacity={0.7}
                      />
                    );
                  }
                  if (activeScenario === 'environment') {
                    extraEffect = (
                      <circle
                        key={`env-${q.id}`}
                        cx={pos.x}
                        cy={pos.y}
                        r={r * 1.8}
                        fill="none"
                        stroke="#8c8672"
                        strokeWidth={0.7}
                        strokeDasharray="1,3"
                      />
                    );
                  }
                  if (activeScenario === 'crosstalk' && !defenseL1) {
                    const pulse = 0.5 + 0.5 * Math.sin(animFrame * 0.22 + q.id * 0.5);
                    extraEffect = (
                      <circle
                        key={`ct-${q.id}`}
                        cx={pos.x}
                        cy={pos.y}
                        r={r * (1.3 + pulse * 0.4)}
                        fill="none"
                        stroke={color}
                        strokeWidth={1}
                        strokeDasharray="3,1"
                        strokeOpacity={0.6}
                      />
                    );
                  }
                }

                const isHovered = hoveredQubitId === q.id;

                return (
                  <g key={`q-${q.id}`}>
                    {heatAura}
                    {extraEffect}
                    
                    {/* Hover indicator: existing dotted circle becomes crisp white */}
                    {isHovered && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={r * 1.6}
                        fill="none"
                        stroke="var(--border-bright)"
                        strokeWidth={1.5}
                        strokeDasharray="2,2"
                      />
                    )}

                    {/* Tenant Role Tags */}
                    {q.active_tenant !== null && (
                      <text
                        x={pos.x}
                        y={pos.y - r * 1.5}
                        textAnchor="middle"
                        fontSize={r * 0.75}
                        fill={getTenantColor(q.active_tenant, isLight)}
                        fontWeight="bold"
                        fontFamily="monospace"
                        pointerEvents="none"
                      >
                        {q.active_tenant === 0 ? 'V' : q.active_tenant === 1 ? 'A' : `T${q.active_tenant}`}
                      </text>
                    )}

                    {/* Main Qubit Node Circle */}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={isHovered ? r * 1.3 : r}
                      fill={isIdle ? 'var(--bg-color)' : color}
                      stroke="var(--border-bright)"
                      strokeWidth={1}
                      fillOpacity={nodeOpacity}
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoveredQubitId(q.id)}
                      onMouseLeave={() => setHoveredQubitId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!didDragRef.current) {
                          setHoveredQubitId((prev) => (prev === q.id ? null : q.id));
                        }
                      }}
                    />

                    {/* Qubit ID number */}
                    {nQ <= 40 && (
                      <text
                        x={pos.x}
                        y={pos.y + 3.5}
                        textAnchor="middle"
                        fontSize={r * 0.7}
                        fill={isIdle ? 'var(--text-muted)' : (isLight ? '#ffffff' : 'var(--bg-color)')}
                        fontWeight="bold"
                        fontFamily="monospace"
                        pointerEvents="none"
                      >
                        {q.id}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

          </g>
        </svg>

        {/* Hovered Qubit Telemetry Popup Box */}
        {hoveredQubit && (() => {
          const pos = coordMap.get(hoveredQubit.id);
          if (!pos) return null;
          const sx = viewState.x + pos.x * viewState.scale;
          const sy = viewState.y + pos.y * viewState.scale;
          const baseT1 = getQubitBaseT1();
          const t1Val = hoveredQubit.t1 ?? baseT1;
          const t2Val = hoveredQubit.t2 ?? (baseT1 * 0.65);

          return (
            <div
              style={{
                left: `clamp(6px, calc(${(sx / W) * 100}% + 10px), calc(100% - 12.5rem))`,
                top: `clamp(6px, calc(${(sy / H) * 100}% - 24px), calc(100% - 9rem))`,
              }}
              className="absolute pointer-events-none p-2.5 hud-panel bg-[var(--bg-color)] border border-[var(--border-bright)] text-xs font-mono w-48 flex flex-col gap-1.5 z-20"
            >
              <div className="font-bold border-b border-[var(--border-color)] pb-1 flex justify-between">
                <span>{lang === 'RU' ? 'Кубит' : 'Qubit'} Q{hoveredQubit.id}</span>
                <span className="text-[var(--text-muted)]">
                  {hoveredQubit.active_tenant === null ? t.qubitIdle : `${t.qubitTenant} ${hoveredQubit.active_tenant}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-[var(--text-muted)]">T1:</span>
                <span className="font-bold">{fmtTime(t1Val)}</span>
                <span className="text-[var(--text-muted)]">T2:</span>
                <span className="font-bold">{fmtTime(t2Val)}</span>
                <span className="text-[var(--text-muted)]">{t.qubit1qErr}</span>
                <span className="font-bold">{((hoveredQubit.err_1q ?? 0.001) * 100).toFixed(2)}%</span>
                <span className="text-[var(--text-muted)]">{t.qubitReadout}</span>
                <span className="font-bold">{((hoveredQubit.err_readout ?? 0.01) * 100).toFixed(2)}%</span>
                <span className="text-[var(--text-muted)]">{t.qubitGates}</span>
                <span className="font-bold">{hoveredQubit.gate_count}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Clean Timeline Scrubber & Simulation Controls */}
      <div className="bg-[var(--inset-bg)] border-t border-[var(--border-color)] p-2.5 flex flex-wrap items-center justify-between font-mono text-xs gap-2.5 select-none">
        
        {/* Buttons Group */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => { connected ? disconnectWS() : connectWS(); }}
            className="hud-button py-1 px-2 font-bold text-xs"
            title={connected ? (lang === 'RU' ? 'Пауза телеметрии' : 'Pause Telemetry') : (lang === 'RU' ? 'Запуск телеметрии' : 'Start Telemetry')}
            aria-label={connected ? (lang === 'RU' ? 'Пауза телеметрии' : 'Pause telemetry') : (lang === 'RU' ? 'Запуск телеметрии' : 'Start telemetry')}
          >
            {connected ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <rect x="2" y="1" width="3" height="10" />
                <rect x="7" y="1" width="3" height="10" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <polygon points="2,1 11,6 2,11" />
              </svg>
            )}
          </button>
          
          <button
            type="button"
            onClick={() => resetSim()}
            className="hud-button py-1 px-2 font-bold text-xs"
            title={lang === 'RU' ? 'Сброс симуляции' : 'Reset Simulation'}
            aria-label={lang === 'RU' ? 'Сброс симуляции' : 'Reset simulation'}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M2 6a4 4 0 1 1 1.2 2.8" />
              <polyline points="2,2 2,6 6,6" />
            </svg>
          </button>
          
          {/* Jump to Start */}
          <button
            type="button"
            onClick={() => {
              if (history.qpu.length === 0) return;
              store.setScrubIndex(0);
            }}
            className="hud-button py-1 px-2 font-bold text-xs"
            disabled={history.qpu.length === 0}
            title={lang === 'RU' ? 'В начало шкалы' : 'Jump to Start'}
            aria-label={lang === 'RU' ? 'В начало шкалы' : 'Jump to start'}
          >
            <svg width="12" height="10" viewBox="0 0 14 12" fill="currentColor" aria-hidden="true">
              <line x1="1.5" y1="1" x2="1.5" y2="11" stroke="currentColor" strokeWidth="1.5" />
              <line x1="4.5" y1="1" x2="4.5" y2="11" stroke="currentColor" strokeWidth="1.5" />
              <polygon points="13,1 7,6 13,11" />
            </svg>
          </button>

          {/* Previous Step */}
          <button
            type="button"
            onClick={() => {
              if (history.qpu.length === 0) return;
              const idx = scrubIndex === null ? history.qpu.length - 1 : scrubIndex;
              store.setScrubIndex(Math.max(0, idx - 1));
            }}
            className="hud-button py-1 px-2 font-bold text-xs"
            disabled={history.qpu.length === 0}
            title={lang === 'RU' ? 'Предыдущий шаг' : 'Previous Step'}
            aria-label={lang === 'RU' ? 'Предыдущий шаг' : 'Previous step'}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <line x1="1.5" y1="1" x2="1.5" y2="11" stroke="currentColor" strokeWidth="1.5" />
              <polygon points="11,1 4.5,6 11,11" />
            </svg>
          </button>

          {/* Next Step */}
          <button
            type="button"
            onClick={() => {
              if (history.qpu.length === 0 || scrubIndex === null) return;
              const nextIdx = scrubIndex + 1;
              if (nextIdx >= history.qpu.length) {
                store.setScrubIndex(null);
              } else {
                store.setScrubIndex(nextIdx);
              }
            }}
            className="hud-button py-1 px-2 font-bold text-xs"
            disabled={scrubIndex === null}
            title={lang === 'RU' ? 'Следующий шаг' : 'Next Step'}
            aria-label={lang === 'RU' ? 'Следующий шаг' : 'Next step'}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <polygon points="1,1 7.5,6 1,11" />
              <line x1="10.5" y1="1" x2="10.5" y2="11" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          {/* Speed Selector — smooth animated dropdown */}
          <CustomSelect
            value={store.playbackSpeed}
            onChange={(val) => store.setPlaybackSpeed(parseFloat(val))}
            options={[
              { value: 0.1, label: '0.1x' },
              { value: 0.25, label: '0.25x' },
              { value: 0.5, label: '0.5x' },
              { value: 1.0, label: '1.0x' },
              { value: 2.0, label: '2.0x' },
              { value: 5.0, label: '5.0x' },
            ]}
            className="w-16 self-stretch"
          />
        </div>

        {/* Timeline Slider & Frame Number */}
        <div className="flex-1 flex items-center gap-2">
          <input
            type="range"
            aria-label={lang === 'RU' ? 'Шкала времени симуляции' : 'Simulation timeline scrubber'}
            min="0"
            max={Math.max(0, history.qpu.length - 1)}
            value={scrubIndex === null ? Math.max(0, history.qpu.length - 1) : scrubIndex}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (val >= history.qpu.length - 1) {
                store.setScrubIndex(null);
              } else {
                store.setScrubIndex(val);
              }
            }}
            disabled={history.qpu.length === 0}
            className="w-full cursor-pointer"
          />
          <span className="text-[var(--text-main)] font-mono text-xs font-bold whitespace-nowrap text-right min-w-[50px]">
            {scrubIndex === null ? `#${metrics.time_step}` : `#${scrubIndex + 1}/${history.qpu.length}`}
          </span>
        </div>
      </div>

    </div>
  );
};
