/**
 * TurtleShell-RT: Client-Side In-Browser Simulation Engine
 * Enables standalone zero-backend execution on Cloudflare Pages (turtleshell.iqumnov.com).
 * Accurately models the physical QPU layouts, attack scenarios, and 4 protection contours in pure TypeScript.
 *
 * Author: Matvei Igumnov
 * License: MIT
 */

import { SimMetrics, QpuState, QubitState, CouplerState } from './useSimStore';

interface BaseQubit {
  id: number;
  x: number;
  y: number;
  t1Base: number;
  t2Base: number;
  err1qBase: number;
  errReadoutBase: number;
}

interface BaseCoupler {
  q1: number;
  q2: number;
  zzBase: number;
}

interface CachedTopology {
  key: string;
  numQubits: number;
  baseT1: number;
  baseT2: number;
  residualFloor: number;
  heatingRate: number;
  coolingRate: number;
  rfBaseDb: number;
  baseQubits: BaseQubit[];
  baseCouplers: BaseCoupler[];
}

function seededNext(state: { s: number }): number {
  state.s = (state.s * 9301 + 49297) % 233280;
  return state.s / 233280;
}

function seededNormal(state: { s: number }, mean: number, std: number): number {
  const u = Math.max(1e-6, seededNext(state));
  const v = Math.max(1e-6, seededNext(state));
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * std;
}

function fiedlerOrder(nodes: number[], couplers: BaseCoupler[]): number[] {
  const m = nodes.length;
  if (m <= 2) return [...nodes];

  const idxOf = new Map<number, number>();
  nodes.forEach((id, i) => idxOf.set(id, i));

  const A = new Float64Array(m * m);
  let hasEdge = false;
  for (const c of couplers) {
    const iu = idxOf.get(c.q1);
    const jv = idxOf.get(c.q2);
    if (iu === undefined || jv === undefined || iu === jv) continue;
    const w = Math.max(1e-3, Math.abs(c.zzBase));
    A[iu * m + jv] -= w;
    A[jv * m + iu] -= w;
    A[iu * m + iu] += w;
    A[jv * m + jv] += w;
    hasEdge = true;
  }
  if (!hasEdge) return [...nodes];

  const V = new Float64Array(m * m);
  for (let i = 0; i < m; i++) V[i * m + i] = 1.0;

  // Cyclic Jacobi solver on symmetric Laplacian L = D - W (converges cleanly for m <= 133)
  const maxSweeps = 16;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxOff = 0.0;
    for (let p = 0; p < m - 1; p++) {
      for (let q = p + 1; q < m; q++) {
        const v = Math.abs(A[p * m + q]);
        if (v > maxOff) maxOff = v;
      }
    }
    if (maxOff <= 1e-8) break;

    const thresh = sweep < 3 ? (0.2 * maxOff) : 1e-10;
    for (let p = 0; p < m - 1; p++) {
      for (let q = p + 1; q < m; q++) {
        const apq = A[p * m + q];
        if (Math.abs(apq) <= thresh) continue;

        const app = A[p * m + p];
        const aqq = A[q * m + q];
        const tau = (aqq - app) / (2.0 * apq);
        const t =
          tau >= 0
            ? 1.0 / (tau + Math.sqrt(1.0 + tau * tau))
            : -1.0 / (-tau + Math.sqrt(1.0 + tau * tau));
        const c = 1.0 / Math.sqrt(1.0 + t * t);
        const s = t * c;
        const h = s / (1.0 + c);

        A[p * m + p] = app - t * apq;
        A[q * m + q] = aqq + t * apq;
        A[p * m + q] = 0.0;
        A[q * m + p] = 0.0;

        for (let r = 0; r < m; r++) {
          if (r !== p && r !== q) {
            const arp = A[r * m + p];
            const arq = A[r * m + q];
            const nrp = arp - s * (arq + h * arp);
            const nrq = arq + s * (arp - h * arq);
            A[r * m + p] = nrp;
            A[p * m + r] = nrp;
            A[r * m + q] = nrq;
            A[q * m + r] = nrq;
          }
          const vrp = V[r * m + p];
          const vrq = V[r * m + q];
          V[r * m + p] = vrp - s * (vrq + h * vrp);
          V[r * m + q] = vrq + s * (vrp - h * vrq);
        }
      }
    }
  }

  const eigOrder = Array.from({ length: m }, (_, i) => i).sort(
    (a, b) => A[a * m + a] - A[b * m + b]
  );
  const fiedlerCol = eigOrder[1] ?? eigOrder[0];

  const nodeOrder = Array.from({ length: m }, (_, i) => i).sort((a, b) => {
    const diff = V[a * m + fiedlerCol] - V[b * m + fiedlerCol];
    return Math.abs(diff) > 1e-12 ? diff : a - b;
  });
  return nodeOrder.map((idx) => nodes[idx]);
}

function spectralBisectDemands(
  nodePool: number[],
  couplers: BaseCoupler[],
  demands: Array<[number, number]>,
  allocOut: Array<number | null>
) {
  if (demands.length === 0) return;
  if (demands.length === 1) {
    const [tid, cap] = demands[0];
    for (let i = 0; i < cap && i < nodePool.length; i++) {
      allocOut[nodePool[i]] = tid;
    }
    return;
  }

  const ordered = fiedlerOrder(nodePool, couplers);
  const mid = Math.floor(demands.length / 2);
  const leftDemands = demands.slice(0, mid);
  const rightDemands = demands.slice(mid);
  const leftCount = Math.min(
    ordered.length,
    leftDemands.reduce((acc, [, cap]) => acc + cap, 0)
  );

  spectralBisectDemands(ordered.slice(0, leftCount), couplers, leftDemands, allocOut);
  spectralBisectDemands(ordered.slice(leftCount), couplers, rightDemands, allocOut);
}

export class ClientSimulationEngine {
  private timeStep: number = 0;
  private phononNumber: number = 0.05;
  private cumulativeSavings: number = 0;
  private cumulativeCosts: number = 0;
  private cumulativeWastedCash: number = 0;
  private nominalHistoryZ: number[] = [];
  private rngSeed: number = 42;

  private cachedTopology: CachedTopology | null = null;
  private cachedAllocKey: string | null = null;
  private cachedTenantAssign: Array<number | null> = [];

  // Configuration (aligned with backend SimulationState defaults)
  private qpuType: string = 'eagle';
  private ionSpecies: string = 'Ca40';
  private nIons: number = 20;
  private tenantCount: number = 3;
  private schedulingAlgo: string = 'random';
  private activeScenario: string = 'crosstalk';
  private crosstalkIntensity: number = 50.0;
  private gateFrequencyHz: number = 1e6;
  private rowhammerIterations: number = 600;
  private primeDelayUs: number = 100.0;
  private envTemperatureMk: number = 15.0;
  private snrDb: number = -10.0;

  private defenseL1: boolean = false;
  private defenseL2: boolean = false;
  private defenseL3: boolean = false;
  private defenseL4: boolean = false;
  private hourlyCost: number = 1200.0;
  private utilization: number = 65.0;
  private scDelayUs: number = 750.0;
  private scOverheadPct: number = 12.3;

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
    this.scDelayUs = 750.0;
    this.scOverheadPct = 12.3;
    this.nominalHistoryZ = [];
    this.cachedAllocKey = null;
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

  private getOrBuildTopology(): CachedTopology {
    const isIon = this.qpuType.includes('trapped_ion');
    const isSr = this.qpuType.includes('sr_optical');
    const isHeron = this.qpuType.includes('heron');
    const topoKey = `${this.qpuType}:${isIon ? `${this.ionSpecies}:${this.nIons}` : 'fixed'}`;
    if (this.cachedTopology && this.cachedTopology.key === topoKey) {
      return this.cachedTopology;
    }

    const baseT1 = isIon ? 1.0e6 : isSr ? 6.0e7 : isHeron ? 172.0 : 148.0;
    const baseT2 = isIon ? 5.0e5 : isSr ? 3.0e7 : isHeron ? 115.0 : 96.0;
    const speciesMap: Record<string, { heating: number; cooling: number; rfDb: number }> = {
      Ca40: { heating: 0.1, cooling: 8.0, rfDb: -60.0 },
      Sr88: { heating: 0.05, cooling: 10.0, rfDb: -62.0 },
      Ba138: { heating: 0.02, cooling: 12.0, rfDb: -58.0 },
      Yb171: { heating: 0.08, cooling: 9.0, rfDb: -61.0 },
    };
    const sp = speciesMap[this.ionSpecies] ?? speciesMap.Ca40;
    const heatingRate = isIon ? sp.heating : 0.0;
    const coolingRate = isIon ? sp.cooling : 0.0;
    const rfBaseDb = isIon ? sp.rfDb : isSr ? -80.0 : -50.0;
    const residualFloor = isIon ? 0.01 : isSr ? 0.0 : isHeron ? 0.15 : 1.0;

    // Deterministic per-platform fabrication calibration seeded cleanly (matching VirtualQPU)
    const fabRng = { s: 42 };
    const baseQubits: BaseQubit[] = [];
    const baseCouplers: BaseCoupler[] = [];
    const coordToIdx = new Map<string, number>();

    let numQubits = isIon ? this.nIons : isSr ? 100 : isHeron ? 133 : 127;

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
        const t1 = Math.max(1.0, seededNormal(fabRng, baseT1, 12.0));
        const t2 = Math.max(1.0, Math.min(2.0 * t1, seededNormal(fabRng, baseT2, 8.0)));
        baseQubits.push({
          id: i,
          x: c * 1.5,
          y: r * 1.0,
          t1Base: t1,
          t2Base: t2,
          err1qBase: 1e-3,
          errReadoutBase: 2e-2,
        });
      }

      const zzMean = isHeron ? 1.1 : 4.8;
      const zzStd = isHeron ? 0.15 : 0.2;
      for (const [key, u] of coordToIdx.entries()) {
        const [cs, rs] = key.split(',').map(Number);
        const down = coordToIdx.get(`${cs},${rs + 1}`);
        if (down !== undefined) {
          baseCouplers.push({ q1: u, q2: down, zzBase: Math.max(0.01, seededNormal(fabRng, zzMean, zzStd)) });
        }
        if (cs % 2 === 1) {
          const left = coordToIdx.get(`${cs - 1},${rs}`);
          if (left !== undefined) {
            baseCouplers.push({ q1: u, q2: left, zzBase: Math.max(0.01, seededNormal(fabRng, zzMean, zzStd)) });
          }
          const right = coordToIdx.get(`${cs + 1},${rs}`);
          if (right !== undefined) {
            baseCouplers.push({ q1: u, q2: right, zzBase: Math.max(0.01, seededNormal(fabRng, zzMean, zzStd)) });
          }
        }
      }
    } else {
      const fabRelStd = isIon ? 0.02 : 0.01;
      for (let i = 0; i < numQubits; i++) {
        const x = isIon ? (i - (numQubits - 1) / 2) * 1.5 : (i % 10) * 4.0;
        const y = isIon ? 0.0 : Math.floor(i / 10) * 4.0;
        const t1 = Math.max(1.0, seededNormal(fabRng, baseT1, baseT1 * fabRelStd));
        const t2 = Math.max(1.0, Math.min(2.0 * t1, seededNormal(fabRng, baseT2, baseT2 * fabRelStd)));
        baseQubits.push({
          id: i,
          x,
          y,
          t1Base: t1,
          t2Base: t2,
          err1qBase: 1e-4,
          errReadoutBase: isIon ? 1e-3 : 5e-3,
        });
      }

      if (isIon) {
        for (let i = 0; i < numQubits; i++) {
          for (let j = i + 1; j < numQubits; j++) {
            const dist = Math.abs(i - j);
            const rawZz = 2.0 / Math.pow(dist, 3);
            const zz = Math.max(0.001, seededNormal(fabRng, rawZz, rawZz * 0.05));
            baseCouplers.push({ q1: i, q2: j, zzBase: zz });
          }
        }
      } else {
        for (let r = 0; r < 10; r++) {
          for (let c = 0; c < 10; c++) {
            const idx = r * 10 + c;
            if (c + 1 < 10) {
              baseCouplers.push({ q1: idx, q2: idx + 1, zzBase: Math.max(0.001, seededNormal(fabRng, 0.05, 0.005)) });
            }
            if (r + 1 < 10) {
              baseCouplers.push({ q1: idx, q2: idx + 10, zzBase: Math.max(0.001, seededNormal(fabRng, 0.05, 0.005)) });
            }
          }
        }
      }
    }

    this.cachedTopology = {
      key: topoKey,
      numQubits,
      baseT1,
      baseT2,
      residualFloor,
      heatingRate,
      coolingRate,
      rfBaseDb,
      baseQubits,
      baseCouplers,
    };
    this.cachedAllocKey = null;
    return this.cachedTopology;
  }

  private getTenantAssignments(topo: CachedTopology, effectiveAlgo: string, tenantN: number): Array<number | null> {
    const key = `${topo.key}:${tenantN}:${effectiveAlgo}`;
    if (this.cachedAllocKey === key && this.cachedTenantAssign.length === topo.numQubits) {
      return this.cachedTenantAssign;
    }

    const totalQ = topo.numQubits;
    const assign: Array<number | null> = new Array(totalQ).fill(null);

    if (effectiveAlgo === 'tdm') {
      for (let i = 0; i < totalQ; i++) assign[i] = 0;
    } else {
      const demands: Array<[number, number]> = [];
      if (tenantN > totalQ) {
        for (let tid = 0; tid < tenantN; tid++) {
          demands.push([tid, tid < totalQ ? 1 : 0]);
        }
      } else {
        const baseShare = Math.floor(totalQ / tenantN);
        const rem = totalQ % tenantN;
        for (let tid = 0; tid < tenantN; tid++) {
          demands.push([tid, Math.max(1, baseShare + (tid < rem ? 1 : 0))]);
        }
      }

      if (effectiveAlgo === 'spectral') {
        const allNodes = topo.baseQubits.map((q) => q.id);
        const orderedDemands = [...demands].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] - b[0]));
        spectralBisectDemands(allNodes, topo.baseCouplers, orderedDemands, assign);
      } else if (effectiveAlgo === 'static') {
        let cursor = 0;
        for (const [tid, cap] of demands) {
          for (let k = 0; k < cap && cursor < totalQ; k++) {
            assign[cursor++] = tid;
          }
        }
      } else {
        // Seeded deterministic Fisher-Yates shuffle matching backend _schedule_random(seed=0)
        const pool = topo.baseQubits.map((q) => q.id);
        const shufRng = { s: 137 };
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(seededNext(shufRng) * (i + 1));
          const tmp = pool[i];
          pool[i] = pool[j];
          pool[j] = tmp;
        }
        let cursor = 0;
        for (const [tid, cap] of demands) {
          for (let k = 0; k < cap && cursor < pool.length; k++) {
            assign[pool[cursor++]] = tid;
          }
        }
      }
    }

    this.cachedAllocKey = key;
    this.cachedTenantAssign = assign;
    return assign;
  }

  public tick(): SimMetrics {
    this.timeStep += 1;
    const isIon = this.qpuType.includes('trapped_ion');
    const isSr = this.qpuType.includes('sr_optical');
    const isHeron = this.qpuType.includes('heron');

    const topo = this.getOrBuildTopology();
    const { numQubits, baseT1, baseT2, residualFloor, heatingRate, coolingRate: ionCoolingRate, rfBaseDb } = topo;

    if (!isIon) {
      this.phononNumber = 0.0;
    } else if (!this.defenseL3) {
      this.phononNumber = Math.min(5.0, this.phononNumber + heatingRate * 0.1);
    }

    const effectiveAlgo =
      this.defenseL1 && this.schedulingAlgo !== 'tdm' && this.schedulingAlgo !== 'spectral'
        ? 'spectral'
        : this.schedulingAlgo;
    const tenantN = Math.max(1, this.tenantCount);
    const freqNorm = Math.min(1.0, Math.max(0.0, (this.gateFrequencyHz - 1e5) / (1e7 - 1e5)));
    const gateCountVal = Math.max(2, Math.min(18, Math.floor(2 + 16 * freqNorm)));

    const tenantAssign = this.getTenantAssignments(topo, effectiveAlgo, tenantN);

    const qubits: QubitState[] = topo.baseQubits.map((bq, i) => ({
      id: bq.id,
      x: bq.x,
      y: bq.y,
      t1: bq.t1Base,
      t2: bq.t2Base,
      err_1q: bq.err1qBase,
      err_readout: bq.errReadoutBase,
      active_tenant: tenantAssign[i],
      gate_count: tenantAssign[i] !== null ? gateCountVal : 0,
    }));

    const couplers: CouplerState[] = topo.baseCouplers.map((bc) => {
      const tu = tenantAssign[bc.q1];
      const tv = tenantAssign[bc.q2];
      const detune = this.defenseL1 && residualFloor < 1.0 && tu !== null && tv !== null && tu !== tv;
      return {
        q1: bc.q1,
        q2: bc.q2,
        active: !detune,
        zz_crosstalk: detune ? Math.round(bc.zzBase * residualFloor * 1e6) / 1e6 : Math.max(0.001, bc.zzBase),
      };
    });

    // Multi-source BFS distances from Tenant 1 (Aggressor) across active / nonzero-detuned graph
    const t0Qubits = qubits.filter((q) => q.active_tenant === 0).map((q) => q.id);
    const t1Qubits = qubits.filter((q) => q.active_tenant === 1).map((q) => q.id);
    const t0Set = new Set(t0Qubits);
    const t1Set = new Set(t1Qubits);

    const bfsDistFromT1 = new Map<number, number>();
    if (!isIon && t1Qubits.length > 0) {
      const adj = new Map<number, number[]>();
      for (const c of couplers) {
        if (c.active || c.zz_crosstalk > 0) {
          if (!adj.has(c.q1)) adj.set(c.q1, []);
          if (!adj.has(c.q2)) adj.set(c.q2, []);
          adj.get(c.q1)!.push(c.q2);
          adj.get(c.q2)!.push(c.q1);
        }
      }
      const queue: number[] = [];
      for (const src of t1Qubits) {
        bfsDistFromT1.set(src, 0);
        queue.push(src);
      }
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        const dNext = bfsDistFromT1.get(cur)! + 1;
        for (const nb of adj.get(cur) ?? []) {
          if (!bfsDistFromT1.has(nb)) {
            bfsDistFromT1.set(nb, dNext);
            queue.push(nb);
          }
        }
      }
    }

    let minPairHops = -1;
    if (t0Qubits.length > 0 && t1Qubits.length > 0) {
      if (isIon) {
        minPairHops = numQubits;
        for (const q0 of t0Qubits) {
          for (const q1 of t1Qubits) {
            minPairHops = Math.min(minPairHops, Math.abs(q0 - q1));
          }
        }
      } else {
        let best = 99;
        for (const q0 of t0Qubits) {
          const d = bfsDistFromT1.get(q0);
          if (d !== undefined && d < best) best = d;
        }
        if (best < 99) minPairHops = best;
      }
    }

    // 2. Apply physical scenario models matching SimulationScenarios (scenarios.py)
    const isolatedFidelity = isIon ? 0.995 : isSr ? 0.999 : 0.94;
    let crosstalkPhaseError = 0.0;
    let rowhammerDegradPct = 0.0;
    let primeProbeExcitation = 0.0;
    let rfDecodeAccuracy = 0.0;
    let rfMutualInfo = 0.0;
    let rfAttackSeverity = 0.0;

    if (this.activeScenario === 'rowhammer' && t0Qubits.length > 0 && t1Qubits.length > 0) {
      let totalDegrad = 0.0;
      const load = this.rowhammerIterations / 1000.0;
      for (const vq of t0Qubits) {
        let minDist = 99;
        if (isIon) {
          for (const aq of t1Qubits) {
            minDist = Math.min(minDist, Math.abs(vq - aq));
          }
        } else {
          minDist = bfsDistFromT1.get(vq) ?? 99;
        }
        if (minDist < 5) {
          const distFactor = 1.0 / Math.pow(Math.max(1, minDist), 2);
          const degrad = isSr
            ? 0.0
            : isIon
            ? Math.min(0.15, 0.08 * load * distFactor)
            : isHeron
            ? Math.min(0.4, 0.35 * load * distFactor * 0.6)
            : Math.min(0.4, 0.35 * load * distFactor);
          const q = qubits[vq];
          q.t1 = topo.baseQubits[vq].t1Base * (1.0 - degrad);
          q.t2 = topo.baseQubits[vq].t2Base * (1.0 - degrad);
          q.err_1q = topo.baseQubits[vq].err1qBase * (1.0 + 3.0 * degrad);
          totalDegrad += degrad;
        }
      }
      rowhammerDegradPct = (totalDegrad / t0Qubits.length) * 100.0;
    } else if (this.activeScenario === 'environment') {
      if (isIon) {
        const deltaTempK = Math.max(0.0, this.envTemperatureMk - 15.0) * 1e-3;
        if (deltaTempK > 0) {
          const targetPhonon = Math.min(5.0, 0.05 + deltaTempK * 20.0);
          this.phononNumber = Math.max(this.phononNumber, targetPhonon);
          const degrad = Math.min(0.35, deltaTempK * 5.0);
          for (let i = 0; i < qubits.length; i++) {
            qubits[i].t1 = topo.baseQubits[i].t1Base * (1.0 - degrad);
            qubits[i].t2 = topo.baseQubits[i].t2Base * (1.0 - degrad);
          }
        }
      } else if (!isSr) {
        const tempDeltaMk = Math.max(0.0, this.envTemperatureMk - 15.0);
        const coherenceFactor = Math.exp(-tempDeltaMk / 8.0);
        for (let i = 0; i < qubits.length; i++) {
          qubits[i].t1 = topo.baseQubits[i].t1Base * coherenceFactor;
          qubits[i].t2 = topo.baseQubits[i].t2Base * coherenceFactor;
          qubits[i].err_1q = topo.baseQubits[i].err1qBase * (1.0 + (1.0 - coherenceFactor) * 5.0);
        }
      }
    }

    let sumT1 = 0.0;
    let sumT2 = 0.0;
    let victimT1Sum = 0.0;
    let victimT2Sum = 0.0;
    let victimCount = 0;
    for (const q of qubits) {
      sumT1 += q.t1;
      sumT2 += q.t2;
      if (q.active_tenant === 0) {
        victimT1Sum += q.t1;
        victimT2Sum += q.t2;
        victimCount += 1;
      }
    }
    const avgT1 = qubits.length > 0 ? sumT1 / qubits.length : baseT1;
    const avgT2 = qubits.length > 0 ? sumT2 / qubits.length : baseT2;
    const victimAvgT1 = victimCount > 0 ? victimT1Sum / victimCount : baseT1;
    const victimAvgT2 = victimCount > 0 ? victimT2Sum / victimCount : baseT2;

    // RF leakage + Contour 1 LMS filter (+6 dB gate modulation during RF leakage scenario)
    const rawRfLeakageDb =
      this.activeScenario === 'rf_leakage' && isIon && t0Qubits.length > 0
        ? rfBaseDb + 6.0
        : rfBaseDb;
    const lmsSuppressionDb =
      this.defenseL1 && isIon && this.activeScenario === 'rf_leakage'
        ? Math.round((24.6 + this.pseudoRandom() * 1.4) * 10) / 10
        : 0.0;
    const effectiveRfLeakageDb =
      this.activeScenario === 'rf_leakage' && isIon
        ? Math.round((rawRfLeakageDb - lmsSuppressionDb) * 10) / 10
        : rfBaseDb;

    let rawFidelity = isolatedFidelity;
    if (this.activeScenario === 'crosstalk' && minPairHops >= 0) {
      const attenFactor = this.defenseL1 && residualFloor < 1.0 ? residualFloor : 1.0;
      if (attenFactor > 0) {
        const boundaryZz: number[] = [];
        const incidentZz: number[] = [];
        for (const bc of topo.baseCouplers) {
          const w = Math.abs(bc.zzBase);
          if ((t0Set.has(bc.q1) && t1Set.has(bc.q2)) || (t0Set.has(bc.q2) && t1Set.has(bc.q1))) {
            boundaryZz.push(w);
          }
          if (t0Set.has(bc.q1) || t0Set.has(bc.q2) || t1Set.has(bc.q1) || t1Set.has(bc.q2)) {
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
        const effZzHz = baseZz * attenFactor * Math.pow(0.65, Math.max(0, minPairHops - 1)) * 1e3;
        crosstalkPhaseError = Math.min(Math.PI, 2 * Math.PI * effZzHz * durationS);
        const drop = Math.min(0.35, 0.36 * (1.0 - Math.exp(-0.25 * Math.pow(crosstalkPhaseError, 2))));
        rawFidelity = Math.max(0.1, isolatedFidelity - drop);
      }
    } else if (this.activeScenario === 'rowhammer') {
      rawFidelity = Math.max(0.1, isolatedFidelity - 0.35 * (rowhammerDegradPct / 100.0));
    } else if (this.activeScenario === 'prime_probe' && t0Qubits.length > 0) {
      const delayVal = Math.max(0.0, this.primeDelayUs);
      if (isIon) {
        const nPrime = 2.0 + heatingRate * 0.1;
        primeProbeExcitation = nPrime * Math.exp(-delayVal / 300.0);
        rawFidelity = Math.min(isolatedFidelity, Math.max(0.1, 0.995 / (1.0 + primeProbeExcitation * 0.3)));
      } else if (isSr) {
        primeProbeExcitation = 0.05 * Math.exp(-delayVal / 1000.0);
        rawFidelity = Math.min(isolatedFidelity, Math.max(0.1, 0.999 - primeProbeExcitation * 0.05));
      } else {
        primeProbeExcitation = 0.6 * Math.exp(-delayVal / Math.max(0.01, victimAvgT1));
        rawFidelity = Math.min(isolatedFidelity, Math.max(0.1, 0.94 - primeProbeExcitation));
      }
    } else if (this.activeScenario === 'rf_leakage') {
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
    } else if (this.activeScenario === 'environment' && victimCount > 0) {
      const excessRate = Math.max(0.0, 1.0 / Math.max(0.01, victimAvgT2) - 1.0 / Math.max(0.01, baseT2));
      const circuitTimeUs = isIon ? 200000.0 : 0.5;
      rawFidelity = Math.max(0.01, isolatedFidelity * Math.exp(-circuitTimeUs * excessRate));
    }

    // Dynamic Isolation Index: 100 * (1 - J_post / J_random) matching VirtualQPU.compute_isolation_index
    const activePoolCount = qubits.filter((q) => q.active_tenant !== null).length;
    const tenantCounts = new Map<number, number>();
    for (const q of qubits) {
      if (q.active_tenant !== null) {
        tenantCounts.set(q.active_tenant, (tenantCounts.get(q.active_tenant) ?? 0) + 1);
      }
    }
    let activePoolZz = 0.0;
    let crossZzPost = 0.0;
    for (const bc of topo.baseCouplers) {
      const t1 = tenantAssign[bc.q1];
      const t2 = tenantAssign[bc.q2];
      if (t1 !== null && t2 !== null) {
        const baseW = Math.abs(bc.zzBase);
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

    // 3. Contour 2 & Contour 3 & Contour 4 evaluation (aligned to main.py & defense.py)
    const isCompilerTamper = this.crosstalkIntensity > 75 && this.activeScenario === 'crosstalk';
    const anomalyFlaggedL2 = isCompilerTamper;
    const anomalyScoreL2 = isCompilerTamper
      ? 0.05 + 0.02 * this.pseudoRandom()
      : 0.68 + 0.03 * this.pseudoRandom();

    // Contour 3 cooling step (matching main.py:412-429 & defense.py:211-226)
    let computedTauB = 0.0;
    let ionCoolingValid = true;
    if (this.defenseL3 && !isSr) {
      if (isIon && ionCoolingRate > 0) {
        const nSs = heatingRate / ionCoolingRate;
        this.phononNumber = Math.max(nSs, nSs + (this.phononNumber - nSs) * Math.exp(-ionCoolingRate * 0.1));
        const nTarget = 0.2;
        if (nTarget <= nSs) {
          ionCoolingValid = false;
        } else if (this.phononNumber > nTarget) {
          computedTauB = Math.max(0.0, (1.0 / ionCoolingRate) * Math.log((this.phononNumber - nSs) / (nTarget - nSs)));
        }
      } else {
        if (this.scDelayUs <= 0.0) {
          this.scDelayUs = 750.0;
          this.scOverheadPct = 12.3;
        }
        if (anomalyFlaggedL2) {
          this.scDelayUs = Math.min(1500.0, this.scDelayUs * 1.2);
          this.scOverheadPct = Math.min(35.0, this.scOverheadPct + 4.5);
        } else {
          this.scDelayUs = Math.max(400.0, this.scDelayUs * 0.9);
          this.scOverheadPct = Math.max(5.0, this.scOverheadPct - 1.2);
        }
      }
    } else {
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

    const isTelemetryFault =
      (!isSr && ((this.activeScenario === 'rowhammer' && this.rowhammerIterations > 750) ||
                 (this.activeScenario === 'environment' && this.envTemperatureMk > 25.0))) ||
      (isIon && this.activeScenario === 'rf_leakage' && this.snrDb > 5.0);

    const autoencoderLossL4 = isTelemetryFault
      ? 0.14 + this.pseudoRandom() * 0.06
      : 0.012 + this.pseudoRandom() * 0.008;

    // Differential SPC Monitor over strictly nominal baseline so sustained attacks stay flagged
    const rawSignal = (isolatedFidelity - rawFidelity) * 10.0 + (isTelemetryFault ? 3.5 : 0.0) + (this.pseudoRandom() - 0.5) * 0.35;
    let zScore = 0.0;
    if (this.nominalHistoryZ.length >= 10) {
      const n = this.nominalHistoryZ.length;
      const meanZ = this.nominalHistoryZ.reduce((a, b) => a + b, 0) / n;
      const stdZ = Math.max(0.05, Math.sqrt(this.nominalHistoryZ.reduce((a, b) => a + Math.pow(b - meanZ, 2), 0) / n));
      zScore = Math.abs((rawSignal - meanZ) / stdZ);
    }
    if (!isTelemetryFault || this.nominalHistoryZ.length < 10) {
      this.nominalHistoryZ.push(rawSignal);
      if (this.nominalHistoryZ.length > 60) this.nominalHistoryZ.shift();
    }

    let threatLevel = 0;
    if (zScore >= 5.25) threatLevel = 3;
    else if (zScore >= 3.5) threatLevel = 2;
    else if (zScore >= 2.5) threatLevel = 1;

    const anomalyFlaggedL4 = isTelemetryFault || autoencoderLossL4 > 0.08 || threatLevel >= 2;

    // Contour 1-4 Mitigation Recovery matching main.py:500-546
    const rawLoss = Math.max(0.0, isolatedFidelity - rawFidelity);
    let l1PreventedLoss = 0.0;
    if (this.defenseL1 && this.activeScenario === 'crosstalk' && this.crosstalkIntensity > 0 && t0Qubits.length > 0 && t1Qubits.length > 0 && topo.baseCouplers.length > 0) {
      const meanZzKhz = topo.baseCouplers.reduce((acc, c) => acc + Math.abs(c.zzBase), 0) / topo.baseCouplers.length;
      const freqFactor = Math.max(0.5, Math.min(3.0, this.gateFrequencyHz / 1e6));
      const durS = 100.0e-6 * (this.crosstalkIntensity / 100.0) * freqFactor;
      const unmitigatedPhi = Math.min(Math.PI, 2.0 * Math.PI * meanZzKhz * 1e3 * durS);
      const unmitigatedDrop = Math.min(0.35, 0.36 * (1.0 - Math.exp(-0.25 * Math.pow(unmitigatedPhi, 2))));
      l1PreventedLoss = Math.max(0.0, unmitigatedDrop - rawLoss);
    }

    let recovery = 0.0;
    if (this.defenseL1) {
      if (this.activeScenario === 'rf_leakage' && isIon) {
        // Confidentiality risk mitigated separately below
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
      recovery += rawLoss * (ionCoolingValid ? 0.80 : 0.25);
    }
    if (this.defenseL4 && (anomalyFlaggedL4 || threatLevel >= 2)) {
      recovery += rawLoss * 0.95;
    }
    recovery = Math.min(rawLoss, recovery);
    const fidelityJitter = this.normalRandom(0, 0.0015);
    const currentFidelity = Math.max(0.01, Math.min(isolatedFidelity, rawFidelity + recovery + fidelityJitter));
    const fidelityDrop = Math.max(0.0, isolatedFidelity - currentFidelity);

    // Economics matching main.py (360 ticks = 1 hr; RERUN_COST_MULTIPLIER = 2.5)
    const baseRunCost = (this.hourlyCost * (this.utilization / 100.0)) / 360.0;
    const hasDefenses = this.defenseL1 || this.defenseL2 || this.defenseL3 || this.defenseL4;
    const rfRiskFrac = this.activeScenario === 'rf_leakage' && isIon ? rfAttackSeverity * 0.25 : 0.0;
    const rfMitigatedFrac =
      this.defenseL1 && rfRiskFrac > 0 ? rfRiskFrac * Math.min(1.0, 0.7 + 0.25 * Math.min(1.0, lmsSuppressionDb / 30.0)) : 0.0;
    const totalRisk = rawLoss + l1PreventedLoss + rfRiskFrac;
    const totalRecovered = Math.min(totalRisk, l1PreventedLoss + recovery + rfMitigatedFrac);
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
      cooling_valid: ionCoolingValid,
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
        crosstalk_hops: this.activeScenario === 'crosstalk' ? minPairHops : -1,
        crosstalk_phase_error: this.activeScenario === 'crosstalk' ? Math.round(crosstalkPhaseError * 1000) / 1000 : 0.0,
        rowhammer_degradation: this.activeScenario === 'rowhammer' ? Math.round(rowhammerDegradPct * 100) / 100 : 0.0,
        prime_probe_excitation: this.activeScenario === 'prime_probe' ? Math.round(primeProbeExcitation * 1000) / 1000 : 0.0,
        prime_probe_phonon_nbar: this.activeScenario === 'prime_probe' ? Math.round(this.phononNumber * 1000) / 1000 : 0.0,
        rf_decode_accuracy: this.activeScenario === 'rf_leakage' ? Math.round(rfDecodeAccuracy * 1000) / 1000 : 0.0,
        rf_mutual_info_bits: this.activeScenario === 'rf_leakage' ? Math.round(rfMutualInfo * 100) / 100 : 0.0,
      },
    };
  }
}
