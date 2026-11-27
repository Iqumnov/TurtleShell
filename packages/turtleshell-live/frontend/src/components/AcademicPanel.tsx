import React, { useState } from 'react';
import { useSimStore } from '../store/useSimStore';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const USE_PROXY = import.meta.env.VITE_USE_PROXY === 'true';

// Derive backend URL from the same source as the WS store to support deployment
const BACKEND_WS_HOST = (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost')
  ? `${window.location.hostname}:8000`
  : '127.0.0.1:8000';

export const AcademicPanel: React.FC = () => {
  const store = useSimStore();
  const lang = store.language;

  const [qutipData, setQutipData] = useState<any>(null);
  const [activeSubTab, setActiveSubTab] = useState<'zz' | 'c3'>('zz');

  React.useEffect(() => {
    const isLocal = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (typeof window !== 'undefined' && !USE_PROXY && (window.location.protocol === 'https:' || !isLocal)) {
      return;
    }

    const controller = new AbortController();
    const url = USE_PROXY ? '/api/qutip/verify' : `http://${BACKEND_WS_HOST}/api/qutip/verify`;

    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setQutipData(data);
      })
      .catch(() => {
        // Backend optional in standalone mode or request aborted
      });

    return () => controller.abort();
  }, [store.activeScenario, store.defenseL1, store.defenseL2, store.defenseL3, store.defenseL4, store.qpuType]);

  const zzData = qutipData?.zz_crosstalk?.times_us?.map((tVal: number, idx: number) => ({
    time: Number(tVal.toFixed(2)),
    fidelity: Number((qutipData.zz_crosstalk.fidelity[idx] * 100).toFixed(2)),
  })) ?? [];

  const c3Data = qutipData?.contour3_cooling?.times_s?.map((tVal: number, idx: number) => ({
    time: Number(tVal.toFixed(2)),
    numerical: Number(qutipData.contour3_cooling.n_bar_numerical[idx].toFixed(3)),
    analytical: Number(qutipData.contour3_cooling.n_bar_analytical[idx].toFixed(3)),
  })) ?? [];

  const renderQuTiPAuditSection = (isRu: boolean) => (
    <div className="mt-3 p-3 hud-inset flex flex-col gap-2 border border-[var(--border-color)] select-text">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <span className="font-bold text-xs uppercase text-[var(--text-main)]">
          {isRu ? "ЧИСЛЕННЫЙ СОЛВЕР QUTIP (СТАТЬЯ №1 УР. 1 И СТАТЬЯ №2 УР. 5)" : "QUTIP LINDBLAD NUMERICAL SOLVER (PAPER #1 EQ. 1 & PAPER #2 EQ. 5)"}
        </span>
        <div className="flex items-center gap-2">
          {qutipData && (
            <div className="flex gap-1">
              <button
                onClick={() => setActiveSubTab('zz')}
                className={`hud-button text-xs px-2 py-0.5 ${activeSubTab === 'zz' ? 'font-bold bg-[var(--text-main)] text-[var(--bg-color)]' : ''}`}
              >
                {isRu ? "ПЕРЕКРЕСТНЫЕ ПОМЕХИ (F(t))" : "ZZ CROSSTALK (F(t))"}
              </button>
              <button
                onClick={() => setActiveSubTab('c3')}
                className={`hud-button text-xs px-2 py-0.5 ${activeSubTab === 'c3' ? 'font-bold bg-[var(--text-main)] text-[var(--bg-color)]' : ''}`}
              >
                {isRu ? "КОНТУР 3 ОХЛАЖДЕНИЕ (n̄(τ))" : "CONTOUR 3 COOLING (n̄(τ))"}
              </button>
            </div>
          )}
        </div>
      </div>

      {qutipData ? (
        <div className="flex flex-col gap-2 mt-1">
          {activeSubTab === 'zz' ? (
            <>
              <div className="text-xs font-mono text-[var(--text-main)]">
                {isRu ? "Статус" : "Status"}: <span className="font-bold">
                  {isRu
                    ? (qutipData.zz_crosstalk.has_qutip
                        ? "Квантовый солвер Линдблада QuTiP успешно выполнен"
                        : "Аналитический режим (библиотека QuTiP отсутствует)")
                    : qutipData.zz_crosstalk.status}
                </span> | {isRu ? "Итоговая верность" : "Final Fidelity"}: <span className="font-bold">{(qutipData.zz_crosstalk.final_fidelity * 100).toFixed(2)}%</span>
              </div>
              {zzData.length > 0 && (
                <div className="h-48 w-full bg-[var(--bg-color)] p-2 border border-[var(--border-color)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={zzData} margin={{ top: 20, right: 25, left: 35, bottom: 20 }}>
                      <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} label={{ value: isRu ? 'Время (мкс)' : 'Time (µs)', position: 'insideBottomRight', offset: -5, fill: 'var(--text-muted)', fontSize: 10 }} />
                      <YAxis stroke="var(--text-muted)" domain={['dataMin - 2', 100]} padding={{ top: 15, bottom: 20 }} fontSize={10} tickLine={false} width={45} unit="%" />
                      <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: '11px' }} />
                      <Line type="monotone" dataKey="fidelity" stroke="var(--text-main)" strokeWidth={1.5} dot={false} name="Fidelity (%)" isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--text-main)', strokeWidth: 1.5, fill: 'var(--bg-color)' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs font-mono text-[var(--text-main)]">
                {isRu ? "Статус" : "Status"}: <span className="font-bold">
                  {isRu
                    ? (qutipData.contour3_cooling.has_qutip
                        ? `Охлаждение Контура 3 верифицировано QuTiP (Макс. ошибка: ${qutipData.contour3_cooling.max_abs_error?.toExponential(2) ?? '0'})`
                        : "Аналитический режим (библиотека QuTiP отсутствует)")
                    : qutipData.contour3_cooling.status}
                </span> | {isRu ? "Макс. погрешность" : "Max Error"}: <span className="font-bold">
                  {qutipData.contour3_cooling.has_qutip && qutipData.contour3_cooling.max_abs_error !== null
                    ? qutipData.contour3_cooling.max_abs_error.toExponential(2)
                    : (isRu ? "Н/Д (QuTiP отсутствует)" : "N/A (QuTiP absent)")}
                </span>
              </div>
              {c3Data.length > 0 && (
                <div className="h-48 w-full bg-[var(--bg-color)] p-2 border border-[var(--border-color)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={c3Data} margin={{ top: 25, right: 25, left: 45, bottom: 20 }}>
                      <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} label={{ value: isRu ? 'Время τ (с)' : 'Time τ (s)', position: 'insideBottomRight', offset: -5, fill: 'var(--text-muted)', fontSize: 10 }} />
                      <YAxis stroke="var(--text-muted)" domain={[0, 'auto']} padding={{ top: 20, bottom: 20 }} fontSize={10} tickLine={false} width={45} />
                      <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: '11px' }} />
                      <Legend verticalAlign="top" height={20} iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                      <Line
                        type="linear"
                        dataKey="numerical"
                        stroke="var(--text-main)"
                        strokeWidth={1.5}
                        dot={false}
                        name={qutipData.contour3_cooling.has_qutip ? (isRu ? "Численный расчёт QuTiP n̄(τ)" : "QuTiP Numerical n̄(τ)") : (isRu ? "Аналитический фоллбэк n̄(τ)" : "Analytical Fallback n̄(τ)")}
                        isAnimationActive={false}
                        activeDot={{ r: 3.5, stroke: 'var(--text-main)', strokeWidth: 1.5, fill: 'var(--bg-color)' }}
                      />
                      <Line
                        type="linear"
                        dataKey="analytical"
                        stroke="var(--text-muted)"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        dot={false}
                        name={isRu ? "Аналитическая формула (5) n̄(τ)" : "Analytic Eq. (5) n̄(τ)"}
                        isAnimationActive={false}
                        activeDot={{ r: 3.5, stroke: 'var(--text-muted)', strokeWidth: 1.5, fill: 'var(--bg-color)' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="text-xs font-mono text-[var(--text-muted)] italic mt-1">
          {isRu
            ? "Автономный браузерный режим: для живого численного солвера мастер-уравнения Линдблада (QuTiP) запустите локальный бэкенд (./run_live.sh) или CLI `qib verify-qutip`."
            : "Standalone browser mode: run the local FastAPI backend (./run_live.sh) or `qib verify-qutip` to stream live QuTiP Lindblad master-equation trajectories."}
        </div>
      )}
    </div>
  );

  const content = lang === 'RU' ? (
    <div className="flex flex-col gap-2.5 font-mono text-sm leading-relaxed text-[var(--text-main)]">
      <p>
        Этот симулятор (<strong>TurtleShell-RT</strong>) и фреймворк бенчмаркинга (<strong>Quantum Cloud Isolation Benchmarking Framework</strong>) являются референсной реализацией архитектурной концепции: <span className="underline italic">"TurtleShell: Концепция многоконтурной защиты при изоляции процессов в мультитенантных квантовых облаках"</span> (в подготовке к публикации).
      </p>

      <p className="font-bold uppercase text-xs text-[var(--text-muted)] mt-1">Классы квантовых физических платформ:</p>
      <ul className="list-disc pl-4 flex flex-col gap-1.5 text-xs">
        <li><strong>TrappedIonPaulTrap</strong> — линейная ловушка Пауля с ионами Ca-40/Sr-88/Ba-138/Yb-171 (Leibfried et al. 2003, Deslauriers 2006). T1=1с, T2=0.5с, связность all-to-all (J_ij ~ 1/|i-j|³). Угрозы: перекрестные помехи, РЧ-утечка, фононные остатки Prime-and-Probe.</li>
        <li><strong>SrOpticalLattice</strong> — нейтральные атомы Стронция-87 (<sup>87</sup>Sr, ~1 мкК в УВВ-камере 300К) в 2D оптической решётке (Boyd et al. 2007, Saffman 2016). T1=60с, T2=30с. Часовой переход 4.29×10¹⁴ Гц (698.4 нм). Иммунна к РЧ-атакам.</li>
        <li><strong>IBM Eagle</strong> — 127-кубитный сверхпроводящий процессор Heavy-Hex. T1≈148мкс, ZZ≈4.8 кГц. Нет управляемых куплеров → Контур 1 не может расстроить граничные связки.</li>
        <li><strong>IBM Heron</strong> — 133-кубитный сверхпроводящий процессор с управляемыми куплерами. T1≈172мкс, ZZ≈1.1 кГц. После расстройки Контура 1 остаточный ZZ ≈ 15%.</li>
      </ul>

      <p className="font-bold uppercase text-xs text-[var(--text-muted)] mt-1">Эффективность партиционирования и показания шума (SPECS §5.1):</p>
      <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[540px] text-left text-xs border-collapse border border-[var(--border-color)] mb-1">
        <thead>
          <tr className="bg-[var(--inset-bg)] border-b border-[var(--border-color)] text-[var(--text-main)]">
            <th className="p-1.5 font-bold">Платформа</th>
            <th className="p-1.5 font-bold">Показатель шума (err_2q / readout)</th>
            <th className="p-1.5 font-bold" title="Эффективность партиционирования Контура 1 по сравнению со случайной аллокацией (100×(1−J_spectral/J_random))">Эффективность изоляции (Контур 1)</th>
            <th className="p-1.5 font-bold">Источник / Аппаратный статус</th>
          </tr>
        </thead>
        <tbody>
          {[
            { name: 'TrappedIonPaulTrap', noise: '0.50%', src: 'err_2q=5e-3 (qpu.py)', tag: '[ МОДОВЫЙ СПЕКТР ]', key: 'trapped_ion' },
            { name: 'SrOpticalLattice', noise: '1.00%', src: 'err_2q=1e-2 (Rydberg)', tag: '[ БЛОКАДА РИДБЕРГА ]', key: 'sr_optical' },
            { name: 'IBM Eagle', noise: '1.00%', src: 'err_2q=1e-2 (qpu.py)', tag: '[ ФИКСИРОВАННЫЕ СВЯЗКИ ]', key: 'eagle' },
            { name: 'IBM Heron', noise: '0.70%', src: 'err_2q=7e-3 (qpu.py)', tag: '[ УПРАВЛЯЕМЫЕ СВЯЗКИ ]', key: 'heron' },
          ].map((row) => {
            const isActive = store.metrics?.platform_type?.includes(row.key);
            const isolVal = isActive && store.metrics?.isolation_index !== undefined
              ? `${store.metrics.isolation_index}%`
              : (row.key === 'trapped_ion' ? (store.defenseL1 ? '99.7%' : '7.6%')
                : row.key === 'sr_optical' ? (store.defenseL1 ? '100.0%' : '0.0%')
                : row.key === 'eagle' ? (store.defenseL1 ? '88.0%' : '0.0%')
                : row.key === 'heron' ? (store.defenseL1 ? '98.3%' : '6.8%')
                : '—');
            return (
              <tr key={row.key} className={`border-b border-[var(--border-color)] ${isActive ? 'bg-[var(--inset-bg)] font-bold' : ''}`}>
                <td className="p-1.5">{row.name}{isActive ? ' ◀ текущая' : ''}</td>
                <td className="p-1.5">{row.noise}</td>
                <td className="p-1.5">{isolVal}</td>
                <td className="p-1.5 text-[var(--text-muted)] flex gap-1 items-center">
                  <span>{row.src}</span>
                  <span className="text-[10px] font-mono opacity-80">{row.tag}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <p className="font-bold uppercase text-xs text-[var(--text-muted)] mt-1">Четыре контура защиты TurtleShell (SPECS §5):</p>
      <ul className="list-disc pl-4 flex flex-col gap-1.5 text-xs">
        <li><strong>Контур 1</strong> — Физическое разделение (Спектральная кластеризация лапласиана графа L = D - |J|) + LMS-фильтр подавления РЧ-утечки (M=32, µ=0.01, сходимость &lt;10мс, подавление 20-30 дБ).</li>
        <li><strong>Контур 2</strong> — Верификация компилятора: SHA-256 хеш схемы (граф оптимизации + маппинг) + Isolation Forest (n=100, contamination=5%) → порог −0.6.</li>
        <li><strong>Контур 3</strong> — Буфер лазерного охлаждения: τ_б = (1/η)×ln[(n̄₀−ṅ/η)/(n*−ṅ/η)] для ионных ловушек; адаптивный сброс T1 (5×T1) для СП-систем.</li>
        <li><strong>Контур 4</strong> — Дифференциальный телеметрический монитор: z-счёт скользящего окна с KS-тестом (df=5 если не Гауссово), уровни угрозы 0-3 при σ∈[2.5; 3.5; 5.25]; синтетическая частота ν_syn = (ν+ + ν−)/2 для оптических платформ.</li>
      </ul>

      {renderQuTiPAuditSection(true)}

      <div className="border-t border-[var(--border-color)] mt-2 pt-2 flex flex-col gap-1 text-xs text-[var(--text-muted)] font-mono">
        <span className="font-bold uppercase text-[var(--text-main)]">Автор и Аффилиация:</span>
        <span>ИГУМНОВ Матвей Дмитриевич (Московский Политех) — ORCID: 0009-0001-7924-1522 | matvei@iqumnov.com</span>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-2.5 font-mono text-sm leading-relaxed text-[var(--text-main)]">
      <p>
        This simulator (<strong>TurtleShell-RT</strong>) and benchmarking framework (<strong>Quantum Cloud Isolation Benchmarking Framework</strong>) serve as the reference implementation and benchmarking suite for the open-source quantum process isolation architecture: <span className="underline italic">"TurtleShell: A Multi-Contour Process Isolation Concept for Multi-Tenant Quantum Clouds"</span>.
      </p>

      <p className="font-bold uppercase text-xs text-[var(--text-muted)] mt-1">Quantum Physical Platform Classes:</p>
      <ul className="list-disc pl-4 flex flex-col gap-1.5 text-xs">
        <li><strong>TrappedIonPaulTrap</strong> — Paul trap ion chain with Ca-40/Sr-88/Ba-138/Yb-171 (Leibfried et al. 2003, Deslauriers 2006). T1=1s, T2=0.5s, all-to-all connectivity (J_ij ~ 1/|i-j|³). Threats: Crosstalk, RF leakage side-channel, phonon Prime-and-Probe.</li>
        <li><strong>SrOpticalLattice</strong> — Strontium-87 (87Sr) neutral atoms (~1 µK inside 300K UHV chamber) in 2D optical lattice (Boyd et al. 2007, Saffman 2016). T1=60s, T2=30s. Clock at 4.29×10¹⁴ Hz (698.4 nm). Immune to RF leakage attacks.</li>
        <li><strong>IBM Eagle</strong> — 127Q Heavy-Hex superconducting processor. T1≈148µs, ZZ≈4.8kHz. No tunable couplers → Contour 1 cannot detune boundary bonds.</li>
        <li><strong>IBM Heron</strong> — 133Q superconducting with tunable couplers. T1≈172µs, ZZ≈1.1kHz. After Contour 1 spectral detuning, residual ZZ ≈ 15%.</li>
      </ul>

      <p className="font-bold uppercase text-xs text-[var(--text-muted)] mt-1">Partitioning Efficiency & Noise Metrics (SPECS §5.1):</p>
      <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[540px] text-left text-xs border-collapse border border-[var(--border-color)] mb-1">
        <thead>
          <tr className="bg-[var(--inset-bg)] border-b border-[var(--border-color)] text-[var(--text-main)]">
            <th className="p-1.5 font-bold">Platform</th>
            <th className="p-1.5 font-bold">Noise Score (err_2q / readout)</th>
            <th className="p-1.5 font-bold" title="Contour 1 partitioning efficiency vs random allocation baseline (100×(1−J_spectral/J_random))">Isolation Efficiency (Contour 1)</th>
            <th className="p-1.5 font-bold">Source / Hardware Tag</th>
          </tr>
        </thead>
        <tbody>
          {[
            { name: 'TrappedIonPaulTrap', noise: '0.50%', src: 'err_2q=5e-3 (qpu.py)', tag: '[ MOTIONAL MODES ]', key: 'trapped_ion' },
            { name: 'SrOpticalLattice', noise: '1.00%', src: 'err_2q=1e-2 (Rydberg)', tag: '[ RYDBERG BLOCKADE ]', key: 'sr_optical' },
            { name: 'IBM Eagle', noise: '1.00%', src: 'err_2q=1e-2 (qpu.py)', tag: '[ FIXED COUPLERS ]', key: 'eagle' },
            { name: 'IBM Heron', noise: '0.70%', src: 'err_2q=7e-3 (qpu.py)', tag: '[ TUNABLE COUPLERS ]', key: 'heron' },
          ].map((row) => {
            const isActive = store.metrics?.platform_type?.includes(row.key);
            const isolVal = isActive && store.metrics?.isolation_index !== undefined
              ? `${store.metrics.isolation_index}%`
              : (row.key === 'trapped_ion' ? (store.defenseL1 ? '99.7%' : '7.6%')
                : row.key === 'sr_optical' ? (store.defenseL1 ? '100.0%' : '0.0%')
                : row.key === 'eagle' ? (store.defenseL1 ? '88.0%' : '0.0%')
                : row.key === 'heron' ? (store.defenseL1 ? '98.3%' : '6.8%')
                : '—');
            return (
              <tr key={row.key} className={`border-b border-[var(--border-color)] ${isActive ? 'bg-[var(--inset-bg)] font-bold' : ''}`}>
                <td className="p-1.5">{row.name}{isActive ? ' ◀ active' : ''}</td>
                <td className="p-1.5">{row.noise}</td>
                <td className="p-1.5">{isolVal}</td>
                <td className="p-1.5 text-[var(--text-muted)] flex gap-1 items-center">
                  <span>{row.src}</span>
                  <span className="text-[10px] font-mono opacity-80">{row.tag}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <p className="font-bold uppercase text-xs text-[var(--text-muted)] mt-1">Four TurtleShell Protection Contours (SPECS §5):</p>
      <ul className="list-disc pl-4 flex flex-col gap-1.5 text-xs">
        <li><strong>Contour 1</strong> — Physical partitioning (Spectral Clustering on Graph Laplacian L = D - |J|) + LMS adaptive filter for RF leakage suppression (M=32, µ=0.01, convergence &lt;10ms, 20-30 dB suppression).</li>
        <li><strong>Contour 2</strong> — Compiler verification: SHA-256 circuit hash (optimization graph + mapping) + Isolation Forest (n=100, contamination=5%) → threshold −0.6.</li>
        <li><strong>Contour 3</strong> — Laser cooling buffer: τ_b = (1/η)×ln[(n̄₀−ṅ/η)/(n*−ṅ/η)] for ion traps; adaptive T1 reset (5×T1) for superconducting systems.</li>
        <li><strong>Contour 4</strong> — Differential telemetry monitor: z-score sliding window with KS-test Gaussianity (Student-t df=5 if non-Gaussian), threat levels 0-3 at σ∈[2.5; 3.5; 5.25]; synthetic frequency ν_syn = (ν+ + ν−)/2 for optical lattice platforms.</li>
      </ul>

      {renderQuTiPAuditSection(false)}

      <div className="border-t border-[var(--border-color)] mt-2 pt-2 flex flex-col gap-1 text-xs text-[var(--text-muted)] font-mono">
        <span className="font-bold uppercase text-[var(--text-main)]">Author & Affiliation:</span>
        <span>Matvei D. IGUMNOV (Moscow Polytech) — ORCID: 0009-0001-7924-1522 | matvei@iqumnov.com</span>
      </div>
    </div>
  );

  return (
    <div className="w-full hud-panel font-mono text-sm select-text overflow-hidden">
      <div className="hud-header-bar">
        <span>{lang === 'RU' ? "АКАДЕМИЧЕСКАЯ АРХИТЕКТУРНАЯ СПЕЦИФИКАЦИЯ TURTLESHELL" : "TURTLESHELL ACADEMIC ARCHITECTURAL SPECIFICATION"}</span>
      </div>
      <div className="p-3.5">
        {content}
      </div>
    </div>
  );
};
