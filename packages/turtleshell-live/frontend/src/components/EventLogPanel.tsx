import React, { useEffect, useState } from 'react';
import { useSimStore } from '../store/useSimStore';
import { translations } from '../locales/translations';

export const EventLogPanel: React.FC = () => {
  const store = useSimStore();
  const metrics = store.metrics;
  const lang = store.language;
  const t = translations[lang];

  const [logs, setLogs] = useState<string[]>([]);
  const isIonTrap = metrics?.platform_type?.includes('trapped_ion');

  useEffect(() => {
    if (!metrics) return;
    const nextLogs: string[] = [];
    const timestamp = new Date().toLocaleTimeString();

    const isRu = lang === 'RU';

    if (metrics.anomaly_flagged_l2) {
      nextLogs.push(
        isRu
          ? `[${timestamp}] [C2] АНОМАЛИЯ: несоответствие SHA-256 (${(metrics.anomaly_score_l2 * 100).toFixed(1)}%)`
          : `[${timestamp}] [C2] ANOMALY: SHA-256 mismatch (${(metrics.anomaly_score_l2 * 100).toFixed(1)}%)`
      );
    }
    if (store.defenseL3 && metrics.time_step % 10 === 0) {
      if (isIonTrap) {
        nextLogs.push(
          isRu
            ? `[${timestamp}] [C3] охлаждение: тау=${metrics.cooling_buffer_tau_s?.toFixed(3) ?? '?'} с`
            : `[${timestamp}] [C3] cooling: tau=${metrics.cooling_buffer_tau_s?.toFixed(3) ?? '?'} s`
        );
      } else {
        nextLogs.push(
          isRu
            ? `[${timestamp}] [C3] задержка сброса T1: ${metrics.buffer_delay_us} мкс`
            : `[${timestamp}] [C3] T1 reset delay: ${metrics.buffer_delay_us} us`
        );
      }
    }
    if (metrics.monitor_threat_level >= 2) {
      nextLogs.push(
        isRu
          ? `[${timestamp}] [C4] УГРОЗА У${metrics.monitor_threat_level}: z-счёт=${metrics.monitor_z_score?.toFixed(2)}`
          : `[${timestamp}] [C4] THREAT L${metrics.monitor_threat_level}: z-score=${metrics.monitor_z_score?.toFixed(2)}`
      );
    } else if (metrics.anomaly_flagged_l4 && (metrics.autoencoder_loss_l4 ?? 0) > 0.08) {
      nextLogs.push(
        isRu
          ? `[${timestamp}] [C4] АНОМАЛИЯ АВТОКОДИРОВЩИКА: потери=${metrics.autoencoder_loss_l4?.toFixed(4)}`
          : `[${timestamp}] [C4] AUTOENCODER ANOMALY: loss=${metrics.autoencoder_loss_l4?.toFixed(4)}`
      );
    }

    if (nextLogs.length > 0) {
      setLogs((prev) => {
        const prevPayloads = new Set(prev.map((p) => p.replace(/^\[.*?\]\s*/, '')));
        const unique = nextLogs.filter((n) => !prevPayloads.has(n.replace(/^\[.*?\]\s*/, '')));
        if (unique.length === 0) return prev;
        return [...unique, ...prev].slice(0, 25);
      });
    }
  }, [metrics?.time_step, lang, store.activeScenario, store.defenseL3, isIonTrap]);

  return (
    <div className="w-full h-[380px] hud-panel flex flex-col font-mono text-xs select-text overflow-hidden">
      <div className="hud-header-bar">
        <span>{t.systemEventLog}</span>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2 min-h-0">
        <div className="bg-[var(--bg-color)] border border-[var(--border-color)] p-3 flex-1 overflow-y-auto text-xs font-mono flex flex-col gap-2 select-text">
          {logs.length === 0 ? (
            <div className="text-[var(--text-muted)] text-center mt-20 italic text-xs">
              {t.systemBoundsSecure}
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="text-[var(--text-main)] text-xs">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
