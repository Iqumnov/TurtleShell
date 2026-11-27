import React, { useState } from 'react';
import { useSimStore } from '../store/useSimStore';
import { translations } from '../locales/translations';

export const CorrelationMatrix: React.FC = () => {
  const store = useSimStore();
  const history = store.history;
  const lang = store.language;
  const t = translations[lang];

  const [hoveredCell, setHoveredCell] = useState<{
    x: string;
    y: string;
    val: number;
    desc: string;
  } | null>(null);

  const variables = [
    { key: "temp", label: store.qpuType.includes("trapped_ion") ? (lang === 'RU' ? "Фононы n̄" : "Phonons n̄") : t.cryoTempLabel },
    { key: "tenants", label: t.tenantCountLabel },
    { key: "t1", label: t.avgT1Label },
    { key: "aeLoss", label: t.aeLossLabel },
    { key: "fidelity", label: t.fidelityLabel },
  ];

  const baseData: Record<string, Record<string, { val: number; desc: string; descRu: string }>> = {
    temp: {
      temp: { val: 1.0, desc: "Self correlation.", descRu: "Автокорреляция." },
      tenants: { val: 0.12, desc: "Co-located tenants slightly increase cryostat load.", descRu: "Совместное размещение арендаторов незначительно повышает нагрузку на криостат." },
      t1: { val: -0.84, desc: "Thermal fluctuation causes rapid spin relaxation (T1 degradation).", descRu: "Тепловые флуктуации вызывают быструю релаксацию спина (деградацию T1)." },
      aeLoss: { val: 0.76, desc: "High temperature drives Level 4 SPC telemetry reconstruction error.", descRu: "Высокая температура увеличивает ошибку реконструкции автокодировщика Контура 4." },
      fidelity: { val: -0.88, desc: "Thermal noise collapses physical job execution fidelity.", descRu: "Тепловой шум разрушает верность выполнения физических задач." },
    },
    tenants: {
      temp: { val: 0.12, desc: "Co-located tenants slightly increase cryostat load.", descRu: "Совместное размещение арендаторов незначительно повышает нагрузку на криостат." },
      tenants: { val: 1.0, desc: "Self correlation.", descRu: "Автокорреляция." },
      t1: { val: -0.42, desc: "Crosstalk and parasitic drive shorten effective T1 coherence.", descRu: "Перекрестные помехи и паразитная накачка сокращают время когерентности T1." },
      aeLoss: { val: 0.65, desc: "Multi-tenant crosstalk increases autoencoder anomaly score.", descRu: "Межарендные перекрестные помехи увеличивают аномальный балл автокодировщика." },
      fidelity: { val: -0.71, desc: "Inter-tenant interference degrades circuit fidelity.", descRu: "Межарендные помехи снижают верность выполнения квантовых схем." },
    },
    t1: {
      temp: { val: -0.84, desc: "Thermal fluctuation causes rapid spin relaxation (T1 degradation).", descRu: "Тепловые флуктуации вызывают быструю релаксацию спина (деградацию T1)." },
      tenants: { val: -0.42, desc: "Crosstalk and parasitic drive shorten effective T1 coherence.", descRu: "Перекрестные помехи и паразитная накачка сокращают время когерентности T1." },
      t1: { val: 1.0, desc: "Self correlation.", descRu: "Автокорреляция." },
      aeLoss: { val: -0.82, desc: "Longer T1 coherence reduces SPC anomaly reconstruction loss.", descRu: "Более длинная когерентность T1 снижает потери реконструкции аномалий." },
      fidelity: { val: 0.94, desc: "T1 relaxation directly determines gate execution fidelity.", descRu: "Релаксация T1 напрямую определяет верность выполнения вентилей." },
    },
    aeLoss: {
      temp: { val: 0.76, desc: "High temperature drives Level 4 SPC telemetry reconstruction error.", descRu: "Высокая температура увеличивает ошибку реконструкции автокодировщика Контура 4." },
      tenants: { val: 0.65, desc: "Multi-tenant crosstalk increases autoencoder anomaly score.", descRu: "Межарендные перекрестные помехи увеличивают аномальный балл автокодировщика." },
      t1: { val: -0.82, desc: "Longer T1 coherence reduces SPC anomaly reconstruction loss.", descRu: "Более длинная когерентность T1 снижает потери реконструкции аномалий." },
      aeLoss: { val: 1.0, desc: "Self correlation.", descRu: "Автокорреляция." },
      fidelity: { val: -0.89, desc: "Reconstruction loss strongly correlates with fidelity degradation.", descRu: "Потери реконструкции коррелируют с падением верности." },
    },
    fidelity: {
      temp: { val: -0.88, desc: "Thermal noise collapses physical job execution fidelity.", descRu: "Тепловой шум разрушает верность выполнения физических задач." },
      tenants: { val: -0.71, desc: "Inter-tenant interference degrades circuit fidelity.", descRu: "Межарендные помехи снижают верность выполнения квантовых схем." },
      t1: { val: 0.94, desc: "T1 relaxation directly determines gate execution fidelity.", descRu: "Релаксация T1 напрямую определяет верность выполнения вентилей." },
      aeLoss: { val: -0.89, desc: "Reconstruction loss strongly correlates with fidelity degradation.", descRu: "Потери реконструкции коррелируют с падением верности." },
      fidelity: { val: 1.0, desc: "Self correlation.", descRu: "Автокорреляция." },
    },
  };

  const scrubIndex = store.scrubIndex;
  const maxLen = history.labels.length;
  const endIdx = scrubIndex !== null && maxLen > 0
    ? Math.max(1, Math.min(scrubIndex + 1, maxLen))
    : maxLen;

  const getDynamicPearsonCell = (v1Key: string, v2Key: string): { val: number; desc: string } => {
    const isRu = lang === 'RU';
    if (v1Key === v2Key) return { val: 1.0, desc: isRu ? "Автокорреляция." : "Self correlation." };
    const baseObj = baseData[v1Key]?.[v2Key];
    const baseVal = baseObj ? baseObj.val : 0.0;
    const desc = baseObj ? (isRu ? baseObj.descRu : baseObj.desc) : (isRu ? "Корреляция метрик телеметрии." : "Telemetry metric correlation.");

    const isIon = store.qpuType.includes("trapped_ion");
    const getArr = (key: string): number[] => {
      if (key === 'temp') {
        if (isIon) return history.phonon.slice(0, endIdx);
        return history.qpu.slice(0, endIdx).map((qState) => qState.temperature_k ?? 0.015);
      }
      if (key === 'tenants') {
        return history.qpu.slice(0, endIdx).map((qState) => {
          const qs = qState.qubits ?? [];
          const uniq = new Set<number>();
          for (const q of qs) {
            if (q.active_tenant !== null) uniq.add(q.active_tenant);
          }
          return uniq.size > 0 ? uniq.size : 1;
        });
      }
      if (key === 't1') return history.qpu.slice(0, endIdx).map((qState) => {
        const qs = qState.qubits ?? [];
        if (qs.length === 0) return 0;
        return qs.reduce((acc, q) => acc + (q.t1 ?? 0), 0) / qs.length;
      });
      if (key === 'aeLoss') return history.lossL4.slice(0, endIdx);
      if (key === 'fidelity') return history.fidelity.slice(0, endIdx);
      return [];
    };

    const a1 = getArr(v1Key);
    const a2 = getArr(v2Key);

    if (a1.length < 3 || a2.length < 3 || a1.length !== a2.length) {
      return { val: baseVal, desc };
    }

    const n = a1.length;
    const m1 = a1.reduce((a, b) => a + b, 0) / n;
    const m2 = a2.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let den1 = 0;
    let den2 = 0;

    for (let i = 0; i < n; i++) {
      const d1 = a1[i] - m1;
      const d2 = a2[i] - m2;
      num += d1 * d2;
      den1 += d1 * d1;
      den2 += d2 * d2;
    }

    if (den1 < 1e-12 || den2 < 1e-12) return { val: baseVal, desc };

    const rawR = num / Math.sqrt(den1 * den2);
    const clampedR = Math.max(-1.0, Math.min(1.0, Number(rawR.toFixed(2))));
    const liveR = Math.abs(clampedR) < 0.005 ? 0.0 : clampedR;
    return { val: liveR, desc };
  };

  const getCellColor = (val: number) => {
    if (val === 1.0) return "var(--border-bright)";
    if (val > 0.5) return "var(--inset-bg)";
    if (val < -0.5) return "var(--inset-bg)";
    return "var(--bg-color)";
  };

  return (
    <div className="w-full hud-panel flex flex-col font-mono text-xs select-text overflow-hidden">
      <div className="hud-header-bar">
        <span>{lang === 'RU' ? "МАТРИЦА КОРРЕЛЯЦИИ ТЕЛЕМЕТРИИ" : "TELEMETRY CORRELATION MATRIX"}</span>
        <span>{lang === 'RU' ? "[ КОРРЕЛЯЦИЯ ПИРСОНА R ]" : "[ PEARSON R ]"}</span>
      </div>

      <div className="p-3 grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch flex-1 min-h-0">
        {/* Matrix Grid (8 Cols on xl, full width below xl) */}
        <div className="xl:col-span-8 flex flex-col justify-center min-w-0 overflow-x-auto">
          <div className="w-full min-w-[260px]">
            <div className="grid grid-cols-[minmax(44px,1.1fr)_repeat(5,minmax(0,1fr))] gap-1 mb-1 items-center">
              <div className="text-center font-bold text-[var(--text-muted)] text-[10px]" />
              {variables.map((v) => (
                <div key={v.key} className="text-center font-bold text-[var(--text-main)] text-[10px] uppercase truncate px-0.5" title={v.label}>
                  {v.label}
                </div>
              ))}
            </div>

            {variables.map((vRow) => (
              <div key={vRow.key} className="grid grid-cols-[minmax(44px,1.1fr)_repeat(5,minmax(0,1fr))] gap-1 items-center mb-1">
                <div className="text-right pr-1 font-bold text-[var(--text-main)] text-[10px] uppercase truncate" title={vRow.label}>
                  {vRow.label}
                </div>
                {variables.map((vCol) => {
                  const cell = getDynamicPearsonCell(vRow.key, vCol.key);
                  const isWhiteBg = cell.val === 1.0;
                  const isHovered = hoveredCell?.x === vRow.key && hoveredCell?.y === vCol.key;
                  return (
                    <div
                      key={vCol.key}
                      onMouseEnter={() =>
                        setHoveredCell({
                          x: vRow.key,
                          y: vCol.key,
                          val: cell.val,
                          desc: cell.desc,
                        })
                      }
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{ backgroundColor: getCellColor(cell.val) }}
                      className={`h-9 border border-[var(--border-color)] flex items-center justify-center cursor-pointer transition-all duration-150 relative min-w-0 px-0.5 ${
                        isHovered ? 'z-20 border-2 border-[var(--border-bright)] shadow-sm' : ''
                      }`}
                    >
                      <span className={`font-mono text-[10px] font-bold truncate ${isWhiteBg ? 'text-[var(--bg-color)] font-extrabold' : 'text-[var(--text-main)]'} select-text`}>
                        {cell.val === 1.0
                          ? "1.00"
                          : `${cell.val > 0 ? '+' : ''}${cell.val.toFixed(2)}${Math.abs(cell.val) >= 0.85 ? '**' : (Math.abs(cell.val) >= 0.65 ? '*' : '')}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Sidebar Info Box (4 Cols on xl, full width below xl) */}
        <div className="xl:col-span-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color)] flex flex-col justify-between select-text min-w-0">
          {hoveredCell ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--text-main)] uppercase border-b border-[var(--border-color)] pb-1">
                {variables.find((v) => v.key === hoveredCell.x)?.label} vs {variables.find((v) => v.key === hoveredCell.y)?.label}
              </span>
              <div className="text-sm font-bold font-mono text-[var(--text-main)]">
                R = {hoveredCell.val > 0 && hoveredCell.val < 1.0 ? `+${hoveredCell.val.toFixed(2)}` : hoveredCell.val.toFixed(2)}
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {hoveredCell.desc}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-[var(--text-muted)] text-xs italic">
              <span>{lang === 'RU' ? "Наведите курсор на ячейку матрицы для просмотра деталей корреляции." : "Hover over matrix cells to inspect correlation insights."}</span>
            </div>
          )}

          <div className="text-[10px] text-[var(--text-muted)] uppercase border-t border-[var(--border-color)] pt-2 font-mono">
            {lang === 'RU' ? "ПОТОК ТЕЛЕМЕТРИИ В РЕАЛЬНОМ ВРЕМЕНИ" : "LIVE TELEMETRY STREAM"}
          </div>
        </div>
      </div>
    </div>
  );
};
