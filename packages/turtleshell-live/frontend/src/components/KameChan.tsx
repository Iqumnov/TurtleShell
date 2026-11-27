import React from 'react';
import { useSimStore } from '../store/useSimStore';
import { translations } from '../locales/translations';

export const KameChan: React.FC = () => {
  const store = useSimStore();
  const connected = store.connected;
  const metrics = store.metrics;
  const history = store.history;
  const scrubIndex = store.scrubIndex;

  const activeScenario = store.activeScenario;
  const defenseL1 = store.defenseL1;
  const defenseL2 = store.defenseL2;
  const defenseL3 = store.defenseL3;
  const defenseL4 = store.defenseL4;
  const lang = store.language;
  const t = translations[lang];

  const isIonTrap = store.qpuType === 'trapped_ion_paul_trap' || store.qpuType.includes('trapped_ion');
  const isSrLattice = store.qpuType === 'sr_optical_lattice';
  const isEagle = store.qpuType === 'eagle';
  const isHeron = store.qpuType === 'heron';

  const getSpeech = (): string => {
    if (!connected) return t.dialogueNoConnection;
    if (!metrics) return t.dialogueAwaitingSync;

    // Historical Replay Timeline Scrubbing
    if (scrubIndex !== null && history.qpu.length > 0) {
      return t.dialogueHistoricalReplay(scrubIndex, history.qpu.length - 1);
    }

    // Full Quad-Contour Shield Activated
    if (defenseL1 && defenseL2 && defenseL3 && defenseL4) {
      return t.dialogueFullDefenseShield;
    }

    // Contour 4 Differential Telemetry Threat Alert (Level 2 or 3)
    if (metrics.monitor_threat_level >= 2) {
      return t.dialogueThreatAlert(
        metrics.monitor_threat_level,
        (metrics.monitor_z_score ?? 0).toFixed(2)
      );
    }

    // Contour 2 Compiler SHA-256 / Isolation Forest Anomaly
    if (metrics.anomaly_flagged_l2 && !defenseL2) {
      return t.dialogueL2Anomaly((metrics.anomaly_score_l2 * 100).toFixed(1));
    }

    // Contour 4 Autoencoder Anomaly
    if (metrics.anomaly_flagged_l4 && !defenseL4) {
      return t.dialogueL4Anomaly((metrics.autoencoder_loss_l4 ?? 0).toFixed(5));
    }

    // Scenario 4: RF Leakage
    if (activeScenario === 'rf_leakage') {
      const rfAcc = metrics.active_scenario_metrics?.rf_decode_accuracy ?? 0;
      const rfInfo = metrics.active_scenario_metrics?.rf_mutual_info_bits ?? 0;
      if (!isIonTrap) {
        return t.dialogueRfLeakageNonIonPlatform;
      }
      if (!defenseL1 && rfAcc > 0.3) {
        return t.dialogueRfLeakageVulnerable(
          (rfAcc * 100).toFixed(1),
          rfInfo.toFixed(2)
        );
      }
      if (defenseL1 && (metrics.lms_suppression_db ?? 0) > 5) {
        return t.dialogueRfLeakageMitigated((metrics.lms_suppression_db ?? 0).toFixed(1));
      }
    }

    // Scenario 1: Crosstalk
    if (activeScenario === 'crosstalk') {
      if (!defenseL1 && !defenseL2) {
        const hops = String(metrics.active_scenario_metrics?.crosstalk_hops ?? -1);
        const drop = String(metrics.fidelity_drop);
        return t.dialogueCrosstalkVulnerable(hops, drop);
      }
      if (defenseL1 && !defenseL2) return t.dialogueCrosstalkL1Active;
      if (!defenseL1 && defenseL2) return t.dialogueCrosstalkL2Active;
      return t.dialogueCrosstalkMitigated;
    }

    // Scenario 2: Rowhammer
    if (activeScenario === 'rowhammer') {
      if (!defenseL3) {
        const degradation = metrics.active_scenario_metrics?.rowhammer_degradation ?? 0;
        return t.dialogueRowhammerVulnerable(
          String(store.rowhammerIterations),
          degradation.toFixed(1)
        );
      }
      return t.dialogueRowhammerMitigated(
        (metrics.buffer_delay_us ?? 0).toFixed(1),
        (metrics.buffer_overhead_pct ?? 0).toFixed(1)
      );
    }

    // Scenario 3: Prime & Probe
    if (activeScenario === 'prime_probe') {
      if (!defenseL3 && !defenseL4) {
        const excitation = metrics.active_scenario_metrics?.prime_probe_excitation ?? 0;
        return t.dialoguePrimeProbeVulnerable(excitation.toFixed(3));
      }
      return t.dialoguePrimeProbeMitigated;
    }

    // Scenario 5: Environment Decoherence
    if (activeScenario === 'environment') {
      const t1Display = metrics.average_t1 > 1e6
        ? `${(metrics.average_t1 / 1e6).toFixed(2)}${lang === 'RU' ? 'с' : 's'}`
        : `${metrics.average_t1.toFixed(0)}${lang === 'RU' ? 'мкс' : 'µs'}`;
      if (metrics.fidelity < 0.8) {
        return t.dialogueDecoherenceCritical((metrics.fidelity * 100).toFixed(1), t1Display);
      }
      return t.dialogueDecoherenceStable(t1Display);
    }

    // Initial Platform Showcase
    if (metrics.time_step <= 5) {
      if (isIonTrap) {
        return t.dialogueIonTrapPlatform(
          String(store.nIons),
          store.ionSpecies,
          (metrics.phonon_number ?? 0).toFixed(4)
        );
      }
      if (isSrLattice) return t.dialogueOpticalLatticePlatform;
      if (isEagle) return t.dialogueEaglePlatform;
      if (isHeron) return t.dialogueHeronPlatform;
    }

    // System Alert: Fidelity Collapse
    if (metrics.fidelity < 0.75) return t.dialogueFidelityCollapse;

    // Financial Metrics Alert
    if (metrics.cumulative_savings > metrics.cumulative_costs * 1.3 && metrics.cumulative_costs > 0) {
      const roi = ((metrics.cumulative_savings - metrics.cumulative_costs) / metrics.cumulative_costs) * 100;
      return t.dialoguePositiveRoi(
        metrics.cumulative_savings.toLocaleString(undefined, { maximumFractionDigits: 0 }),
        roi.toFixed(0)
      );
    }

    // Phonon Heating Alert for Ion Traps
    if (isIonTrap && (metrics.phonon_number ?? 0) > 2.0) {
      const t1Display = metrics.average_t1 > 1e6
        ? `${(metrics.average_t1 / 1e6).toFixed(2)}${lang === 'RU' ? 'с' : 's'}`
        : `${metrics.average_t1.toFixed(0)}${lang === 'RU' ? 'мкс' : 'µs'}`;
      return t.dialogueDecoherenceCritical(
        (metrics.fidelity * 100).toFixed(1),
        t1Display
      );
    }

    return t.dialogueWelcome;
  };

  const cleanSpeech = getSpeech().replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '');

  return (
    <div className="w-full hud-panel p-3.5 text-sm font-mono leading-relaxed select-text text-[var(--text-main)]">
      {cleanSpeech}
    </div>
  );
};
