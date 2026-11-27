import React, { useEffect, useRef, useState } from 'react';
import { useSimStore } from '../store/useSimStore';
import { translations } from '../locales/translations';

export const EventLogPanel: React.FC = () => {
  const store = useSimStore();
  const metrics = store.metrics;
  const lang = store.language;
  const t = translations[lang];

  const [logs, setLogs] = useState<string[]>([]);
  const lastStepRef = useRef<number>(0);
  const lastQpuRef = useRef<string | undefined>(undefined);
  const lastLangRef = useRef<'EN' | 'RU'>(lang);
  const isIonTrap = metrics?.platform_type?.includes('trapped_ion');

  const timeStep = metrics?.time_step;
  const platformType = metrics?.platform_type;
  const flaggedL2 = metrics?.anomaly_flagged_l2;
  const scoreL2 = metrics?.anomaly_score_l2 ?? 0;
  const coolingTauS = metrics?.cooling_buffer_tau_s;
  const bufferDelayUs = metrics?.buffer_delay_us;
  const threatLevel = metrics?.monitor_threat_level ?? 0;
  const zScore = metrics?.monitor_z_score;
  const flaggedL4 = metrics?.anomaly_flagged_l4;
  const lossL4 = metrics?.autoencoder_loss_l4;

  useEffect(() => {
    if (timeStep === undefined) return;
    const langChanged = lastLangRef.current !== lang;
    lastLangRef.current = lang;
    const isReset = timeStep < lastStepRef.current || (lastQpuRef.current !== undefined && lastQpuRef.current !== platformType);
    lastStepRef.current = timeStep;
    lastQpuRef.current = platformType;

    const nextLogs: string[] = [];
    const timestamp = new Date().toLocaleTimeString();

    const isRu = lang === 'RU';

    if (flaggedL2) {
      nextLogs.push(
        isRu
          ? `${timestamp} · C2 · Аномалия: целостность компиляции (довер. ${(scoreL2 * 100).toFixed(1)}%)`
          : `${timestamp} · C2 · Anomaly: SHA-256 mismatch (conf ${(scoreL2 * 100).toFixed(1)}%)`
      );
    }
    if (store.defenseL3 && timeStep % 10 === 0) {
      if (isIonTrap) {
        nextLogs.push(
          isRu
            ? `${timestamp} · C3 · охлаждение: тау=${coolingTauS?.toFixed(3) ?? '?'} с`
            : `${timestamp} · C3 · cooling: tau=${coolingTauS?.toFixed(3) ?? '?'} s`
        );
      } else {
        nextLogs.push(
          isRu
            ? `${timestamp} · C3 · задержка сброса T1: ${bufferDelayUs} мкс`
            : `${timestamp} · C3 · T1 reset delay: ${bufferDelayUs} us`
        );
      }
    }
    if (threatLevel >= 2) {
      nextLogs.push(
        isRu
          ? `${timestamp} · C4 · Угроза L${threatLevel}: z-счёт=${zScore?.toFixed(2)}`
          : `${timestamp} · C4 · Threat L${threatLevel}: z-score=${zScore?.toFixed(2)}`
      );
    } else if (flaggedL4 && (lossL4 ?? 0) > 0.08) {
      nextLogs.push(
        isRu
          ? `${timestamp} · C4 · Аномалия автокодировщика: потери=${lossL4?.toFixed(4)}`
          : `${timestamp} · C4 · Autoencoder anomaly: loss=${lossL4?.toFixed(4)}`
      );
    }

    if (isReset || langChanged) {
      setLogs(nextLogs.slice(0, 25));
      return;
    }

    if (nextLogs.length > 0) {
      setLogs((prev) => {
        const recentPayloads = new Set(prev.slice(0, 5).map((p) => p.replace(/^\S+\s*·\s*/, '')));
        const unique = nextLogs.filter((n) => !recentPayloads.has(n.replace(/^\S+\s*·\s*/, '')));
        if (unique.length === 0) return prev;
        return [...unique, ...prev].slice(0, 25);
      });
    }
  }, [
    timeStep,
    platformType,
    flaggedL2,
    scoreL2,
    coolingTauS,
    bufferDelayUs,
    threatLevel,
    zScore,
    flaggedL4,
    lossL4,
    lang,
    store.defenseL3,
    isIonTrap,
  ]);

  return (
    <div className="w-full min-h-[340px] h-full max-h-[460px] hud-panel flex flex-col font-mono text-xs select-text overflow-hidden">
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
