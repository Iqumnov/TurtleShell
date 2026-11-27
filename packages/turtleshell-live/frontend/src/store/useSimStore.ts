import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ClientSimulationEngine } from './clientEngine';

export interface QubitState {
  id: number;
  x: number;
  y: number;
  t1: number;
  t2: number;
  err_1q: number;
  err_readout: number;
  active_tenant: number | null;
  gate_count: number;
}

export interface CouplerState {
  q1: number;
  q2: number;
  active: boolean;
  zz_crosstalk: number;
}

export interface QpuState {
  layout_type: string;
  platform_display_name?: string;
  qubits: QubitState[];
  couplers: CouplerState[];
  heating_rate?: number;
  phonon_number?: number;
  rf_leakage_db?: number;
  temperature_k?: number;
  n_vibrational_modes?: number;
}

export interface SimMetrics {
  time_step: number;
  fidelity: number;
  fidelity_drop: number;
  average_t1: number;
  average_t2: number;

  // Contour 2: Compiler Verification
  anomaly_score_l2: number;
  anomaly_flagged_l2: boolean;
  circuit_hash: string;

  // Contour 4: Telemetry Monitor
  autoencoder_loss_l4: number;
  anomaly_flagged_l4: boolean;
  monitor_z_score: number;
  monitor_threat_level: number; // 0-3

  // Contour 3: Cooling Buffer
  buffer_delay_us: number;
  buffer_overhead_pct: number;
  cooling_buffer_tau_s: number;
  cooling_valid: boolean;

  // Platform physics
  platform_type: string;
  phonon_number: number;
  heating_rate: number;
  rf_leakage_db: number;
  lms_suppression_db: number;

  // Economic
  cumulative_savings: number;
  cumulative_costs: number;
  cumulative_wasted_cash: number;
  net_benefit: number;
  isolation_index: number;

  qpu: QpuState;

  active_scenario_metrics: {
    crosstalk_hops: number;
    crosstalk_phase_error: number;
    rowhammer_degradation: number;
    prime_probe_excitation: number;
    prime_probe_phonon_nbar: number;
    rf_decode_accuracy: number;
    rf_mutual_info_bits: number;
  };
}

interface SimStore {
  // Live states
  connected: boolean;
  metrics: SimMetrics | null;
  history: {
    fidelity: number[];
    savings: number[];
    costs: number[];
    lossL4: number[];
    labels: string[];
    qpu: QpuState[];
    zScore: number[];
    phonon: number[];
  };
  scrubIndex: number | null;

  // Platform config
  qpuType: string;
  ionSpecies: string;
  nIons: number;

  // Multi-tenant config
  tenantCount: number;
  schedulingAlgo: string;

  // Attack scenario
  activeScenario: string;

  // Attack parameters
  crosstalkIntensity: number;
  gateFrequencyHz: number;
  rowhammerIterations: number;
  primeDelayUs: number;
  envTemperatureMk: number;
  snrDb: number;

  // Defense toggles
  defenseL1: boolean;
  defenseL2: boolean;
  defenseL3: boolean;
  defenseL4: boolean;

  // Economic
  hourlyCost: number;
  utilization: number;

  // Theme & Language
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  language: 'EN' | 'RU';
  setLanguage: (lang: 'EN' | 'RU') => void;

  // Playback speed
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;

  // Actions
  setConfigs: (configs: Partial<SimStore>) => void;
  syncConfigWithBackend: () => Promise<void>;
  connectWS: () => void;
  disconnectWS: () => void;
  resetSim: () => Promise<void>;
  setScrubIndex: (index: number | null) => void;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const clientEngine = new ClientSimulationEngine();
let clientTimer: ReturnType<typeof setInterval> | null = null;

const pushMetrics = (set: any, data: SimMetrics) => {
  set((state: SimStore) => {
    const nextLabels = [...state.history.labels, `#${data.time_step}`].slice(-40);
    const nextFidelity = [...state.history.fidelity, data.fidelity * 100].slice(-40);
    const nextSavings = [...state.history.savings, data.cumulative_savings].slice(-40);
    const nextCosts = [...state.history.costs, data.cumulative_costs].slice(-40);
    const nextLossL4 = [...state.history.lossL4, data.autoencoder_loss_l4].slice(-40);
    const nextQpu = [...state.history.qpu, data.qpu].slice(-40);
    const nextZScore = [...state.history.zScore, data.monitor_z_score ?? 0].slice(-40);
    const nextPhonon = [...state.history.phonon, data.phonon_number ?? 0].slice(-40);

    return {
      metrics: data,
      history: {
        labels: nextLabels,
        fidelity: nextFidelity,
        savings: nextSavings,
        costs: nextCosts,
        lossL4: nextLossL4,
        qpu: nextQpu,
        zScore: nextZScore,
        phonon: nextPhonon,
      },
    };
  });
};

const startClientSimulation = (set: any, get: any) => {
  if (clientTimer) {
    clearInterval(clientTimer);
    clientTimer = null;
  }
  clientEngine.updateConfig(get());
  pushMetrics(set, clientEngine.tick());
  set({ connected: true });
  const intervalMs = Math.max(100, Math.round(1000 / Math.max(0.1, get().playbackSpeed || 1.0)));
  clientTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pushMetrics(set, clientEngine.tick());
    }
  }, intervalMs);
};

const stopClientSimulation = () => {
  if (clientTimer) {
    clearInterval(clientTimer);
    clientTimer = null;
  }
};

const BACKEND_URL = (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost')
  ? `${window.location.hostname}:8000`
  : "127.0.0.1:8000";

const DEFAULT_ENGINE_CONFIG = {
  qpuType: "eagle",
  ionSpecies: "Ca40",
  nIons: 20,
  tenantCount: 3,
  schedulingAlgo: "random",
  activeScenario: "crosstalk",
  crosstalkIntensity: 80,
  gateFrequencyHz: 1e6,
  rowhammerIterations: 600,
  primeDelayUs: 100,
  envTemperatureMk: 15,
  snrDb: -10,
  defenseL1: false,
  defenseL2: false,
  defenseL3: false,
  defenseL4: false,
  hourlyCost: 1200,
  utilization: 65,
  playbackSpeed: 1.0,
};
clientEngine.updateConfig(DEFAULT_ENGINE_CONFIG);
const initialMetrics = clientEngine.tick();

export const useSimStore = create<SimStore>()(
  persist(
    (set, get) => ({
  connected: true,
  metrics: initialMetrics,
  history: {
    fidelity: [initialMetrics.fidelity * 100],
    savings: [initialMetrics.cumulative_savings],
    costs: [initialMetrics.cumulative_costs],
    lossL4: [initialMetrics.autoencoder_loss_l4],
    labels: [`#${initialMetrics.time_step}`],
    qpu: [initialMetrics.qpu],
    zScore: [initialMetrics.monitor_z_score ?? 0],
    phonon: [initialMetrics.phonon_number ?? 0],
  },
  scrubIndex: null,

  // Platform config
  qpuType: "eagle",
  ionSpecies: "Ca40",
  nIons: 20,

  // Multi-tenant
  tenantCount: 3,
  schedulingAlgo: "random",

  // Attack
  activeScenario: "crosstalk",
  crosstalkIntensity: 80,
  gateFrequencyHz: 1e6,
  rowhammerIterations: 600,
  primeDelayUs: 100,
  envTemperatureMk: 15,
  snrDb: -10,

  // Defense
  defenseL1: false,
  defenseL2: false,
  defenseL3: false,
  defenseL4: false,

  // Economic
  hourlyCost: 1200,
  utilization: 65,

  // Theme & Language
  theme: 'dark',
  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    set({ theme: nextTheme });
  },
  language: (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru')) ? 'RU' : 'EN',
  setLanguage: (lang) => set({ language: lang }),

  playbackSpeed: 1.0,
  setPlaybackSpeed: (speed: number) => {
    set({ playbackSpeed: speed });
    if (clientTimer) {
      startClientSimulation(set, get);
    }
    get().syncConfigWithBackend();
  },

  setConfigs: (configs) => {
    const prevQpu = get().qpuType;
    set(configs);
    if (configs.qpuType && configs.qpuType !== prevQpu) {
      clientEngine.updateConfig(get());
      clientEngine.reset();
      const fresh = clientEngine.tick();
      set({
        metrics: fresh,
        scrubIndex: null,
        history: {
          fidelity: [fresh.fidelity * 100],
          savings: [fresh.cumulative_savings],
          costs: [fresh.cumulative_costs],
          lossL4: [fresh.autoencoder_loss_l4],
          labels: [`#${fresh.time_step}`],
          qpu: [fresh.qpu],
          zScore: [fresh.monitor_z_score ?? 0],
          phonon: [fresh.phonon_number ?? 0],
        },
      });
    } else {
      clientEngine.updateConfig(configs);
    }
    get().syncConfigWithBackend();
  },

  syncConfigWithBackend: async () => {
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!isLocal) return;

    const state = get();
    const payload = {
      qpu_type: state.qpuType,
      ion_species: state.ionSpecies,
      n_ions: state.nIons,
      tenant_count: state.tenantCount,
      scheduling_algo: state.schedulingAlgo,
      active_scenario: state.activeScenario,
      crosstalk_intensity: state.crosstalkIntensity,
      gate_frequency_hz: state.gateFrequencyHz,
      rowhammer_iterations: state.rowhammerIterations,
      prime_delay_us: state.primeDelayUs,
      env_temperature_mk: state.envTemperatureMk,
      snr_db: state.snrDb,
      defense_l1: state.defenseL1,
      defense_l2: state.defenseL2,
      defense_l3: state.defenseL3,
      defense_l4: state.defenseL4,
      hourly_cost: state.hourlyCost,
      utilization: state.utilization,
      playback_speed: state.playbackSpeed,
    };
    try {
      await fetch(`http://${BACKEND_URL}/api/simulation/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Backend not running on port 8000; client simulation handles execution
    }
  },

  connectWS: () => {
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      ws = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Always start client simulation so telemetry is immediately live
    startClientSimulation(set, get);

    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (!isLocal) {
      // Standalone browser / Cloudflare Pages mode: client engine handles all physics
      return;
    }

    const attemptConnect = () => {
      const primaryUrl = `ws://${BACKEND_URL}/api/simulation/stream`;
      try {
        ws = new WebSocket(primaryUrl);
      } catch (e) {
        startClientSimulation(set, get);
        return;
      }

      ws.onopen = () => {
        stopClientSimulation();
        set({ connected: true });
        get().syncConfigWithBackend();
      };

      ws.onmessage = (event) => {
        const data: SimMetrics = JSON.parse(event.data);
        pushMetrics(set, data);
      };

      ws.onclose = () => {
        ws = null;
        startClientSimulation(set, get);
        if (isLocal && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            attemptConnect();
          }, 5000);
        }
      };

      ws.onerror = () => {
        startClientSimulation(set, get);
      };
    };

    attemptConnect();
  },

  disconnectWS: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    stopClientSimulation();
    set({ connected: false });
  },

  resetSim: async () => {
    clientEngine.updateConfig(get());
    clientEngine.reset();
    const fresh = clientEngine.tick();
    try {
      await fetch(`http://${BACKEND_URL}/api/simulation/reset`, { method: "POST" });
    } catch (e) {
      // Backend offline, fallback client engine reset is sufficient
    }
    set({
      metrics: fresh,
      history: {
        fidelity: [fresh.fidelity * 100],
        savings: [fresh.cumulative_savings],
        costs: [fresh.cumulative_costs],
        lossL4: [fresh.autoencoder_loss_l4],
        labels: [`#${fresh.time_step}`],
        qpu: [fresh.qpu],
        zScore: [fresh.monitor_z_score ?? 0],
        phonon: [fresh.phonon_number ?? 0],
      },
      scrubIndex: null,
    });
  },

  setScrubIndex: (index) => set({ scrubIndex: index }),
    }),
    {
      name: 'turtleshell-config-storage',
      partialize: (state) => ({
        qpuType: state.qpuType,
        ionSpecies: state.ionSpecies,
        nIons: state.nIons,
        tenantCount: state.tenantCount,
        schedulingAlgo: state.schedulingAlgo,
        activeScenario: state.activeScenario,
        crosstalkIntensity: state.crosstalkIntensity,
        gateFrequencyHz: state.gateFrequencyHz,
        rowhammerIterations: state.rowhammerIterations,
        primeDelayUs: state.primeDelayUs,
        snrDb: state.snrDb,
        envTemperatureMk: state.envTemperatureMk,
        defenseL1: state.defenseL1,
        defenseL2: state.defenseL2,
        defenseL3: state.defenseL3,
        defenseL4: state.defenseL4,
        hourlyCost: state.hourlyCost,
        utilization: state.utilization,
        language: state.language,
        theme: state.theme,
      }),
    }
  )
);
