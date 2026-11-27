import asyncio
import math
import os
import threading
from contextlib import asynccontextmanager
from typing import Dict, List, Any, Optional, Set, Literal
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Module-level seeded RNG for simulation stochastic elements (ADC noise, shot noise).
# Seed 13 — documented. Does NOT use global np.random to avoid cross-module coupling.
_sim_rng = np.random.default_rng(13)

from .simulation.qpu import VirtualQPU
from .simulation.scheduler import MultiTenantScheduler
from .simulation.scenarios import SimulationScenarios
from .simulation.defense import (
    LMSFilter,
    CompilerAnomalyDetector,
    LaserCoolingBuffer,
    DifferentialMonitor,
)
from .simulation.qutip_verifier import QuTiPVerifier


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(global_simulation_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="TurtleShell-RT Simulation Backend", lifespan=lifespan)

sim_lock = threading.Lock()

# ─── Economic Model Constants (SPECS §6) ──────────────────────────────────────
SIM_TIME_ACCELERATION = 100.0  # 1 tick (0.1s wall-clock) = 10s machine time (360 ticks = 1 hr)
RERUN_COST_MULTIPLIER = 2.5      # Cost multiplier for failed jobs (re-execution + SLA penalty)
L1_OVERHEAD_FRAC = 0.05          # Level 1 spectral partitioning & LMS filter OpEx overhead (5%)
L2_OVERHEAD_FRAC = 0.03          # Level 2 compiler SHA-256 / Isolation Forest audit overhead (3%)
L4_OVERHEAD_FRAC = 0.04          # Level 4 differential telemetry SPC monitor overhead (4%)

_allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://turtleshell.iqumnov.com",
]
if os.environ.get("TURTLESHELL_CORS_ORIGIN"):
    _allowed_origins.append(os.environ["TURTLESHELL_CORS_ORIGIN"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ─── Global Simulation State ──────────────────────────────────────────────────

class SimulationState:
    def __init__(self):
        # Default: IBM Eagle superconducting
        self.qpu = VirtualQPU("eagle")
        self.scheduler = MultiTenantScheduler(self.qpu)
        
        # Defense systems (4 contours)
        self.lms_filter = LMSFilter(order=32, step_size=0.01)
        self.detector = CompilerAnomalyDetector()
        self.buffer = LaserCoolingBuffer()
        self.monitor = DifferentialMonitor()
        self.monitor.set_platform("eagle")
        
        # Platform configuration
        self.qpu_type = "eagle"
        self.ion_species = "Ca40"
        self.n_ions = 20
        
        # Multi-tenant config
        self.tenant_count = 3
        self.scheduling_algo = "random"
        
        # Attack scenario
        self.active_scenario = "crosstalk"
        
        # Attack parameters
        self.crosstalk_intensity = 50.0
        self.gate_frequency_hz = 1e6
        self.rowhammer_iterations = 600
        self.prime_delay_us = 100.0
        self.env_temperature_mk = 15.0
        self.snr_db = -10.0
        
        # Defense toggles
        self.defense_l1 = False
        self.defense_l2 = False
        self.defense_l3 = False
        self.defense_l4 = False
        
        # Economic model
        self.hourly_cost = 1200.0
        self.utilization = 65.0
        
        # Simulation state
        self.time_step = 0
        self.cumulative_savings = 0.0
        self.cumulative_costs = 0.0
        self.cumulative_wasted_cash = 0.0
        self.playback_speed: float = 1.0  # Wall-clock tick speed multiplier
        
        self.running_tenant_demands: Dict[int, int] = {0: 12, 1: 15, 2: 8}
        self.allocations: Dict[int, List[int]] = {}
        self.prev_l4_anomaly: bool = False
        self.update_allocations()

    def rebuild_qpu(self):
        self.qpu = VirtualQPU(self.qpu_type, self.ion_species, self.n_ions)
        self.scheduler = MultiTenantScheduler(self.qpu)
        self.monitor = DifferentialMonitor()
        self.monitor.set_platform(self.qpu_type)
        self.lms_filter = LMSFilter()
        self.buffer = LaserCoolingBuffer()
        self.detector = CompilerAnomalyDetector()
        self.cumulative_savings = 0.0
        self.cumulative_costs = 0.0
        self.cumulative_wasted_cash = 0.0
        self.time_step = 0
        self.prev_l4_anomaly = False
        self.update_allocations()

    def update_allocations(self):
        total_qubits = len(self.qpu.qubits)
        n = max(1, self.tenant_count)
        algo = self.scheduling_algo
        if self.defense_l1 and algo not in ("tdm", "spectral"):
            algo = "spectral"

        demands: Dict[int, int] = {}
        if algo == "tdm":
            for i in range(n):
                demands[i] = total_qubits if i == 0 else 0
        else:
            base_share = total_qubits // n
            rem = total_qubits % n
            for i in range(n):
                demands[i] = max(1, base_share + (1 if i < rem else 0)) if total_qubits >= n else 1

        self.running_tenant_demands = demands
        self.allocations = self.scheduler.execute_allocation(
            algo,
            self.running_tenant_demands,
            defense_l1_active=self.defense_l1,
        )


sim = SimulationState()


# ─── Config Model ─────────────────────────────────────────────────────────────

class ConfigUpdate(BaseModel):
    qpu_type: Optional[Literal["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]] = None
    ion_species: Optional[Literal["Ca40", "Sr88", "Ba138", "Yb171"]] = None
    n_ions: Optional[int] = Field(default=None, ge=10, le=50)
    tenant_count: Optional[int] = Field(default=None, ge=1, le=16)
    scheduling_algo: Optional[Literal["random", "static", "spectral", "tdm"]] = None
    active_scenario: Optional[Literal["crosstalk", "rowhammer", "prime_probe", "rf_leakage", "environment"]] = None
    crosstalk_intensity: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    gate_frequency_hz: Optional[float] = Field(default=None, ge=1e3, le=1e9)
    rowhammer_iterations: Optional[int] = Field(default=None, ge=0, le=100000)
    prime_delay_us: Optional[float] = Field(default=None, ge=0.0, le=1e6)
    env_temperature_mk: Optional[float] = Field(default=None, ge=0.0, le=1000.0)
    snr_db: Optional[float] = Field(default=None, ge=-60.0, le=60.0)
    defense_l1: Optional[bool] = None
    defense_l2: Optional[bool] = None
    defense_l3: Optional[bool] = None
    defense_l4: Optional[bool] = None
    hourly_cost: Optional[float] = Field(default=None, ge=0.0, le=1e6)
    utilization: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    playback_speed: Optional[float] = Field(default=None, ge=0.05, le=20.0)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "healthy", "version": "1.0.0"}


@app.post("/api/simulation/configure")
def configure_simulation(config: ConfigUpdate):
    with sim_lock:
        rebuild_qpu = False
        allocations_updated = False
        
        if config.qpu_type is not None and config.qpu_type != sim.qpu_type:
            sim.qpu_type = config.qpu_type
            rebuild_qpu = True
        if config.ion_species is not None and config.ion_species != sim.ion_species:
            sim.ion_species = config.ion_species
            if "trapped_ion" in sim.qpu_type:
                rebuild_qpu = True
        if config.n_ions is not None and config.n_ions != sim.n_ions:
            sim.n_ions = config.n_ions
            if "trapped_ion" in sim.qpu_type:
                rebuild_qpu = True
                
        if rebuild_qpu:
            sim.rebuild_qpu()
            allocations_updated = True
            
        if config.tenant_count is not None:
            sim.tenant_count = config.tenant_count
            sim.update_allocations()
            allocations_updated = True
        if config.scheduling_algo is not None:
            sim.scheduling_algo = config.scheduling_algo
            sim.update_allocations()
            allocations_updated = True
        if config.active_scenario is not None:
            sim.active_scenario = config.active_scenario
        if config.crosstalk_intensity is not None:
            sim.crosstalk_intensity = config.crosstalk_intensity
        if config.gate_frequency_hz is not None:
            sim.gate_frequency_hz = config.gate_frequency_hz
        if config.rowhammer_iterations is not None:
            sim.rowhammer_iterations = config.rowhammer_iterations
        if config.prime_delay_us is not None:
            sim.prime_delay_us = config.prime_delay_us
        if config.env_temperature_mk is not None:
            sim.env_temperature_mk = config.env_temperature_mk
        if config.snr_db is not None:
            sim.snr_db = config.snr_db
        if config.defense_l1 is not None:
            sim.defense_l1 = config.defense_l1
            sim.update_allocations()
            allocations_updated = True
        if config.defense_l2 is not None:
            sim.defense_l2 = config.defense_l2
        if config.defense_l3 is not None:
            sim.defense_l3 = config.defense_l3
        if config.defense_l4 is not None:
            sim.defense_l4 = config.defense_l4
        if config.hourly_cost is not None:
            sim.hourly_cost = float(config.hourly_cost)
        if config.utilization is not None:
            sim.utilization = float(config.utilization)
        if config.playback_speed is not None:
            sim.playback_speed = float(config.playback_speed)
            
        if rebuild_qpu and not allocations_updated:
            sim.update_allocations()
        return {"status": "ok", "message": "Configuration updated"}


@app.post("/api/simulation/reset")
def reset_simulation():
    with sim_lock:
        sim.rebuild_qpu()
        return {"status": "ok", "message": "Simulation reset successfully"}

@app.get("/api/qutip/verify")
def verify_qutip_lindblad():
    """Returns QuTiP Lindblad master equation solver results tied to active QPU physics."""
    with sim_lock:
        j_khz = float(np.mean([abs(c.zz_base) for c in sim.qpu.couplers])) if sim.qpu.couplers else 4.8
        t1_avg = float(np.mean([q.t1 for q in sim.qpu.qubits.values()])) if sim.qpu.qubits else 147.13
        t2_avg = float(np.mean([q.t2 for q in sim.qpu.qubits.values()])) if sim.qpu.qubits else 96.72
        n_th = max(0.0, float(sim.qpu.phonon_number))
        n0 = max(5.0, min(60.0, float(sim.qpu.phonon_number) * 100.0))
        heating = sim.qpu.heating_rate if sim.qpu.heating_rate > 0 else 1.0
        cooling = sim.qpu.cooling_rate if sim.qpu.cooling_rate > 0 else 10.0
    verifier = QuTiPVerifier()
    zz_res = verifier.simulate_zz_crosstalk_evolution(
        t1_us=max(1.0, t1_avg),
        t2_us=max(1.0, t2_avg),
        j_zz_khz=max(0.05, j_khz),
        n_thermal=min(2.0, n_th),
    )
    c3_res = verifier.verify_contour3_cooling(n0=n0, eta=cooling, n_dot=heating)
    return {
        "zz_crosstalk": zz_res,
        "contour3_cooling": c3_res,
    }


@app.get("/api/simulation/state")
def get_simulation_state():
    with sim_lock:
        return {
            "qpu_type": sim.qpu_type,
            "ion_species": sim.ion_species,
            "n_ions": sim.n_ions,
            "tenant_count": sim.tenant_count,
            "scheduling_algo": sim.scheduling_algo,
            "active_scenario": sim.active_scenario,
            "crosstalk_intensity": sim.crosstalk_intensity,
            "gate_frequency_hz": sim.gate_frequency_hz,
            "rowhammer_iterations": sim.rowhammer_iterations,
            "prime_delay_us": sim.prime_delay_us,
            "env_temperature_mk": sim.env_temperature_mk,
            "snr_db": sim.snr_db,
            "defense_l1": sim.defense_l1,
            "defense_l2": sim.defense_l2,
            "defense_l3": sim.defense_l3,
            "defense_l4": sim.defense_l4,
            "hourly_cost": sim.hourly_cost,
            "utilization": sim.utilization,
            "playback_speed": sim.playback_speed,
            "qpu": sim.qpu.to_dict()
        }


def sanitize_payload(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: sanitize_payload(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_payload(x) for x in obj]
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.floating, float)):
        return None if (np.isnan(obj) or np.isinf(obj)) else float(obj)
    elif isinstance(obj, np.ndarray):
        return [sanitize_payload(x) for x in obj.tolist()]
    return obj


def run_single_simulation_tick() -> Dict[str, Any]:
    """Executes a single simulation tick step and returns the compiled telemetry payload."""
    sim.time_step += 1
    sim.qpu.reset_all(reset_phonons=False)
    sim.update_allocations()
    
    is_ion_trap = "trapped_ion" in sim.qpu.layout_type
    is_sr_lattice = "sr_optical" in sim.qpu.layout_type
    
    if is_ion_trap and not sim.defense_l3:
        sim.qpu.simulate_phonon_heating(dt_s=0.1, active_cooling=False)
    
    ct_results: Dict[str, Any] = {}
    rh_results: Dict[str, Any] = {}
    pp_results: Dict[str, Any] = {}
    rf_results: Dict[str, Any] = {}
    
    if sim.active_scenario == "crosstalk":
        ct_results = SimulationScenarios.run_crosstalk(
            sim.qpu, sim.allocations,
            sim.crosstalk_intensity,
            sim.gate_frequency_hz
        )
    elif sim.active_scenario == "rowhammer":
        rh_results = SimulationScenarios.run_rowhammer(
            sim.qpu, sim.allocations, sim.rowhammer_iterations
        )
    elif sim.active_scenario == "prime_probe":
        pp_results = SimulationScenarios.run_prime_probe(
            sim.qpu, sim.allocations, sim.prime_delay_us
        )
    elif sim.active_scenario == "rf_leakage":
        rf_results = SimulationScenarios.run_rf_leakage(
            sim.qpu, sim.allocations, sim.snr_db
        )
    elif sim.active_scenario == "environment":
        SimulationScenarios.run_decoherence(
            sim.qpu, sim.env_temperature_mk
        )
    
    lms_suppression_db = 0.0
    effective_leakage_db = sim.qpu.rf_leakage_db
    
    if sim.active_scenario == "rf_leakage" and is_ion_trap:
        raw_rf_db = rf_results.get("leakage_db", sim.qpu.rf_leakage_db)
        if sim.defense_l1:
            suppressed_db = sim.lms_filter.simulate_rf_suppression(raw_rf_db)
            lms_suppression_db = sim.lms_filter.suppression_db
            effective_leakage_db = suppressed_db
            # Update post-LMS decode accuracy and Shannon mutual information
            eff_snr_db = sim.snr_db - lms_suppression_db
            eff_snr_lin = 10.0 ** (eff_snr_db / 10.0)
            eff_acc = 1.0 / (1.0 + math.exp(-(eff_snr_db + 5.0) / 5.0))
            eff_mi = min(
                math.log2(1.0 + max(0.0, eff_snr_lin)),
                eff_acc * math.log2(max(2, len(sim.allocations.get(0, [])))),
            )
            rf_results["decode_accuracy"] = round(eff_acc, 4)
            rf_results["mutual_information_bits"] = round(eff_mi, 4)
        else:
            effective_leakage_db = raw_rf_db
    
    l2_nominal = [5.0, 45.0, 10.0, 220.0]
    if sim.crosstalk_intensity > 75 and sim.active_scenario == "crosstalk":
        l2_nominal = [14.0, 78.0, 15.0, 310.0]
    
    l2_secure, l2_conf, circuit_hash = sim.detector.verify_circuit(l2_nominal)
    l2_flagged = not l2_secure
    
    cooling_tau_s = 0.0
    if sim.defense_l3 and not is_sr_lattice:
        if is_ion_trap and sim.qpu.cooling_rate > 0:
            sim.qpu.simulate_phonon_heating(dt_s=0.1, active_cooling=True)
        sim.buffer.adjust_policy(
            anomaly_detected=l2_flagged,
            n_bar=sim.qpu.phonon_number,
            heating_rate=sim.qpu.heating_rate,
            cooling_rate=sim.qpu.cooling_rate,
            is_ion_trap=is_ion_trap
        )
        cooling_tau_s = sim.buffer.current_tau_s
    else:
        sim.buffer.current_delay_us = 0.0
        sim.buffer.overhead_pct = 0.0
        sim.buffer.current_tau_s = 0.0
        sim.buffer.cooling_valid = True
    
    telemetry = sim.qpu.get_telemetry_vector()
    # ADC digitization noise: ±0.8% multiplicative jitter models quantization
    # uncertainty and cable/amplifier gain variation on each sensor channel.
    # Uses seeded local _sim_rng — reproducible across runs.
    noise_vec = _sim_rng.uniform(0.992, 1.008, size=len(telemetry))
    telemetry = [float(val * n) for val, n in zip(telemetry, noise_vec)]
    
    rowhammer_env_fault = (not is_sr_lattice) and (
        (sim.active_scenario == "rowhammer" and sim.rowhammer_iterations > 750) or
        (sim.active_scenario == "environment" and sim.env_temperature_mk > 25.0)
    )
    rf_fault = is_ion_trap and sim.active_scenario == "rf_leakage" and sim.snr_db > 5.0
    if rowhammer_env_fault or rf_fault:
        telemetry[0] *= 0.6
        telemetry[1] *= 0.5
        telemetry[3] *= 4.0
        telemetry[4] *= 3.0
    
    ae_loss, ae_anomaly = sim.monitor.reconstruct(telemetry)
    if ae_anomaly != sim.prev_l4_anomaly:
        sim.prev_l4_anomaly = ae_anomaly
        print(f"[Contour 4 Autoencoder] State Transition -> Anomaly: {ae_anomaly} (MSE Loss: {ae_loss:.4f}, Threshold: {sim.monitor._ae.spc_threshold:.4f})")
    
    bbr_shift_hz = (sim.env_temperature_mk - 15.0) * 1.2 if is_sr_lattice else 0.0
    zeeman_delta_hz = sim.qpu.clock_freq_hz * 1e-7 if sim.qpu.clock_freq_hz > 0 else 0.0
    monitor_result = sim.monitor.update(
        # SPC input: mean of top-3 coherence metrics (avg_t1, avg_t2, std_t1).
        # ADC noise already applied via noise_vec above — no additional jitter here.
        telemetry_value=float(np.mean(telemetry[:3])),
        nu_plus=(sim.qpu.clock_freq_hz + zeeman_delta_hz + bbr_shift_hz) if sim.qpu.clock_freq_hz > 0 else 0.0,
        nu_minus=(sim.qpu.clock_freq_hz - zeeman_delta_hz + bbr_shift_hz) if sim.qpu.clock_freq_hz > 0 else 0.0
    )
    z_score = monitor_result["z_score"]
    threat_level = monitor_result["threat_level"]
    
    if sim.defense_l4 and (ae_anomaly or threat_level >= 2):
        sim.qpu.isolate_faulty_zones(0)
    
    base_benchmark_fidelity = 0.94
    if is_ion_trap:
        base_benchmark_fidelity = 0.995
    elif is_sr_lattice:
        base_benchmark_fidelity = 0.999
    
    raw_fidelity = base_benchmark_fidelity
    if sim.active_scenario == "crosstalk":
        raw_fidelity = ct_results.get("parallel_fidelity", base_benchmark_fidelity)
    elif sim.active_scenario == "rowhammer":
        degrad = rh_results.get("average_degradation_pct", 0.0) / 100.0
        raw_fidelity = max(0.1, base_benchmark_fidelity - 0.35 * degrad)
    elif sim.active_scenario == "prime_probe":
        raw_fidelity = min(
            base_benchmark_fidelity,
            pp_results.get("probe_fidelity", base_benchmark_fidelity),
        )
    elif sim.active_scenario == "rf_leakage":
        # Passive RF eavesdropping breaches confidentiality without perturbing qubit unitary evolution
        raw_fidelity = base_benchmark_fidelity
    elif sim.active_scenario == "environment":
        victim_qubits = [q for q in sim.qpu.qubits.values() if q.active_tenant == 0]
        if victim_qubits:
            avg_t2 = float(np.mean([q.t2 for q in victim_qubits]))
            base_t2 = float(np.mean([q.t2_base for q in victim_qubits]))
            excess_rate = max(0.0, (1.0 / max(0.01, avg_t2)) - (1.0 / max(0.01, base_t2)))
            circuit_time_us = 200_000.0 if is_ion_trap else 0.5
            raw_fidelity = max(0.01, base_benchmark_fidelity * float(np.exp(-circuit_time_us * excess_rate)))
    
    # Compute physics-derived isolation index (SPECS §5.1) before defense credit evaluation
    isolation_index = sim.qpu.compute_isolation_index(sim.allocations, sim.defense_l1)

    raw_loss = max(0.0, base_benchmark_fidelity - raw_fidelity)
    # Track fidelity loss already prevented upstream by Contour 1 spectral routing/detuning
    l1_prevented_loss = 0.0
    if sim.defense_l1 and sim.active_scenario == "crosstalk" and sim.crosstalk_intensity > 0:
        t0_len = len(sim.allocations.get(0, []))
        t1_len = len(sim.allocations.get(1, []))
        if t0_len > 0 and t1_len > 0 and sim.qpu.couplers:
            mean_zz_khz = float(np.mean([abs(c.zz_base) for c in sim.qpu.couplers]))
            freq_factor = max(0.5, min(3.0, sim.gate_frequency_hz / 1e6))
            dur_s = 100.0e-6 * (sim.crosstalk_intensity / 100.0) * freq_factor
            unmitigated_phi = min(math.pi, 2.0 * math.pi * mean_zz_khz * 1e3 * dur_s)
            unmitigated_drop = min(0.35, 0.36 * (1.0 - math.exp(-0.25 * (unmitigated_phi ** 2))))
            l1_prevented_loss = max(0.0, unmitigated_drop - raw_loss)

    recovery = 0.0

    if sim.defense_l1:
        if sim.active_scenario == "rf_leakage" and is_ion_trap:
            pass  # Mitigates confidentiality risk below; gate fidelity already unaffected
        elif sim.qpu.residual_floor < 1.0:
            detuning_efficiency = 1.0 - sim.qpu.residual_floor
            recovery += raw_loss * (0.85 * detuning_efficiency)
        elif sim.active_scenario in ("crosstalk", "rowhammer") and isolation_index > 0:
            # Fixed-coupler chips (IBM Eagle) cannot detune couplers, but spectral routing separates tenants spatially
            recovery += raw_loss * (0.40 * (isolation_index / 100.0))

    if sim.defense_l2:
        if l2_secure:
            recovery += raw_loss * 0.15
        else:
            recovery += raw_loss * 0.90

    if sim.defense_l3 and not is_sr_lattice:
        if is_ion_trap:
            recovery += raw_loss * (0.80 if sim.buffer.cooling_valid else 0.25)
        else:
            recovery += raw_loss * 0.80

    if sim.defense_l4 and (ae_anomaly or threat_level >= 2):
        recovery += raw_loss * 0.95

    recovery = min(raw_loss, recovery)
    # Shot noise on fidelity measurement: σ=0.15% ≈ projection noise for ~N=400 shots.
    # F_measured = F_true ± 1/√N; for N=400, σ_F ≈ 0.5/√400 = 0.025 → scaled to 0.15%.
    fidelity_jitter = float(_sim_rng.normal(0, 0.0015))
    current_fidelity = max(0.01, min(base_benchmark_fidelity, raw_fidelity + recovery + fidelity_jitter))

    for q in sim.qpu.qubits.values():
        if q.active_tenant is not None:
            # Physics-derived gate count: linear mapping of gate_frequency_hz → [2, 18] display range.
            # At 1e5 Hz (min) → 2 gates; at 1e7 Hz (max) → 18 gates.
            freq_normalized = min(1.0, max(0.0, (sim.gate_frequency_hz - 1e5) / (1e7 - 1e5)))
            q.gate_count = max(2, min(18, int(2 + 16 * freq_normalized)))

    base_run_cost = (sim.hourly_cost * (sim.utilization / 100.0)) / 360.0
    has_active_defenses = sim.defense_l1 or sim.defense_l2 or sim.defense_l3 or sim.defense_l4

    rf_risk_frac = rf_results.get("rf_attack_severity", 0.0) * 0.25 if (sim.active_scenario == "rf_leakage" and is_ion_trap) else 0.0
    rf_mitigated_frac = (
        rf_risk_frac * min(1.0, 0.70 + 0.25 * min(1.0, max(0.0, lms_suppression_db / 30.0)))
        if (sim.defense_l1 and rf_risk_frac > 0.0)
        else 0.0
    )

    total_risk_loss = raw_loss + l1_prevented_loss + rf_risk_frac
    total_recovered = min(total_risk_loss, l1_prevented_loss + recovery + rf_mitigated_frac)

    if has_active_defenses and total_risk_loss > 0:
        avoided_step_loss = total_recovered * base_run_cost * RERUN_COST_MULTIPLIER
    else:
        avoided_step_loss = 0.0

    unmitigated_loss_frac = max(0.0, total_risk_loss - total_recovered)
    loss_with_defense = unmitigated_loss_frac * base_run_cost * RERUN_COST_MULTIPLIER
    
    defense_overhead = 0.0
    if sim.defense_l1:
        defense_overhead += base_run_cost * L1_OVERHEAD_FRAC
    if sim.defense_l2:
        defense_overhead += base_run_cost * L2_OVERHEAD_FRAC
    if sim.defense_l3:
        defense_overhead += base_run_cost * (sim.buffer.overhead_pct / 100.0)
    if sim.defense_l4:
        defense_overhead += base_run_cost * L4_OVERHEAD_FRAC
    
    sim.cumulative_costs += defense_overhead
    sim.cumulative_savings += avoided_step_loss
    sim.cumulative_wasted_cash += loss_with_defense

    qpu_dict = sim.qpu.to_dict()
    qpu_dict["rf_leakage_db"] = round(effective_leakage_db, 1)

    payload = {
        "time_step": sim.time_step,
        "fidelity": round(current_fidelity, 4),
        "fidelity_drop": round(float(base_benchmark_fidelity - current_fidelity) * 100, 2),
        "average_t1": round(float(np.mean([q.t1 for q in sim.qpu.qubits.values()])), 2),
        "average_t2": round(float(np.mean([q.t2 for q in sim.qpu.qubits.values()])), 2),
        "anomaly_score_l2": round(l2_conf, 4),
        "anomaly_flagged_l2": l2_flagged,
        "circuit_hash": circuit_hash,
        "autoencoder_loss_l4": round(ae_loss, 5),
        "anomaly_flagged_l4": ae_anomaly,
        "monitor_z_score": round(z_score, 3),
        "monitor_threat_level": threat_level,
        "buffer_delay_us": round(sim.buffer.current_delay_us, 1),
        "buffer_overhead_pct": round(sim.buffer.overhead_pct, 1),
        "cooling_buffer_tau_s": round(cooling_tau_s, 3),
        "cooling_valid": sim.buffer.cooling_valid,
        "platform_type": sim.qpu.layout_type,
        "phonon_number": round(sim.qpu.phonon_number, 4),
        "heating_rate": round(sim.qpu.heating_rate, 4),
        "rf_leakage_db": round(effective_leakage_db, 1),
        "lms_suppression_db": round(lms_suppression_db, 1),
        "isolation_index": isolation_index,
        "cumulative_savings": round(sim.cumulative_savings, 2),
        "cumulative_costs": round(sim.cumulative_costs, 2),
        "cumulative_wasted_cash": round(sim.cumulative_wasted_cash, 2),
        "net_benefit": round(sim.cumulative_savings - sim.cumulative_costs, 2),
        "qpu": qpu_dict,
        "active_scenario_metrics": {
            "crosstalk_hops": ct_results.get("min_distance_hops", -1),
            "crosstalk_phase_error": ct_results.get("phase_error_rad", 0.0),
            "rowhammer_degradation": rh_results.get("average_degradation_pct", 0.0),
            "prime_probe_excitation": pp_results.get("residual_excitation", 0.0),
            "prime_probe_phonon_nbar": pp_results.get("phonon_n_bar", 0.0),
            "rf_decode_accuracy": rf_results.get("decode_accuracy", 0.0),
            "rf_mutual_info_bits": rf_results.get("mutual_information_bits", 0.0),
        }
    }
    return payload


# ─── WebSocket Broadcast Stream ─────────────────────────────────────────────

connected_clients: Set[WebSocket] = set()

async def global_simulation_loop():
    """Single global simulation loop ticking strictly once per 100ms."""
    while True:
        try:
            with sim_lock:
                payload = run_single_simulation_tick()
            if connected_clients:
                sanitized = sanitize_payload(payload)
                dead_clients = set()
                for client in list(connected_clients):
                    try:
                        await client.send_json(sanitized)
                    except Exception:
                        dead_clients.add(client)
                connected_clients.difference_update(dead_clients)
        except Exception as ex:
            print(f"Transient error in global simulation loop: {ex}")
        
        speed = sim.playback_speed
        await asyncio.sleep(max(0.02, 0.1 / max(0.1, speed)))

@app.websocket("/api/simulation/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        connected_clients.discard(websocket)
