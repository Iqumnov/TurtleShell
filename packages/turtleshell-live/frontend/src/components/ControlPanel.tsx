import React from 'react';
import { useSimStore } from '../store/useSimStore';
import { translations } from '../locales/translations';
import { CustomSelect } from './CustomSelect';

export const ControlPanel: React.FC = () => {
  const store = useSimStore();
  const lang = store.language;
  const t = translations[lang];

  const isIonTrap = store.qpuType === 'trapped_ion_paul_trap' || store.qpuType.includes('trapped_ion');
  const isSrLattice = store.qpuType === 'sr_optical_lattice' || store.qpuType.includes('sr_');

  const handleToggleDefense = (level: 1 | 2 | 3 | 4) => {
    if (level === 1) store.setConfigs({ defenseL1: !store.defenseL1 });
    if (level === 2) store.setConfigs({ defenseL2: !store.defenseL2 });
    if (level === 3) store.setConfigs({ defenseL3: !store.defenseL3 });
    if (level === 4) store.setConfigs({ defenseL4: !store.defenseL4 });
  };

  const gateFreqMhz = (store.gateFrequencyHz / 1e6).toFixed(2);

  return (
    <div className="w-full flex flex-col gap-3.5 hud-panel p-3.5 text-sm select-text">

      {/* Platform Configuration */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-[var(--text-muted)]">{t.procModelSelect}</label>
          <CustomSelect
            value={store.qpuType}
            onChange={(val) => store.setConfigs({ qpuType: val })}
            options={[
              { value: 'trapped_ion_paul_trap', label: t.qpuTrappedIonPaulTrap },
              { value: 'sr_optical_lattice', label: t.qpuSrOpticalLattice },
              { value: 'eagle', label: t.qpuEagle },
              { value: 'heron', label: t.qpuHeron },
            ]}
            className="w-full"
          />
        </div>

        {/* Ion Species */}
        {isIonTrap && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--text-muted)]">{t.ionSpeciesLabel}</label>
            <CustomSelect
              value={store.ionSpecies}
              onChange={(val) => store.setConfigs({ ionSpecies: val })}
              options={[
                { value: 'Ca40', label: t.ionCa40 },
                { value: 'Sr88', label: t.ionSr88 },
                { value: 'Ba138', label: t.ionBa138 },
                { value: 'Yb171', label: t.ionYb171 },
              ]}
              className="w-full"
            />
          </div>
        )}

        {/* N ions slider */}
        {isIonTrap && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between font-bold text-xs">
              <span className="text-[var(--text-muted)]">{t.nIonsLabel}</span>
              <span className="text-[var(--text-main)] font-mono">{store.nIons} {t.nIonsUnit}</span>
            </div>
            <input
              type="range"
              aria-label={t.nIonsLabel}
              min="10"
              max="50"
              step="5"
              value={store.nIons}
              onChange={(e) => store.setConfigs({ nIons: parseInt(e.target.value) })}
            />
          </div>
        )}

        {/* Tenant Count Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between font-bold text-xs">
            <span className="text-[var(--text-muted)]">{t.colocatedTenants}</span>
            <span className="text-[var(--text-main)] font-mono">{store.tenantCount} {t.tenantsUnit}</span>
          </div>
          <input
            type="range"
            aria-label={t.colocatedTenants}
            min="2"
            max="10"
            value={store.tenantCount}
            onChange={(e) => store.setConfigs({ tenantCount: parseInt(e.target.value) })}
          />
        </div>

        {/* Scheduler Type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-[var(--text-muted)]">{t.placementAlgo}</label>
          <CustomSelect
            value={store.schedulingAlgo}
            onChange={(val) => store.setConfigs({ schedulingAlgo: val })}
            disabled={store.defenseL1}
            options={[
              { value: 'random', label: t.schedulerAlgoRandom },
              { value: 'static', label: t.schedulerAlgoStatic },
              { value: 'spectral', label: t.schedulerAlgoSpectral },
              { value: 'tdm', label: t.schedulerAlgoTdm },
            ]}
            className="w-full"
          />
        </div>
      </div>

      {/* Attack Scenario Configuration */}
      <div className="flex flex-col gap-2.5 border-t border-[var(--border-color)] pt-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-[var(--text-muted)]">{t.vulnerabilityProfile}</label>
          <CustomSelect
            value={store.activeScenario}
            onChange={(val) => store.setConfigs({ activeScenario: val })}
            options={[
              { value: 'crosstalk', label: t.scenarioCrosstalk },
              { value: 'rowhammer', label: t.scenarioRowhammer },
              { value: 'prime_probe', label: t.scenarioPrimeProbe },
              { value: 'rf_leakage', label: t.scenarioRfLeakage },
              { value: 'environment', label: t.scenarioEnvironment },
            ]}
            className="w-full"
          />
        </div>

        {/* Crosstalk controls */}
        {store.activeScenario === "crosstalk" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-bold text-xs">
                <span className="text-[var(--text-muted)]">{t.crosstalkCzIntensity}</span>
                <span className="text-[var(--text-main)] font-mono">{store.crosstalkIntensity}{t.densityUnit}</span>
              </div>
              <input
                type="range"
                aria-label={t.crosstalkCzIntensity}
                min="0"
                max="100"
                value={store.crosstalkIntensity}
                onChange={(e) => store.setConfigs({ crosstalkIntensity: parseInt(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-bold text-xs">
                <span className="text-[var(--text-muted)]">{t.gateFrequencyLabel}</span>
                <span className="text-[var(--text-main)] font-mono">{gateFreqMhz} {t.gateFrequencyUnit}</span>
              </div>
              <input
                type="range"
                aria-label={t.gateFrequencyLabel}
                min="100000"
                max="10000000"
                step="100000"
                value={store.gateFrequencyHz}
                onChange={(e) => store.setConfigs({ gateFrequencyHz: parseInt(e.target.value) })}
              />
            </div>
          </div>
        )}

        {/* Rowhammer controls */}
        {store.activeScenario === "rowhammer" && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between font-bold text-xs">
              <span className="text-[var(--text-muted)]">{t.rowhammerIterations}</span>
              <span className="text-[var(--text-main)] font-mono">{store.rowhammerIterations} {t.cyclesUnit}</span>
            </div>
            <input
              type="range"
              aria-label={t.rowhammerIterations}
              min="100"
              max="1000"
              value={store.rowhammerIterations}
              onChange={(e) => store.setConfigs({ rowhammerIterations: parseInt(e.target.value) })}
            />
          </div>
        )}

        {/* Prime & Probe controls */}
        {store.activeScenario === "prime_probe" && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between font-bold text-xs">
              <span className="text-[var(--text-muted)]">{t.measurementDelay}</span>
              <span className="text-[var(--text-main)] font-mono">{store.primeDelayUs} µs</span>
            </div>
            <input
              type="range"
              aria-label={t.measurementDelay}
              min="50"
              max="500"
              value={store.primeDelayUs}
              onChange={(e) => store.setConfigs({ primeDelayUs: parseInt(e.target.value) })}
            />
          </div>
        )}

        {/* RF Leakage controls */}
        {store.activeScenario === "rf_leakage" && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between font-bold text-xs">
              <span className="text-[var(--text-muted)]">{t.snrDbLabel}</span>
              <span className="text-[var(--text-main)] font-mono">{store.snrDb} {t.snrDbUnit}</span>
            </div>
            <input
              type="range"
              aria-label={t.snrDbLabel}
              min="-30"
              max="20"
              step="1"
              value={store.snrDb}
              onChange={(e) => store.setConfigs({ snrDb: parseInt(e.target.value) })}
            />
          </div>
        )}

        {/* Environment controls */}
        {store.activeScenario === "environment" && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between font-bold text-xs">
              <span className="text-[var(--text-muted)]">{t.cryostatTemp}</span>
              <span className="text-[var(--text-main)] font-mono">
                {isSrLattice
                  ? `~1.0 µK trap / ${store.envTemperatureMk} mK`
                  : `${store.envTemperatureMk} mK`
                }
              </span>
            </div>
            <input
              type="range"
              aria-label={t.cryostatTemp}
              min="15"
              max="50"
              value={store.envTemperatureMk}
              onChange={(e) => store.setConfigs({ envTemperatureMk: parseInt(e.target.value) })}
            />
          </div>
        )}
      </div>

      {/* TurtleShell Protection Contours */}
      <div className="flex flex-col gap-2 border-t border-[var(--border-color)] pt-2.5">
        <button
          type="button"
          aria-pressed={store.defenseL1}
          onClick={() => handleToggleDefense(1)}
          className={`w-full hud-button justify-between text-left py-1.5 px-2 text-xs border ${store.defenseL1 ? 'hud-button-active' : ''
            }`}
        >
          <span className="font-bold text-xs">{t.defL1Title}</span>
          <span className="font-mono text-xs">{store.defenseL1 ? (lang === 'RU' ? 'Вкл' : 'On') : (lang === 'RU' ? 'Выкл' : 'Off')}</span>
        </button>

        <button
          type="button"
          aria-pressed={store.defenseL2}
          onClick={() => handleToggleDefense(2)}
          className={`w-full hud-button justify-between text-left py-1.5 px-2 text-xs border ${store.defenseL2 ? 'hud-button-active' : ''
            }`}
        >
          <span className="font-bold text-xs">{t.defL2Title}</span>
          <span className="font-mono text-xs">{store.defenseL2 ? (lang === 'RU' ? 'Вкл' : 'On') : (lang === 'RU' ? 'Выкл' : 'Off')}</span>
        </button>

        <button
          type="button"
          aria-pressed={store.defenseL3}
          onClick={() => handleToggleDefense(3)}
          className={`w-full hud-button justify-between text-left py-1.5 px-2 text-xs border ${store.defenseL3 ? 'hud-button-active' : ''
            }`}
        >
          <span className="font-bold text-xs">{t.defL3Title}</span>
          <span className="font-mono text-xs">{store.defenseL3 ? (lang === 'RU' ? 'Вкл' : 'On') : (lang === 'RU' ? 'Выкл' : 'Off')}</span>
        </button>

        <button
          type="button"
          aria-pressed={store.defenseL4}
          onClick={() => handleToggleDefense(4)}
          className={`w-full hud-button justify-between text-left py-1.5 px-2 text-xs border ${store.defenseL4 ? 'hud-button-active' : ''
            }`}
        >
          <span className="font-bold text-xs">{t.defL4Title}</span>
          <span className="font-mono text-xs">{store.defenseL4 ? (lang === 'RU' ? 'Вкл' : 'On') : (lang === 'RU' ? 'Выкл' : 'Off')}</span>
        </button>
      </div>
    </div>
  );
};
