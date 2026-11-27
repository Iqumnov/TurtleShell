/**
 * TurtleShell-RT: Client-Side In-Browser Simulation Engine
 * Enables standalone zero-backend execution on Cloudflare Pages (turtleshell.iqumnov.com).
 * Accurately models the physical QPU layouts, attack scenarios, and 4 protection contours in pure TypeScript.
 *
 * Author: Matvei Igumnov
 * License: MIT
 */

import { SimMetrics, QpuState, QubitState, CouplerState } from './useSimStore';

export class ClientSimulationEngine {
  private timeStep: number = 0;
  private phononNumber: number = 0.05;
  private cumulativeSavings: number = 0;
  private cumulativeCosts: number = 0;
  private cumulativeWastedCash: number = 0;
  private historyZ: number[] = [];
  private rngSeed: number = 42;

  // Configuration
  private qpuType: string = 'trapped_ion_paul_trap';
  private ionSpecies: string = 'Ca40';
  private nIons: number = 20;
  private tenantCount: number = 2;
  private schedulingAlgo: string = 'spectral';
  private activeScenario: string = 'crosstalk';
  private crosstalkIntensity: number = 80.0;
  private gateFrequencyHz: number = 1e6;
  private rowhammerIterations: number = 600;
  private primeDelayUs: number = 80.0;
  private envTemperatureMk: number = 15.0;
  private snrDb: number = 15.0;

  private defenseL1: boolean = true;
  private defenseL2: boolean = true;
  private defenseL3: boolean = true;
  private defenseL4: boolean = true;
  private hourlyCost: number = 120.0;
  private utilization: number = 85.0;
  private scDelayUs: number = 400.0;
  private scOverheadPct: number = 5.0;

  constructor() {
    this.reset();
  }

  public updateConfig(config: Record<string, any>) {
    if (config.qpuType !== undefined) this.qpuType = config.qpuType;
    if (config.ionSpecies !== undefined) this.ionSpecies = config.ionSpecies;
    if (config.nIons !== undefined) this.nIons = config.nIons;
    if (config.tenantCount !== undefined) this.tenantCount = config.tenantCount;
    if (config.schedulingAlgo !== undefined) this.schedulingAlgo = config.schedulingAlgo;
    if (config.activeScenario !== undefined) this.activeScenario = config.activeScenario;
    if (config.crosstalkIntensity !== undefined) this.crosstalkIntensity = config.crosstalkIntensity;
    if (config.gateFrequencyHz !== undefined) this.gateFrequencyHz = config.gateFrequencyHz;
    if (config.rowhammerIterations !== undefined) this.rowhammerIterations = config.rowhammerIterations;
    if (config.primeDelayUs !== undefined) this.primeDelayUs = config.primeDelayUs;
    if (config.envTemperatureMk !== undefined) this.envTemperatureMk = config.envTemperatureMk;
    if (config.snrDb !== undefined) this.snrDb = config.snrDb;
    if (config.defenseL1 !== undefined) this.defenseL1 = config.defenseL1;
    if (config.defenseL2 !== undefined) this.defenseL2 = config.defenseL2;
    if (config.defenseL3 !== undefined) this.defenseL3 = config.defenseL3;
    if (config.defenseL4 !== undefined) this.defenseL4 = config.defenseL4;
    if (config.hourlyCost !== undefined) this.hourlyCost = config.hourlyCost;
    if (config.utilization !== undefined) this.utilization = config.utilization;
  }

  public reset() {
    this.timeStep = 0;
    this.phononNumber = 0.05;
    this.cumulativeSavings = 0;
    this.cumulativeCosts = 0;
    this.cumulativeWastedCash = 0;
    this.scDelayUs = 400.0;
    this.scOverheadPct = 5.0;
    this.historyZ = [];
  }

  private pseudoRandom(): number {
    this.rngSeed = (this.rngSeed * 9301 + 49297) % 233280;
    return this.rngSeed / 233280;
  }

  private normalRandom(mean: number, std: number): number {
    const u = Math.max(1e-6, this.pseudoRandom());
    const v = Math.max(1e-6, this.pseudoRandom());
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * std;
  }

  public tick(): SimMetrics {
    this.timeStep += 1;
    const isIon = this.qpuType.includes('trapped_ion');
    const isSr = this.qpuType.includes('sr_optical');
    const isHeron = this.qpuType.includes('heron');

    // 1. Generate QPU Topology & Calibration
    const qubits: QubitState[] = [];
    const couplers: CouplerState[] = [];

    let numQubits = isIon ? this.nIons : isSr ? 100 : isHeron ? 133 : 127;
    let baseT1 = isIon ? 1.0e6 : isSr ? 6.0e7 : isHeron ? 172.0 : 148.0;
    let baseT2 = isIon ? 5.0e5 : isSr ? 3.0e7 : isHeron ? 115.0 : 96.0;
    const speciesMap: Record<string, { heating: number; cooling: number; rfDb: number }> = {
      Ca40: { heating: 0.1, cooling: 8.0, rfDb: -60.0 },
      Sr88: { heating: 0.05, cooling: 10.0, rfDb: -62.0 },
      Ba138: { heating: 0.02, cooling: 12.0, rfDb: -58.0 },
      Yb171: { heating: 0.08, cooling: 9.0, rfDb: -61.0 },
    };
    const sp = speciesMap[this.ionSpecies] ?? speciesMap.Ca40;
    const heatingRate = isIon ? sp.heating : 0.0;
    const ionCoolingRate = sp.cooling;
    const rfBaseDb = isIon ? sp.rfDb : isSr ? -80.0 : -50.0;

    // Motional mode phonon heating for ion traps:
    // Analytical Fokker-Planck/Lindblad rate equation n_bar(t) = n_ss + (n0 - n_ss) * exp(-eta * t)
    let computedTauB = 0.0;
    if (isIon) {
      const coolingRate = ionCoolingRate;
      const nTarget = 0.2;
      const nSs = heatingRate / coolingRate;
      if (this.defenseL3) {
        if (this.phononNumber > nTarget && nTarget > nSs) {
          computedTauB = (1.0 / coolingRate) * Math.log((this.phononNumber - nSs) / (nTarget - nSs));
        }
        const effectiveDt = Math.max(0.05, computedTauB);
        this.phononNumber = Math.max(nSs, nSs + (this.phononNumber - nSs) * Math.exp(-coolingRate * effectiveDt));
      } else {
        // Thermal accumulation with passive damping rate: n(t + 0.1s)
        this.phononNumber = Math.min(5.0, this.phononNumber + heatingRate * 0.1);
      }
    } else {
      this.phononNumber = 0.0;
    }

    const residualFloor = isIon ? 0.01 : isSr ? 0.0 : isHeron ? 0.15 : 1.0;
    const effectiveAlgo =
      this.defenseL1 && this.schedulingAlgo !== 'tdm' && this.schedulingAlgo !== 'spectral'
        ? 'spectral'
        : this.schedulingAlgo;
    const tenantN = Math.max(1, this.tenantCount);
    const freqNorm = Math.min(1.0, Math.max(0.0, (this.gateFrequencyHz - 1e5) / (1e7 - 1e5)));
    const gateCountVal = Math.max(2, Math.min(18, Math.floor(2 + 16 * freqNorm)));

    // Build Qubit nodes (true Heavy-Hex geometry for Eagle 127Q / Heron 133Q)
    const coordToIdx = new Map<string, number>();
    if (!isIon && !isSr) {
      const rows = 15;
      const cols = isHeron ? 14 : 13;
      const coords: Array<[number, number]> = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const isQ =
            c % 2 === 0 ||
            (c % 4 === 1 && r % 4 === 0) ||
            (c % 4 === 3 && r % 4 === 2);
          if (isQ) coords.push([c, r]);
        }
      }
      numQubits = Math.min(numQubits, coords.length);
      for (let i = 0; i < numQubits; i++) {
        const [c, r] = coords[i];
        coordToIdx.set(`${c},${r}`, i);
        const t1 = Math.max(1.0, this.normalRandom(baseT1, baseT1 * 0.02));
        const t2 = Math.max(1.0, Math.min(2.0 * t1, this.normalRandom(baseT2, baseT2 * 0.02)));
        qubits.push({
          id: i,
          x: c * 1.5,
          y: r * 1.0,
          t1,
          t2,
          err_1q: 1e-3,
          err_readout: 2e-2,
          active_tenant: null,
          gate_count: gateCountVal,
        });
      }
    } else {
      for (let i = 0; i < numQubits; i++) {
        const x = isIon ? (i - (numQubits - 1) / 2) * 1.5 : (i % 10) * 4.0;
        const y = isIon ? 0 : Math.floor(i / 10) * 4.0;
        const t1 = Math.max(1.0, this.normalRandom(baseT1, baseT1 * 0.02));
        const t2 = Math.max(1.0, Math.min(2.0 * t1, this.normalRandom(baseT2, baseT2 * 0.02)));
        qubits.push({
          id: i,
          x,
          y,
          t1,
          t2,
          err_1q: 1e-4,
          err_readout: isIon ? 1e-3 : 5e-3,
          active_tenant: null,
          gate_count: gateCountVal,
        });
      }
    }

    // Assign tenants matching backend schedulers: tdm | spectral | static | random
    if (effectiveAlgo === 'tdm') {
      for (let i = 0; i < numQubits; i++) {
        qubits[i].active_tenant = 0;
      }
    } else if (effectiveAlgo === 'spectral' || effectiveAlgo === 'static') {
      const indices =
        effectiveAlgo === 'spectral'
          ? [...qubits]
              .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y))
              .map((q) => q.id)
          : qubits.map((q) => q.id);
      const partitionSize = Math.ceil(numQubits / tenantN);
      indices.forEach((qid, pos) => {
        qubits[qid].active_tenant = Math.min(tenantN - 1, Math.floor(pos / partitionSize));
      });
    } else {
      // Pseudo-random seeded scatter matching backend random baseline
      for (let i = 0; i < numQubits; i++) {
        qubits[i].active_tenant = (i * 7 + 3) % tenantN;
      }
    }

    // Build Couplers and enforce L1 boundary detuning when defenseL1 is active
    const pushCoupler = (u: number, v: number, baseZz: number) => {
      const tu = qubits[u]?.active_tenant ?? null;
      const tv = qubits[v]?.active_tenant ?? null;
      const detune = this.defenseL1 && residualFloor < 1.0 && tu !== null && tv !== null && tu !== tv;
      couplers.push({
        q1: u,
        q2: v,
        active: !detune,
        zz_crosstalk: detune ? Math.round(baseZz * residualFloor * 1e6) / 1e6 : Math.max(0.001, baseZz),
      });
    };

    if (isIon) {
      for (let i = 0; i < numQubits; i++) {
        for (let j = i + 1; j < numQubits; j++) {
          pushCoupler(i, j, 2.0 / Math.pow(Math.abs(i - j), 3));
        }
      }
    } else if (isSr) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          const idx = r * 10 + c;
          if (c + 1 < 10) pushCoupler(idx, idx + 1, 0.05);
          if (r + 1 < 10) pushCoupler(idx, idx + 10, 0.05);
        }
      }
    } else {
      const baseZz = isHeron ? 1.1 : 4.8;
      for (const [key, u] of coordToIdx.entries()) {
        const [cs, rs] = key.split(',').map(Number);
        const down = coordToIdx.get(`${cs},${rs + 1}`);
        if (down !== undefined) pushCoupler(u, down, baseZz);
        if (cs % 2 === 1) {
          const left = coordToIdx.get(`${cs - 1},${rs}`);
          if (left !== undefined) pushCoupler(u, left, baseZz);
          const right = coordToIdx.get(`${cs + 1},${rs}`);
          if (right !== undefined) pushCoupler(u, right, baseZz);
        }
      }
    }

    // 2. Physical Threat Vector Simulation & Telemetry Degradation
    const isolatedFidelity = isIon ? 0.995 : isSr ? 0.999 : 0.94;
    let crosstalkPhaseError = 0.0;
    let rowhammerDegrad = 0.0;
    let primeProbeExcitation = 0.0;
    let rfDecodeAccuracy = 0.0;
    let rfMutualInfo = 0.0;
    let rfAttackSeverity = 0.0;

    // Compute physical minimum hop distance BEFORE scenario math so crosstalk/rowhammer depend on topology
    const t0Qubits = qubits.filter((q) => q.active_tenant === 0).map((q) => q.id);
    const t1Qubits = qubits.filter((q) => q.active_tenant === 1).map((q) => q.id);
    let crosstalkHops = -1;
    if (t0Qubits.length > 0 && t1Qubits.length > 0) {
      if (isIon) {
        crosstalkHops = numQubits;
        for (const q0 of t0Qubits) {
          for (const q1 of t1Qubits) {
            crosstalkHops = Math.min(crosstalkHops, Math.abs(q0 - q1));
          }
        }
      } else {
        const adj = new Map<number, number[]>();
        for (const c of couplers) {
          if (c.active || c.zz_crosstalk > 0) {
            if (!adj.has(c.q1)) adj.set(c.q1, []);
            if (!adj.has(c.q2)) adj.set(c.q2, []);
            adj.get(c.q1)!.push(c.q2);
            adj.get(c.q2)!.push(c.q1);
          }
        }
        const t1Set = new Set(t1Qubits);
        const distMap = new Map<number, number>();
        const queue: number[] = [];
        for (const start of t0Qubits) {
          distMap.set(start, 0);
          queue.push(start);
        }
        let head = 0;
        while (head < queue.length) {
          const cur = queue[head++];
          const d = distMap.get(cur)!;
          if (t1Set.has(cur)) {
            crosstalkHops = d;
            break;
          }
          for (const nb of adj.get(cur) ?? []) {
            if (!distMap.has(nb)) {
              distMap.set(nb, d + 1);
              queue.push(nb);
            }
          }
        }
      }
    }

    // Apply physical T1/T2 thermal/rowhammer degradation first
    const envDegrad =
      this.activeScenario === 'environment'
        ? isSr
          ? 0.0
          : isIon
          ? Math.min(0.35, Math.max(0, (this.envTemperatureMk - 15.0) * 1e-3 * 5.0))
          : 1.0 - Math.exp(-Math.max(0, this.envTemperatureMk - 15.0) / 8.0)
        : 0.0;
    if (this.activeScenario === 'rowhammer') {
      const load = this.rowhammerIterations / 1000.0;
      const distFactor = crosstalkHops > 0 ? 1.0 / Math.pow(crosstalkHops, 2) : 1.0;
      rowhammerDegrad =
        crosstalkHops < 0 || crosstalkHops >= 5
          ? 0.0
          : isSr
          ? 0.0
          : isIon
          ? Math.min(0.15, 0.08 * load * distFactor)
          : isHeron
          ? Math.min(0.4, 0.35 * load * distFactor * 0.6)
          : Math.min(0.4, 0.35 * load * distFactor);
    }

    const totalCoherenceDegrad = Math.min(0.95, rowhammerDegrad + envDegrad);
    let sumT1 = 0.0;
    let sumT2 = 0.0;
    let victimT2Sum = 0.0;
    let victimCount = 0;
    for (const q of qubits) {
      q.t1 *= 1.0 - totalCoherenceDegrad;
      q.t2 *= 1.0 - totalCoherenceDegrad;
      sumT1 += q.t1;
      sumT2 += q.t2;
      if (q.active_tenant === 0) {
        victimT2Sum += q.t2;
        victimCount += 1;
      }
    }
    const avgT1 = qubits.length > 0 ? sumT1 / qubits.length : baseT1;
    const avgT2 = qubits.length > 0 ? sumT2 / qubits.length : baseT2;
    const victimAvgT2 = victimCount > 0 ? victimT2Sum / victimCount : baseT2;

    const lmsSuppressionDb = this.defenseL1 && isIon && this.activeScenario === 'rf_leakage'
      ? Math.round((24.6 + this.pseudoRandom() * 1.4) * 10) / 10
      : 0.0;
    const effectiveRfLeakageDb = isIon ? Math.round((rfBaseDb - lmsSuppressionDb) * 10) / 10 : rfBaseDb;

    let rawFidelity = isolatedFidelity;
    if (this.activeScenario === 'crosstalk' && crosstalkHops >= 0) {
      const attenFactor = this.defenseL1 && residualFloor < 1.0 ? residualFloor : 1.0;
      if (attenFactor > 0) {
        const t0Set = new Set(t0Qubits);
        const t1Set = new Set(t1Qubits);
        const boundaryZz: number[] = [];
        const incidentZz: number[] = [];
        for (const c of couplers) {
          const w = isIon ? 2.0 / Math.pow(Math.abs(c.q1 - c.q2), 3) : isSr ? 0.05 : isHeron ? 1.1 : 4.8;
          if ((t0Set.has(c.q1) && t1Set.has(c.q2)) || (t0Set.has(c.q2) && t1Set.has(c.q1))) {
            boundaryZz.push(w);
          }
          if (t0Set.has(c.q1) || t0Set.has(c.q2) || t1Set.has(c.q1) || t1Set.has(c.q2)) {
            incidentZz.push(w);
          }
        }
        const defaultZz = isIon ? 2.0 : isSr ? 0.05 : isHeron ? 1.1 : 4.8;
        const baseZz = boundaryZz.length > 0
          ? boundaryZz.reduce((a, b) => a + b, 0) / boundaryZz.length
          : incidentZz.length > 0
          ? incidentZz.reduce((a, b) => a + b, 0) / incidentZz.length
          : defaultZz;
        const freqFactor = Math.max(0.5, Math.min(3.0, this.gateFrequencyHz / 1e6));
        const durationS = 100e-6 * (this.crosstalkIntensity / 100.0) * freqFactor;
        const effZzHz = baseZz * attenFactor * Math.pow(0.65, Math.max(0, crosstalkHops - 1)) * 1e3;
        crosstalkPhaseError = Math.min(Math.PI, 2 * Math.PI * effZzHz * durationS);
        const drop = Math.min(0.35, 0.36 * (1.0 - Math.exp(-0.25 * Math.pow(crosstalkPhaseError, 2))));
        rawFidelity = Math.max(0.1, isolatedFidelity - drop);
      }
    } else if (this.activeScenario === 'rowhammer') {
      rawFidelity = Math.max(0.1, isolatedFidelity - 0.35 * rowhammerDegrad);
    } else if (this.activeScenario === 'prime_probe') {
      if (isIon) {
        const nPrime = 2.0 + heatingRate * 0.1;
        primeProbeExcitation = nPrime * Math.exp(-Math.max(0, this.primeDelayUs) / 300.0);
        rawFidelity = Math.min(isolatedFidelity, Math.max(0.1, 0.995 / (1.0 + primeProbeExcitation * 0.3)));
      } else if (isSr) {
        primeProbeExcitation = 0.05 * Math.exp(-Math.max(0, this.primeDelayUs) / 1000.0);
        rawFidelity = Math.min(isolatedFidelity, Math.max(0.1, 0.94 - primeProbeExcitation * 0.05));
      } else {
        primeProbeExcitation = 0.6 * Math.exp(-Math.max(0, this.primeDelayUs) / Math.max(1.0, victimAvgT2));
        rawFidelity = Math.min(isolatedFidelity, Math.max(0.1, 0.90 - primeProbeExcitation));
      }
    } else if (this.activeScenario === 'rf_leakage') {
      // Passive eavesdropping: breaches confidentiality without degrading gate fidelity
      rawFidelity = isolatedFidelity;
      if (isIon && t0Qubits.length > 0) {
        const rawAcc = 1.0 / (1.0 + Math.exp(-(this.snrDb + 5.0) / 5.0));
        rfAttackSeverity = Math.max(0.0, Math.min(1.0, rawAcc * (1.0 - Math.abs(rfBaseDb) / 120.0)));
        const effSnrDb = this.defenseL1 ? this.snrDb - lmsSuppressionDb : this.snrDb;
        const effSnrLin = Math.pow(10, effSnrDb / 10.0);
        rfDecodeAccuracy = 1.0 / (1.0 + Math.exp(-(effSnrDb + 5.0) / 5.0));
        rfMutualInfo = Math.min(
          Math.log2(1.0 + Math.max(0, effSnrLin)),
          rfDecodeAccuracy * Math.log2(Math.max(2, t0Qubits.length))
        );
      }
    } else if (this.activeScenario === 'environment') {
      const excessRate = Math.max(0.0, 1.0 / Math.max(0.01, victimAvgT2) - 1.0 / Math.max(0.01, baseT2));
      const circuitTimeUs = isIon ? 200000.0 : 0.5;
      rawFidelity = Math.max(0.01, isolatedFidelity * Math.exp(-circuitTimeUs * excessRate));
    }

    // Dynamic Isolation Index: 100 * (1 - J_post / J_random) matching backend VirtualQPU.compute_isolation_index
    const activePoolCount = qubits.filter((q) => q.active_tenant !== null).length;
    const tenantCounts = new Map<number, number>();
    for (const q of qubits) {
      if (q.active_tenant !== null) {
        tenantCounts.set(q.active_tenant, (tenantCounts.get(q.active_tenant) ?? 0) + 1);
      }
    }
    let activePoolZz = 0.0;
    let crossZzPost = 0.0;
    for (const c of couplers) {
      const t1 = qubits[c.q1]?.active_tenant ?? null;
      const t2 = qubits[c.q2]?.active_tenant ?? null;
      if (t1 !== null && t2 !== null) {
        const baseW = isIon ? 2.0 / Math.pow(Math.abs(c.q1 - c.q2), 3) : isSr ? 0.05 : isHeron ? 1.1 : 4.8;
        activePoolZz += baseW;
        if (t1 !== t2) {
          crossZzPost += baseW * (this.defenseL1 ? residualFloor : 1.0);
        }
      }
    }
    let isolationIndex = 100.0;
    if (tenantCounts.size > 1 && activePoolCount > 1 && activePoolZz > 0.0 && crossZzPost > 0.0) {
      let samePairs = 0;
      for (const n of tenantCounts.values()) {
        samePairs += n * (n - 1);
      }
      const pCrossRandom = Math.max(1e-9, 1.0 - samePairs / (activePoolCount * (activePoolCount - 1)));
      const jRandom = activePoolZz * pCrossRandom;
      isolationIndex = Math.round(Math.max(0.0, Math.min(100.0, 100.0 * (1.0 - crossZzPost / jRandom))) * 10) / 10;
    }

    // 3. Contour 2 & Contour 4 Anomaly Detection (aligned to backend scales)
    const isCompilerTamper = this.crosstalkIntensity > 75 && this.activeScenario === 'crosstalk';
    const anomalyFlaggedL2 = isCompilerTamper;
    const anomalyScoreL2 = isCompilerTamper
      ? 0.05 + 0.02 * this.pseudoRandom()
      : 0.68 + 0.03 * this.pseudoRandom();

    const isTelemetryFault =
      (!isSr && ((this.activeScenario === 'rowhammer' && this.rowhammerIterations > 750) ||
                 (this.activeScenario === 'environment' && this.envTemperatureMk > 25.0))) ||
      (isIon && this.activeScenario === 'rf_leakage' && this.snrDb > 5.0);

    const autoencoderLossL4 = isTelemetryFault
      ? 0.14 + this.pseudoRandom() * 0.06
      : 0.012 + this.pseudoRandom() * 0.008;

    // SPC Z-Score (Contour 4) over prior baseline (historyZ) to avoid Samuelson masking
    const rawSignal = (isolatedFidelity - rawFidelity) * 10.0 + (isTelemetryFault ? 3.5 : 0.0) + (this.pseudoRandom() - 0.5) * 0.35;
    let zScore = 0.0;
    if (this.historyZ.length >= 10) {
      const n = this.historyZ.length;
      const meanZ = this.historyZ.reduce((a, b) => a + b, 0) / n;
      const stdZ = Math.max(0.05, Math.sqrt(this.historyZ.reduce((a, b) => a + Math.pow(b - meanZ, 2), 0) / n));
      zScore = Math.abs((rawSignal - meanZ) / stdZ);
    }
    this.historyZ.push(rawSignal);
    if (this.historyZ.length > 60) this.historyZ.shift();

    let threatLevel = 0;
    if (zScore >= 5.25) threatLevel = 3;
    else if (zScore >= 3.5) threatLevel = 2;
    else if (zScore >= 2.5) threatLevel = 1;

    const anomalyFlaggedL4 = isTelemetryFault || autoencoderLossL4 > 0.08 || threatLevel >= 2;

    // Contour 1-4 Mitigation Recovery matching main.py
    const rawLoss = Math.max(0.0, isolatedFidelity - rawFidelity);
    let recovery = 0.0;
    if (this.defenseL1) {
      if (this.activeScenario === 'rf_leakage' && isIon) {
        // Confidential protection handled below
      } else if (residualFloor < 1.0) {
        recovery += rawLoss * (0.85 * (1.0 - residualFloor));
      } else if ((this.activeScenario === 'crosstalk' || this.activeScenario === 'rowhammer') && isolationIndex > 0) {
        recovery += rawLoss * (0.4 * (isolationIndex / 100.0));
      }
    }
    if (this.defenseL2) {
      recovery += rawLoss * (isCompilerTamper ? 0.90 : 0.15);
    }
    if (this.defenseL3 && !isSr) {
      const ionCoolingValid = !isIon || heatingRate / ionCoolingRate < 0.2;
      recovery += rawLoss * (ionCoolingValid ? 0.80 : 0.25);
    }
    if (this.defenseL4 && (anomalyFlaggedL4 || threatLevel >= 2)) {
      recovery += rawLoss * 0.95;
    }
    recovery = Math.min(rawLoss, recovery);
    const fidelityJitter = this.normalRandom(0, 0.0015);
    const currentFidelity = Math.max(0.01, Math.min(isolatedFidelity, rawFidelity + recovery + fidelityJitter));
    const fidelityDrop = Math.max(0.0, isolatedFidelity - currentFidelity);

    // Update Contour 3 adaptive SC buffer state (matching defense.py)
    if (this.defenseL3 && !isIon && !isSr) {
      if (anomalyFlaggedL2) {
        this.scDelayUs = Math.min(1500.0, this.scDelayUs * 1.2);
        this.scOverheadPct = Math.min(35.0, this.scOverheadPct + 4.5);
      } else {
        this.scDelayUs = Math.max(400.0, this.scDelayUs * 0.9);
        this.scOverheadPct = Math.max(5.0, this.scOverheadPct - 1.2);
      }
    } else if (!this.defenseL3 || isSr) {
      this.scDelayUs = 0.0;
      this.scOverheadPct = 0.0;
    }

    const bufferDelayUs = this.defenseL3
      ? isIon
        ? Math.round(computedTauB * 1e6 * 10) / 10
        : isSr
        ? 0.0
        : Math.round(this.scDelayUs * 10) / 10
      : 0.0;
    const bufferOverheadPct = this.defenseL3
      ? isIon
        ? Math.round(Math.min(50.0, (computedTauB / Math.max(0.01, computedTauB + 1.0)) * 100.0) * 10) / 10
        : isSr
        ? 0.0
        : Math.round(this.scOverheadPct * 10) / 10
      : 0.0;

    // Economics matching main.py (360 ticks = 1 hr; RERUN_COST_MULTIPLIER = 2.5)
    const baseRunCost = (this.hourlyCost * (this.utilization / 100.0)) / 360.0;
    const hasDefenses = this.defenseL1 || this.defenseL2 || this.defenseL3 || this.defenseL4;
    const rfRiskFrac = this.activeScenario === 'rf_leakage' && isIon ? rfAttackSeverity * 0.25 : 0.0;
    const rfMitigatedFrac =
      this.defenseL1 && rfRiskFrac > 0 ? rfRiskFrac * Math.min(1.0, 0.7 + 0.25 * Math.min(1.0, lmsSuppressionDb / 30.0)) : 0.0;
    const totalRisk = rawLoss + rfRiskFrac;
    const totalRecovered = Math.min(totalRisk, recovery + rfMitigatedFrac);
    const avoidedStepLoss = hasDefenses && totalRisk > 0 ? totalRecovered * baseRunCost * 2.5 : 0.0;
    const wastedStepLoss = Math.max(0.0, totalRisk - totalRecovered) * baseRunCost * 2.5;
    const defenseOverhead =
      (this.defenseL1 ? baseRunCost * 0.05 : 0.0) +
      (this.defenseL2 ? baseRunCost * 0.03 : 0.0) +
      (this.defenseL3 ? baseRunCost * (bufferOverheadPct / 100.0) : 0.0) +
      (this.defenseL4 ? baseRunCost * 0.04 : 0.0);

    this.cumulativeSavings += avoidedStepLoss;
    this.cumulativeCosts += defenseOverhead;
    this.cumulativeWastedCash += wastedStepLoss;

    // Deterministic 64-hex-char telemetry fingerprint derived from circuit signature & active controls
    const sigStr = `${this.qpuType}:${this.schedulingAlgo}:${this.tenantCount}:${this.activeScenario}:${this.crosstalkIntensity}:${this.defenseL1}:${this.defenseL2}:${this.defenseL3}:${this.defenseL4}:${this.timeStep}`;
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    let h3 = 0x85ebca6b;
    let h4 = 0xc2b2ae35;
    for (let i = 0; i < sigStr.length; i++) {
      const ch = sigStr.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
      h3 = Math.imul(h3 ^ (ch * 31), 0xc2b2ae35) >>> 0;
      h4 = Math.imul(h4 ^ (ch + 17), 0x27d4eb2f) >>> 0;
    }
    const circuitHash = [h1, h2, h3, h4, h1 ^ h2, h3 ^ h4, h1 + h3, h2 + h4]
      .map((w) => (w >>> 0).toString(16).padStart(8, '0'))
      .join('');

    const qpuState: QpuState = {
      layout_type: this.qpuType,
      platform_display_name: isIon
        ? `TrappedIonPaulTrap (${this.ionSpecies}, N=${numQubits})`
        : isSr
        ? 'SrOpticalLattice (100 87Sr atoms, 2D)'
        : isHeron
        ? 'IBM Heron (133Q Heavy-Hex Tunable)'
        : 'IBM Eagle (127Q Heavy-Hex Fixed)',
      qubits,
      couplers,
      heating_rate: heatingRate,
      phonon_number: this.phononNumber,
      rf_leakage_db: effectiveRfLeakageDb,
      temperature_k: isIon ? 1e-6 : isSr ? 300.0 : 0.015,
      n_vibrational_modes: isIon ? numQubits : 0,
    };

    return {
      time_step: this.timeStep,
      fidelity: Math.round(currentFidelity * 10000) / 10000,
      fidelity_drop: Math.round(fidelityDrop * 10000) / 100,
      average_t1: Math.round(avgT1 * 10) / 10,
      average_t2: Math.round(avgT2 * 10) / 10,
      anomaly_score_l2: Math.round(anomalyScoreL2 * 10000) / 10000,
      anomaly_flagged_l2: anomalyFlaggedL2,
      circuit_hash: circuitHash,
      autoencoder_loss_l4: Math.round(autoencoderLossL4 * 10000) / 10000,
      anomaly_flagged_l4: anomalyFlaggedL4,
      monitor_z_score: Math.round(zScore * 100) / 100,
      monitor_threat_level: threatLevel,
      buffer_delay_us: bufferDelayUs,
      buffer_overhead_pct: bufferOverheadPct,
      cooling_buffer_tau_s: this.defenseL3 && isIon ? Math.round(computedTauB * 10000) / 10000 : 0.0,
      cooling_valid: true,
      platform_type: this.qpuType,
      phonon_number: Math.round(this.phononNumber * 1000) / 1000,
      heating_rate: heatingRate,
      rf_leakage_db: effectiveRfLeakageDb,
      lms_suppression_db: lmsSuppressionDb,
      cumulative_savings: Math.round(this.cumulativeSavings * 100) / 100,
      cumulative_costs: Math.round(this.cumulativeCosts * 100) / 100,
      cumulative_wasted_cash: Math.round(this.cumulativeWastedCash * 100) / 100,
      net_benefit: Math.round((this.cumulativeSavings - this.cumulativeCosts) * 100) / 100,
      isolation_index: isolationIndex,
      qpu: qpuState,
      active_scenario_metrics: {
        crosstalk_hops: crosstalkHops,
        crosstalk_phase_error: Math.round(crosstalkPhaseError * 1000) / 1000,
        rowhammer_degradation: Math.round(rowhammerDegrad * 1000) / 10,
        prime_probe_excitation: Math.round(primeProbeExcitation * 1000) / 1000,
        prime_probe_phonon_nbar: Math.round(this.phononNumber * 1000) / 1000,
        rf_decode_accuracy: Math.round(rfDecodeAccuracy * 1000) / 1000,
        rf_mutual_info_bits: Math.round(rfMutualInfo * 100) / 100,
      },
    };
  }
}

