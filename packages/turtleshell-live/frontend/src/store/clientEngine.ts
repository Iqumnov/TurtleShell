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
    const isTm = this.qpuType.includes('tm_optical');
    const isHeron = this.qpuType.includes('heron');
    const isEagle = !isIon && !isTm && !isHeron;

    // 1. Generate QPU Topology & Calibration
    const qubits: QubitState[] = [];
    const couplers: CouplerState[] = [];

    let numQubits = isIon ? this.nIons : isTm ? 100 : isHeron ? 133 : 127;
    let baseT1 = isIon ? 1.0e6 : isTm ? 6.0e7 : isHeron ? 172.0 : 148.0;
    let baseT2 = isIon ? 5.0e5 : isTm ? 3.0e7 : isHeron ? 110.0 : 96.0;

    // Motional mode phonon heating for ion traps
    if (isIon) {
      const heatingRate = this.ionSpecies === 'Sr88' ? 0.05 : this.ionSpecies === 'Ba138' ? 0.02 : 0.1;
      const coolingRate = 10.0;
      if (this.defenseL3) {
        // Contour 3 active laser cooling reset with cooling rate
        const tauB = (1.0 / coolingRate) * Math.log(Math.max(1.01, (this.phononNumber - heatingRate / coolingRate) / (0.05 - heatingRate / coolingRate)));
        this.phononNumber = Math.max(0.05, this.phononNumber * Math.exp(-coolingRate * Math.max(0.05, tauB)));
      } else {
        // Thermal accumulation
        this.phononNumber = Math.min(5.0, this.phononNumber + heatingRate * 0.1);
      }
    } else {
      this.phononNumber = 0.0;
    }

    // Build Qubit nodes
    for (let i = 0; i < numQubits; i++) {
      let x = 0;
      let y = 0;
      if (isIon) {
        x = (i - (numQubits - 1) / 2) * 1.8;
        y = 0;
      } else if (isTm) {
        const r = Math.floor(i / 10);
        const c = i % 10;
        x = (c - 4.5) * 1.5;
        y = (r - 4.5) * 1.5;
      } else {
        // Heavy-hex grid layout
        const cols = 14;
        const r = Math.floor(i / cols);
        const c = i % cols;
        x = (c - cols / 2) * 1.2;
        y = (r - 5) * 1.2;
      }

      // Assign tenants based on schedulingAlgo and tenantCount
      let tenant = 0;
      if (this.schedulingAlgo === 'spectral') {
        const partitionSize = Math.ceil(numQubits / Math.max(1, this.tenantCount));
        tenant = Math.min(this.tenantCount - 1, Math.floor(i / partitionSize));
      } else {
        tenant = i % Math.max(1, this.tenantCount);
      }

      qubits.push({
        id: i,
        x,
        y,
        t1: this.normalRandom(baseT1, baseT1 * 0.02),
        t2: this.normalRandom(baseT2, baseT2 * 0.02),
        err_1q: isIon ? 1e-4 : isTm ? 1e-4 : 5e-4,
        err_readout: isIon ? 1e-3 : isTm ? 5e-3 : 1e-2,
        active_tenant: tenant,
        gate_count: 50 + Math.floor(this.pseudoRandom() * 400),
      });
    }

    // Build Couplers
    if (isIon) {
      // All-to-all motional coupling J_ij ~ J0 / |i-j|^3
      for (let i = 0; i < numQubits; i++) {
        for (let j = i + 1; j < numQubits; j++) {
          const dist = Math.abs(i - j);
          let zz = 2.0 / Math.pow(dist, 3);
          if (this.defenseL1 && qubits[i].active_tenant !== qubits[j].active_tenant) {
            // Contour 1 Spectral detuning
            zz *= 0.01;
          }
          couplers.push({ q1: i, q2: j, active: true, zz_crosstalk: Math.max(0.001, zz) });
        }
      }
    } else if (isTm) {
      // 2D grid nearest neighbor
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          const idx = r * 10 + c;
          if (c + 1 < 10) couplers.push({ q1: idx, q2: idx + 1, active: true, zz_crosstalk: 0.05 });
          if (r + 1 < 10) couplers.push({ q1: idx, q2: idx + 10, active: true, zz_crosstalk: 0.05 });
        }
      }
    } else {
      // Heavy-hex nearest neighbors
      for (let i = 0; i < numQubits - 1; i++) {
        if (i % 2 === 0 || i % 3 === 0) {
          let zz = isHeron ? 1.1 : 4.8;
          if (this.defenseL1 && isHeron) zz *= 0.15; // Tunable couplers enable L1 detuning
          couplers.push({ q1: i, q2: i + 1, active: true, zz_crosstalk: zz });
        }
      }
    }

    // 2. Physical Threat Vector Simulation & Fidelity Calculation
    let isolatedFidelity = isIon ? 0.995 : isTm ? 0.999 : 0.94;
    let fidelityDrop = 0.0;
    let crosstalkPhaseError = 0.0;
    let rowhammerDegrad = 0.0;
    let primeProbeExcitation = 0.0;
    let rfDecodeAccuracy = 0.0;
    let rfMutualInfo = 0.0;

    if (this.activeScenario === 'crosstalk') {
      const baseDrop = (this.crosstalkIntensity / 100.0) * (isIon ? 0.35 : isTm ? 0.05 : isHeron ? 0.25 : 0.45);
      fidelityDrop = this.defenseL1 ? baseDrop * (isIon ? 0.01 : isHeron ? 0.15 : 0.85) : baseDrop;
      crosstalkPhaseError = (this.crosstalkIntensity / 100.0) * Math.PI * (this.defenseL1 ? 0.05 : 0.45);
    } else if (this.activeScenario === 'rowhammer') {
      const load = this.rowhammerIterations / 1000.0;
      rowhammerDegrad = isTm ? 0.0 : (this.defenseL1 ? load * 0.04 : load * 0.28);
      fidelityDrop = rowhammerDegrad * 0.75;
    } else if (this.activeScenario === 'prime_probe') {
      if (isIon) {
        primeProbeExcitation = this.defenseL3 ? 0.02 : 1.45 * Math.exp(-this.primeDelayUs / 300.0);
        fidelityDrop = primeProbeExcitation * 0.22;
      } else {
        primeProbeExcitation = this.defenseL3 ? 0.01 : 0.15 * Math.exp(-this.primeDelayUs / 150.0);
        fidelityDrop = primeProbeExcitation * 0.35;
      }
    } else if (this.activeScenario === 'rf_leakage') {
      const snrFactor = Math.min(2.0, Math.max(0.2, Math.pow(10, this.snrDb / 20.0)));
      if (isIon) {
        rfDecodeAccuracy = this.defenseL1 ? 50.2 + this.pseudoRandom() : Math.min(99.0, (88.5 + this.pseudoRandom() * 4.0) * snrFactor);
        rfMutualInfo = this.defenseL1 ? 0.02 : Math.min(1.0, 0.78 * snrFactor);
        fidelityDrop = this.defenseL1 ? 0.005 : 0.12 * snrFactor;
      } else {
        rfDecodeAccuracy = 50.0;
        rfMutualInfo = 0.0;
        fidelityDrop = 0.001;
      }
    } else if (this.activeScenario === 'environment') {
      const tempDelta = Math.max(0, (this.envTemperatureMk - 15.0) / 100.0);
      fidelityDrop = isTm ? 0.01 : isIon ? tempDelta * 0.05 : tempDelta * 0.35;
    }

    const currentFidelity = Math.max(0.40, isolatedFidelity - fidelityDrop);

    // 3. Contour Metrics
    const anomalyScoreL2 = this.defenseL2 ? -0.25 - 0.1 * this.pseudoRandom() : -0.85 - 0.1 * this.pseudoRandom();
    const anomalyFlaggedL2 = anomalyScoreL2 < -0.8;

    // SPC Z-Score (Contour 4)
    const rawSignal = fidelityDrop * 10.0 + (this.pseudoRandom() - 0.5) * 0.5;
    this.historyZ.push(rawSignal);
    if (this.historyZ.length > 60) this.historyZ.shift();

    const meanZ = this.historyZ.reduce((a, b) => a + b, 0) / this.historyZ.length;
    const stdZ = Math.max(0.05, Math.sqrt(this.historyZ.reduce((a, b) => a + Math.pow(b - meanZ, 2), 0) / this.historyZ.length));
    const zScore = Math.abs((rawSignal - meanZ) / stdZ);

    let threatLevel = 0;
    if (zScore >= 5.25) threatLevel = 3;
    else if (zScore >= 3.5) threatLevel = 2;
    else if (zScore >= 2.5) threatLevel = 1;

    // Economics
    const baseHourVal = this.hourlyCost * (this.utilization / 100.0);
    const hourDelta = 0.1 / 3600.0;
    const savingsRate = this.defenseL1 ? baseHourVal * 1.8 : 0.0;
    const costsRate = (this.defenseL1 ? 8.0 : 0.0) + (this.defenseL2 ? 4.0 : 0.0) + (this.defenseL3 ? 12.0 : 0.0) + (this.defenseL4 ? 5.0 : 0.0);

    this.cumulativeSavings += savingsRate * hourDelta * 100;
    this.cumulativeCosts += costsRate * hourDelta * 100;

    // Isolation Index
    let isolationIndex = isIon
      ? (this.defenseL1 ? 99.0 : 52.4)
      : isTm
      ? 100.0
      : isHeron
      ? (this.defenseL1 ? 85.0 : 44.8)
      : isEagle
      ? (this.defenseL1 ? 62.0 : 39.4)
      : 39.4;

    const qpuState: QpuState = {
      layout_type: this.qpuType,
      platform_display_name: isIon
        ? `TrappedIonPaulTrap (${this.ionSpecies}, N=${numQubits})`
        : isTm
        ? 'TmOpticalLattice (100 Tm atoms, 2D)'
        : isHeron
        ? 'IBM Heron (133Q Heavy-Hex Tunable)'
        : 'IBM Eagle (127Q Heavy-Hex Fixed)',
      qubits,
      couplers,
      heating_rate: isIon ? 0.1 : 0.0,
      phonon_number: this.phononNumber,
      rf_leakage_db: isIon ? (this.defenseL1 ? -85.0 : -60.0) : -90.0,
      temperature_k: isIon ? 1e-6 : isTm ? 300.0 : 0.015,
      n_vibrational_modes: isIon ? numQubits : 0,
    };

    return {
      time_step: this.timeStep,
      fidelity: Math.round(currentFidelity * 10000) / 10000,
      fidelity_drop: Math.round(fidelityDrop * 10000) / 100,
      average_t1: Math.round(baseT1 * 10) / 10,
      average_t2: Math.round(baseT2 * 10) / 10,
      anomaly_score_l2: Math.round(anomalyScoreL2 * 100) / 100,
      anomaly_flagged_l2: anomalyFlaggedL2,
      circuit_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      autoencoder_loss_l4: this.defenseL4 ? 0.008 + this.pseudoRandom() * 0.004 : 0.045 + this.pseudoRandom() * 0.02,
      anomaly_flagged_l4: zScore >= 3.5,
      monitor_z_score: Math.round(zScore * 100) / 100,
      monitor_threat_level: threatLevel,
      buffer_delay_us: this.defenseL3 ? (isIon ? 420.0 : 250.0) : 0.0,
      buffer_overhead_pct: this.defenseL3 ? 3.4 : 0.0,
      cooling_buffer_tau_s: this.defenseL3 ? (isIon ? 0.69 : 0.0) : 0.0,
      cooling_valid: true,
      platform_type: this.qpuType,
      phonon_number: Math.round(this.phononNumber * 1000) / 1000,
      heating_rate: isIon ? 0.1 : 0.0,
      rf_leakage_db: isIon ? (this.defenseL1 ? -85.0 : -60.0) : -90.0,
      lms_suppression_db: this.defenseL1 ? 25.4 : 0.0,
      cumulative_savings: Math.round(this.cumulativeSavings * 100) / 100,
      cumulative_costs: Math.round(this.cumulativeCosts * 100) / 100,
      cumulative_wasted_cash: Math.round((this.cumulativeSavings * 0.15) * 100) / 100,
      net_benefit: Math.round((this.cumulativeSavings - this.cumulativeCosts) * 100) / 100,
      isolation_index: isolationIndex,
      qpu: qpuState,
      active_scenario_metrics: {
        crosstalk_hops: 1,
        crosstalk_phase_error: Math.round(crosstalkPhaseError * 1000) / 1000,
        rowhammer_degradation: Math.round(rowhammerDegrad * 1000) / 10,
        prime_probe_excitation: Math.round(primeProbeExcitation * 1000) / 1000,
        prime_probe_phonon_nbar: Math.round(this.phononNumber * 1000) / 1000,
        rf_decode_accuracy: Math.round(rfDecodeAccuracy * 10) / 10,
        rf_mutual_info_bits: Math.round(rfMutualInfo * 100) / 100,
      },
    };
  }
}

