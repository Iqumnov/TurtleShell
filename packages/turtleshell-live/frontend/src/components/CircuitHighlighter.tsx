import React from 'react';
import { useSimStore } from '../store/useSimStore';
import { translations } from '../locales/translations';

interface CodeLine {
  lineNum: number;
  code: string;
  isVulnerable: boolean;
  isMitigated: boolean;
  comment?: string;
}

export const CircuitHighlighter: React.FC = () => {
  const store = useSimStore();
  const activeScenario = store.activeScenario;
  const defenseL1 = store.defenseL1;
  const defenseL2 = store.defenseL2;

  const lang = store.language;
  const t = translations[lang];

  const getCodeSnippet = (): { title: string; lines: CodeLine[] } => {
    switch (activeScenario) {
      case 'crosstalk':
        return {
          title: t.qasmCrosstalkTitle,
          lines: [
            { lineNum: 1, code: "OPENQASM 2.0;", isVulnerable: false, isMitigated: false },
            { lineNum: 2, code: "include \"qelib1.inc\";", isVulnerable: false, isMitigated: false },
            { lineNum: 3, code: "qreg q[4];", isVulnerable: false, isMitigated: false },
            { lineNum: 4, code: "creg c[4];", isVulnerable: false, isMitigated: false },
            { lineNum: 5, code: `h q[0]; // ${t.qasmTenantVictim}`, isVulnerable: false, isMitigated: false },
            {
              lineNum: 6,
              code: `cz q[1], q[2]; // ${t.qasmTenantAggressor}`,
              isVulnerable: !defenseL1,
              isMitigated: defenseL1,
              comment: !defenseL1 ? t.qasmVulnCrosstalk : t.qasmMitigatedCrosstalk,
            },
            { lineNum: 7, code: `rz(0.5) q[0]; // ${t.qasmPhaseError}`, isVulnerable: !defenseL1, isMitigated: defenseL1 },
            { lineNum: 8, code: "measure q[0] -> c[0];", isVulnerable: false, isMitigated: false },
          ],
        };

      case 'rowhammer': {
        const l3 = store.defenseL3;
        const rhLines: CodeLine[] = [
          { lineNum: 1, code: "OPENQASM 2.0;", isVulnerable: false, isMitigated: false },
          { lineNum: 2, code: "qreg q[6];", isVulnerable: false, isMitigated: false },
          {
            lineNum: 3,
            code: `for i in 0..${store.rowhammerIterations} {`,
            isVulnerable: !l3,
            isMitigated: false,
            comment: !l3 ? t.qasmVulnRowhammer : undefined,
          },
          { lineNum: 4, code: lang === 'RU' ? "  cx q[1], q[2]; // Возбуждение шины" : "  cx q[1], q[2]; // Drive bus", isVulnerable: !l3, isMitigated: false },
          { lineNum: 5, code: "  cz q[2], q[3];", isVulnerable: !l3, isMitigated: false },
        ];

        if (l3) {
          rhLines.push({
            lineNum: 6,
            code: lang === 'RU' ? "  delay[tau_b] bus; // Вставлен буфер лазерного охлаждения" : "  delay[tau_b] bus; // Laser cooling buffer inserted",
            isVulnerable: false,
            isMitigated: true,
            comment: t.qasmMitigatedRowhammer,
          });
          rhLines.push({ lineNum: 7, code: "  measure q[1]; reset q[1];", isVulnerable: false, isMitigated: false });
          rhLines.push({ lineNum: 8, code: "}", isVulnerable: false, isMitigated: false });
        } else {
          rhLines.push({ lineNum: 6, code: "  measure q[1]; reset q[1];", isVulnerable: !l3, isMitigated: false });
          rhLines.push({ lineNum: 7, code: "}", isVulnerable: false, isMitigated: false });
        }

        return {
          title: t.qasmRowhammerTitle,
          lines: rhLines,
        };
      }

      case 'prime_probe':
        return {
          title: t.qasmPrimeProbeTitle,
          lines: [
            { lineNum: 1, code: "OPENQASM 2.0;", isVulnerable: false, isMitigated: false },
            { lineNum: 2, code: "qreg ion[4];", isVulnerable: false, isMitigated: false },
            { lineNum: 3, code: lang === 'RU' ? "rxx(1.57) ion[0], ion[1]; // Возбуждение фононной моды" : "rxx(1.57) ion[0], ion[1]; // Prime motional mode", isVulnerable: false, isMitigated: false },
            {
              lineNum: 4,
              code: `delay[${store.primeDelayUs}us] ion[2]; // Probe residual n̄`,
              isVulnerable: !store.defenseL3 && !store.defenseL4,
              isMitigated: store.defenseL3 || store.defenseL4,
              comment: (!store.defenseL3 && !store.defenseL4) ? t.qasmVulnPrimeProbe : t.qasmMitigatedPrimeProbe,
            },
            { lineNum: 5, code: "measure ion[2] -> c[2];", isVulnerable: false, isMitigated: false },
          ],
        };

      case 'rf_leakage':
        return {
          title: t.qasmRfLeakageTitle,
          lines: [
            { lineNum: 1, code: "OPENQASM 2.0;", isVulnerable: false, isMitigated: false },
            { lineNum: 2, code: "qreg paul_ion[4];", isVulnerable: false, isMitigated: false },
            {
              lineNum: 3,
              code: `rf_drive freq=1.0MHz, snr=${store.snrDb}dB;`,
              isVulnerable: !store.defenseL1,
              isMitigated: store.defenseL1,
              comment: !store.defenseL1 ? t.qasmVulnRf : t.qasmMitigatedRf,
            },
            { lineNum: 4, code: "ms_gate paul_ion[0], paul_ion[1];", isVulnerable: false, isMitigated: false },
          ],
        };

      default:
        return {
          title: t.qasmStandardTitle,
          lines: [
            { lineNum: 1, code: "OPENQASM 2.0;", isVulnerable: false, isMitigated: false },
            { lineNum: 2, code: "include \"qelib1.inc\";", isVulnerable: false, isMitigated: false },
            { lineNum: 3, code: "qreg q[4];", isVulnerable: false, isMitigated: false },
            { lineNum: 4, code: "h q[0];", isVulnerable: false, isMitigated: false },
            { lineNum: 5, code: "cx q[0], q[1];", isVulnerable: false, isMitigated: false },
            { lineNum: 6, code: "measure q -> c;", isVulnerable: false, isMitigated: false },
          ],
        };
    }
  };

  const { title, lines } = getCodeSnippet();

  const getStatusBoxContent = () => {
    const isRu = lang === 'RU';
    if (activeScenario === 'rowhammer') {
      const active = store.defenseL3;
      return {
        label: isRu ? "КОНТУР 3: БУФЕР ЛАЗЕРНОГО ОХЛАЖДЕНИЯ" : "CONTOUR 3: LASER COOLING BUFFER",
        text: active
          ? (isRu ? "Контур 3 активен: Буфер лазерного охлаждения τ_б вставлен в схему. Тепловой резонанс и сбои когерентности T1/T2 предотвращены." : "Contour 3 active: Laser cooling buffer τ_b inserted into schedule. Thermal resonance and T1/T2 degradation prevented.")
          : (isRu ? "Буфер охлаждения отключен: Циклическая активация шины вызовет термический Rowhammer. Включите Контур 3 для защиты." : "Cooling buffer disabled: Cyclical bus excitation will cause thermal Rowhammer. Enable Contour 3 to protect coherence.")
      };
    }
    if (activeScenario === 'prime_probe') {
      const active = store.defenseL3 || store.defenseL4;
      return {
        label: isRu ? "КОНТУР 3/4: ОХЛАЖДЕНИЕ И ТЕЛЕМЕТРИЧЕСКАЯ ИЗОЛЯЦИЯ" : "CONTOUR 3/4: COOLING & TELEMETRY ISOLATION",
        text: active
          ? (isRu ? "Защита активна: Сброс фононного состояния Контура 3 и мониторинг Контура 4 блокируют боковой канал Prime-and-Probe." : "Protection active: Contour 3 phonon state reset and Contour 4 telemetry isolation block Prime-and-Probe side-channel.")
          : (isRu ? "Защита отключена: Остаточные фононные состояния раскрывают последовательности выполнения. Включите Контур 3 или 4." : "Protection disabled: Residual phonon excitations expose execution sequence. Enable Contour 3 or 4.")
      };
    }
    if (activeScenario === 'rf_leakage') {
      const active = store.defenseL1;
      return {
        label: isRu ? "КОНТУР 1: LMS-ФИЛЬТР ПОДАВЛЕНИЯ РЧ" : "CONTOUR 1: LMS RF NOISE FILTER",
        text: active
          ? (isRu ? "Контур 1 активен: Адаптивный LMS-фильтр подавил паразитные РЧ-эмиссии на 20-30 дБ." : "Contour 1 active: Adaptive LMS filter suppressed parasitic RF side-channel emissions by 20-30 dB.")
          : (isRu ? "Фильтр РЧ отключен: Модуляция частоты ловушки подвержена перехвату приёмником. Включите Контур 1." : "RF filter disabled: Trap frequency modulation is vulnerable to receiver decoding. Enable Contour 1.")
      };
    }
    // Default / Crosstalk
    return {
      label: t.compilerThreat,
      text: defenseL2 ? t.compilerCheckActive : t.compilerCheckDisabled,
    };
  };

  const statusContent = getStatusBoxContent();

  return (
    <div className="w-full hud-panel flex flex-col font-mono text-xs select-text overflow-hidden">
      <div className="hud-header-bar">
        <span>{t.openqasmAuditTitle}</span>
        <span>[ {title} ]</span>
      </div>
      
      {/* Code Display Area */}
      <div className="bg-[var(--bg-color)] border border-[var(--border-color)] p-3 flex-1 overflow-y-auto text-xs text-[var(--text-main)] leading-relaxed select-text flex flex-col gap-1 m-3">
        {lines.map((l: CodeLine, idx: number) => (
          <div
            key={idx}
            className={`font-mono text-xs flex flex-wrap justify-between items-center py-0.5 px-1 ${
              l.isVulnerable ? 'bg-[var(--inset-bg)] border-l-2 border-[var(--border-bright)] font-bold' : ''
            } ${l.isMitigated ? 'border-l-2 border-[var(--border-color)]' : ''}`}
          >
            <div className="flex items-center gap-2 truncate">
              <span className="text-[var(--text-muted)] text-xs w-5 text-right select-none">{l.lineNum}</span>
              <span className="text-xs">{l.code}</span>
            </div>

            {l.comment && (
              <span className="text-xs text-[var(--text-muted)] italic font-sans font-semibold">
                // {l.comment}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Verification Status Banner */}
      <div className="p-2.5 hud-inset flex flex-col gap-1 text-xs leading-tight">
        <span className="font-bold text-xs uppercase text-[var(--text-muted)]">{statusContent.label}:</span>
        <span className="text-[var(--text-main)] text-xs leading-normal">
          {statusContent.text}
        </span>
      </div>
    </div>
  );
};
