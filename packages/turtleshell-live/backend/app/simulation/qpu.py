import math
import numpy as np
from typing import Dict, List, Any, Optional, Tuple

class Qubit:
    def __init__(self, q_id: int, x: float, y: float, t1_base: float, t2_base: float,
                 err_1q: float = 0.001, err_2q: float = 0.01, err_readout: float = 0.015):
        self.id = q_id
        self.x = x
        self.y = y
        self.t1_base = t1_base
        self.t2_base = t2_base
        self.err_1q_base = err_1q
        self.err_2q_base = err_2q
        self.err_readout_base = err_readout
        
        # Real-time state
        self.t1 = t1_base
        self.t2 = t2_base
        self.err_1q = err_1q
        self.err_2q = err_2q
        self.err_readout = err_readout
        self.active_tenant: Optional[int] = None
        self.gate_count = 0

    def reset_state(self):
        self.t1 = self.t1_base
        self.t2 = self.t2_base
        self.err_1q = self.err_1q_base
        self.err_2q = self.err_2q_base
        self.err_readout = self.err_readout_base
        self.active_tenant = None
        self.gate_count = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "t1": round(self.t1, 2),
            "t2": round(self.t2, 2),
            "err_1q": round(self.err_1q, 6),
            "err_readout": round(self.err_readout, 5),
            "active_tenant": self.active_tenant,
            "gate_count": self.gate_count
        }

class Coupler:
    def __init__(self, q1: int, q2: int, zz_base: float):
        self.q1 = q1
        self.q2 = q2
        self.zz_base = zz_base  # Base ZZ crosstalk strength (kHz for superconducting, arbitrary for ions)
        
        # Real-time state
        self.active = True
        self.detuned = False
        self.zz_crosstalk = zz_base

    def to_dict(self) -> Dict[str, Any]:
        return {
            "q1": self.q1,
            "q2": self.q2,
            "active": self.active,
            "zz_crosstalk": round(self.zz_crosstalk, 4) if (self.active or getattr(self, "detuned", False)) else 0.0
        }


class VirtualQPU:
    """
    TurtleShell-RT: Virtual QPU supporting all platforms defined in the SPECS.
    
    Platforms:
    - trapped_ion_paul_trap: Paul trap ion chain (Ca-40/Sr-88/Ba-138/Yb-171), Linear Paul Trap
    - sr_optical_lattice: Strontium-87 neutral-atom optical lattice (461/689 nm cooling -> ~1 uK atoms, 698.4 nm clock transition at 4.29e14 Hz inside 300K UHV chamber)
    - eagle: IBM Eagle 127Q Heavy-Hex superconducting
    - heron: IBM Heron 133Q superconducting with tunable couplers
    """
    
    def __init__(self, layout_type: str = "eagle", ion_species: str = "Ca40", n_ions: int = 20):
        self.layout_type = layout_type.lower()
        self.ion_species = ion_species
        self.n_ions = max(10, min(50, n_ions))
        
        self.qubits: Dict[int, Qubit] = {}
        self.couplers: List[Coupler] = []
        
        # Platform-specific physics state
        self.heating_rate: float = 0.0      # phonons/s (ion traps), 0 for others
        self.phonon_number: float = 0.0     # current average phonon number n̄
        self.rf_leakage_db: float = -80.0   # RF leakage level in dBm
        self.cooling_rate: float = 0.0      # laser cooling rate η (1/s)
        self.temperature_k: float = 0.015   # Operating temperature in K (15mK default for SC)
        self.clock_freq_hz: float = 0.0     # Clock transition frequency (Hz)
        self.vibrational_modes: List[float] = []  # Normal mode frequencies (MHz)
        
        # Platform display info
        self.platform_display_name: str = ""
        self.platform_description: str = ""
        
        self._initialize_layout()
        
    def _initialize_layout(self):
        # Per-instance local RNG for fabrication disorder.
        # Seed 42 → reproducible qubit parameter spread across runs and numpy versions.
        # Does NOT touch the global np.random stream.
        self._rng = np.random.default_rng(42)
        
        t = self.layout_type
        
        if "trapped_ion_paul_trap" in t or "trapped_ion" in t:
            self._init_trapped_ion_paul_trap()
        elif "sr_optical" in t or "optical_lattice" in t:
            self.layout_type = "sr_optical_lattice"
            self._init_sr_optical_lattice()
        elif "heron" in t:
            self._init_ibm_heron()
        elif "eagle" in t:
            self._init_ibm_eagle()
        else:
            # Default to IBM Eagle
            self.layout_type = "eagle"
            self._init_ibm_eagle()

    # ─── TrappedIonPaulTrap ───────────────────────────────────────────────────

    def _init_trapped_ion_paul_trap(self):
        """
        Paul trap ion chain (Leibfried et al. 2003, Deslauriers et al. 2006).
        Physical parameters from published data (Deslauriers 2006 for heating rates).
        
        Ion species supported: Ca-40, Sr-88, Ba-138, Yb-171
        - T1 = 1.0 s = 1e6 µs
        - T2 = 0.5 s = 5e5 µs
        - 1Q gate error: 1e-4
        - 2Q gate error: 5e-3 (via Molmer-Sorensen or Cirac-Zoller)
        - Readout error: 1e-3
        - RF leakage: -60 dBm (base)
        - Heating rate: 0.01–10 phonons/s (species-dependent)
        - All-to-all connectivity via shared motional modes
        - Coupling J_ij ~ 1/|i-j|^3 (dipole-dipole)
        """
        # Ion species physical properties
        species_params = {
            "Ca40":  {"mass_amu": 40,  "heating_rate": 0.1,  "cooling_rate": 8.0,  "rf_leakage_db": -60.0},
            "Sr88":  {"mass_amu": 88,  "heating_rate": 0.05, "cooling_rate": 10.0, "rf_leakage_db": -62.0},
            "Ba138": {"mass_amu": 138, "heating_rate": 0.02, "cooling_rate": 12.0, "rf_leakage_db": -58.0},
            "Yb171": {"mass_amu": 171, "heating_rate": 0.08, "cooling_rate": 9.0,  "rf_leakage_db": -61.0},
        }
        sp = species_params.get(self.ion_species, species_params["Ca40"])
        
        n = self.n_ions
        
        # T1=1s, T2=0.5s in microseconds
        T1_us = 1.0e6  # 1 second in µs
        T2_us = 0.5e6  # 0.5 seconds in µs
        
        # Place ions in linear chain along x-axis
        for i in range(n):
            x = (i - (n - 1) / 2.0) * 1.5
            y = 0.0
            # Small T1/T2 jitter per ion, enforcing physical coherence bound T2 <= 2*T1
            t1 = max(1.0, float(self._rng.normal(T1_us, T1_us * 0.02)))
            t2 = max(1.0, min(2.0 * t1, float(self._rng.normal(T2_us, T2_us * 0.02))))
            self.qubits[i] = Qubit(i, x, y, t1, t2,
                                   err_1q=1e-4,
                                   err_2q=5e-3,
                                   err_readout=1e-3)
        
        # All-to-all couplers (shared phonon modes)
        # Coupling strength J_ij ~ J0 / |i-j|^3 (dipole-dipole, in kHz-equivalent units)
        J0 = 2.0  # base coupling strength
        for i in range(n):
            for j in range(i + 1, n):
                dist = abs(i - j)
                zz = J0 / (dist ** 3)
                zz = float(self._rng.normal(zz, zz * 0.05))  # 5% fabrication disorder
                self.couplers.append(Coupler(i, j, max(0.001, zz)))

        # Longitudinal Coulomb crystal normal modes: ω_1 = ω_axial (COM), ω_2 = √3 ω_axial (stretch),
        # approximated analytically for higher modes via sqrt((k+1)(k+2)/2) (James 1998)
        omega_axial_mhz = 1.0  # 1 MHz axial trap frequency
        self.vibrational_modes = [
            omega_axial_mhz * math.sqrt((k + 1) * (k + 2) / 2.0) for k in range(n)
        ]

        # Platform physics
        self.heating_rate = sp["heating_rate"]  # phonons/s
        self.phonon_number = 0.05              # initial near-ground-state
        self.rf_leakage_db = sp["rf_leakage_db"]
        self.cooling_rate = sp["cooling_rate"]  # η in 1/s
        self.temperature_k = 1e-6              # ~1 µK in laser-cooled trap
        
        # Residual ZZ floor after Contour 1 detuning:
        # dipole-dipole 1/d^3 tail → ~1% residual after spectral isolation
        self.residual_floor = 0.01

        self.platform_display_name = f"TrappedIonPaulTrap ({self.ion_species}, N={n})"
        self.platform_description = "Paul trap ion chain, Linear RF Paul Trap (Leibfried et al. 2003)"

    # ─── SrOpticalLattice (87Sr) ─────────────────────────────────────────────

    def _init_sr_optical_lattice(self):
        """
        Strontium-87 neutral-atom optical lattice (Boyd et al. 2007, Norcia et al. 2019, Saffman et al. 2016).
        
        Physical parameters from published experimental data:
        - T1 = 60 s = 6e7 µs
        - T2 = 30 s = 3e7 µs
        - 1Q gate error: 1e-4
        - 2Q gate error: 1e-2 (Rydberg blockade)
        - Readout error: 5e-3
        - RF leakage: -80 dBm (very low — neutral atoms)
        - Heating rate: 0 (neutral atoms, no RF trap)
        - UHV chamber temperature: 300 K (laser-cooled 87Sr atoms at ~1 µK, 461/689 nm)
        - Clock frequency: 4.29e14 Hz (1S0 <-> 3P0, λ = 698.4 nm; magic lattice λ = 813 nm)
        - 2D 10×10 lattice (a = 4.0 µm, blockade radius R_b = 5.2 µm -> 4 nearest neighbors)
        """
        n_side = 10  # 10x10 grid = 100 atoms
        T1_us = 6.0e7   # 60 s in µs
        T2_us = 3.0e7   # 30 s in µs
        
        idx = 0
        pos_map = {}
        for r in range(n_side):
            for c in range(n_side):
                t1 = max(1.0, float(self._rng.normal(T1_us, T1_us * 0.01)))
                t2 = max(1.0, min(2.0 * t1, float(self._rng.normal(T2_us, T2_us * 0.01))))
                self.qubits[idx] = Qubit(idx, float(c) * 4.0, float(r) * 4.0, t1, t2,
                                         err_1q=1e-4,
                                         err_2q=1e-2,
                                         err_readout=5e-3)
                pos_map[(r, c)] = idx
                idx += 1
        
        # 2D nearest-neighbor Rydberg connectivity (a = 4.0 µm, R_b = 5.2 µm < sqrt(2)*a)
        zz_base = 0.05  # very low crosstalk (neutral atoms)
        for r in range(n_side):
            for c in range(n_side):
                q = pos_map[(r, c)]
                # Right neighbor
                if c + 1 < n_side:
                    qr = pos_map[(r, c + 1)]
                    zz = float(self._rng.normal(zz_base, 0.005))
                    self.couplers.append(Coupler(q, qr, max(0.001, zz)))
                # Down neighbor
                if r + 1 < n_side:
                    qd = pos_map[(r + 1, c)]
                    zz = float(self._rng.normal(zz_base, 0.005))
                    self.couplers.append(Coupler(q, qd, max(0.001, zz)))
        
        # Platform physics
        self.heating_rate = 0.0            # Neutral atoms — no RF heating
        self.phonon_number = 0.0           # No collective RF phonon bus
        self.rf_leakage_db = -80.0
        self.cooling_rate = 0.0            # No RF phonon cooling buffer needed
        self.temperature_k = 300.0         # UHV chamber temperature (atoms at ~1 µK)
        self.clock_freq_hz = 4.29e14       # 4.29×10^14 Hz (λ = 698.4 nm)
        self.vibrational_modes = []
        
        # Rydberg blockade range-selectivity → residual cross-tenant ZZ ≈ 0
        self.residual_floor = 0.0

        self.platform_display_name = "SrOpticalLattice (100 87Sr atoms, 2D)"
        self.platform_description = "Strontium-87 optical lattice neutral-atom processor, 2D array (Boyd et al. 2007, Saffman et al. 2016)"

    # ─── IBM Eagle ───────────────────────────────────────────────────────────

    def _init_ibm_eagle(self):
        """IBM Eagle: 127Q Heavy-Hex lattice superconducting QPU."""
        n_qubits = 127
        t1_mean, t2_mean, zz_mean = 148.0, 96.0, 4.8  # µs, µs, kHz
        rows, cols = 15, 13
        
        grid_positions = []
        for r in range(rows):
            for c in range(cols):
                is_qubit = False
                if c % 2 == 0:
                    is_qubit = True
                elif c % 4 == 1 and r % 4 == 0:
                    is_qubit = True
                elif c % 4 == 3 and r % 4 == 2:
                    is_qubit = True
                if is_qubit:
                    grid_positions.append((c, r))
        
        grid_positions = grid_positions[:n_qubits]
        coord_to_idx = {pos: i for i, pos in enumerate(grid_positions)}
        
        for i, (c, r) in enumerate(grid_positions):
            t1 = max(1.0, float(self._rng.normal(t1_mean, 12.0)))
            t2 = max(1.0, min(2.0 * t1, float(self._rng.normal(t2_mean, 8.0))))
            self.qubits[i] = Qubit(i, c * 1.5, r * 1.0, t1, t2,
                                    err_1q=1e-3, err_2q=1e-2, err_readout=2e-2)
        
        for (c, r), u in coord_to_idx.items():
            if (c, r + 1) in coord_to_idx:
                v = coord_to_idx[(c, r + 1)]
                self.couplers.append(Coupler(u, v, float(self._rng.normal(zz_mean, 0.2))))
            if c % 2 == 1:
                if (c - 1, r) in coord_to_idx:
                    v1 = coord_to_idx[(c - 1, r)]
                    self.couplers.append(Coupler(u, v1, float(self._rng.normal(zz_mean, 0.2))))
                if (c + 1, r) in coord_to_idx:
                    v2 = coord_to_idx[(c + 1, r)]
                    self.couplers.append(Coupler(u, v2, float(self._rng.normal(zz_mean, 0.2))))
        
        self.heating_rate = 0.0
        self.phonon_number = 0.0
        self.rf_leakage_db = -50.0
        self.cooling_rate = 0.0
        self.temperature_k = 0.015  # 15 mK
        
        # No tunable couplers: Contour 1 cannot detune boundary bonds → full ZZ remains
        self.residual_floor = 1.0

        self.platform_display_name = "Superconducting IBM Eagle (127Q Heavy-Hex)"
        self.platform_description = "IBM Eagle processor, T1≈148µs, ZZ≈4.8kHz"

    # ─── IBM Heron ───────────────────────────────────────────────────────────

    def _init_ibm_heron(self):
        """IBM Heron: 133Q Heavy-Hex with tunable couplers."""
        n_qubits = 133
        t1_mean, t2_mean, zz_mean = 172.0, 115.0, 1.1
        rows, cols = 15, 14
        
        grid_positions = []
        for r in range(rows):
            for c in range(cols):
                is_qubit = False
                if c % 2 == 0:
                    is_qubit = True
                elif c % 4 == 1 and r % 4 == 0:
                    is_qubit = True
                elif c % 4 == 3 and r % 4 == 2:
                    is_qubit = True
                if is_qubit:
                    grid_positions.append((c, r))
        
        grid_positions = grid_positions[:n_qubits]
        coord_to_idx = {pos: i for i, pos in enumerate(grid_positions)}
        
        for i, (c, r) in enumerate(grid_positions):
            t1 = max(1.0, float(self._rng.normal(t1_mean, 12.0)))
            t2 = max(1.0, min(2.0 * t1, float(self._rng.normal(t2_mean, 8.0))))
            self.qubits[i] = Qubit(i, c * 1.5, r * 1.0, t1, t2,
                                    err_1q=1e-3, err_2q=7e-3, err_readout=2e-2)

        for (c, r), u in coord_to_idx.items():
            if (c, r + 1) in coord_to_idx:
                v = coord_to_idx[(c, r + 1)]
                self.couplers.append(Coupler(u, v, float(self._rng.normal(zz_mean, 0.15))))
            if c % 2 == 1:
                if (c - 1, r) in coord_to_idx:
                    v1 = coord_to_idx[(c - 1, r)]
                    self.couplers.append(Coupler(u, v1, float(self._rng.normal(zz_mean, 0.15))))
                if (c + 1, r) in coord_to_idx:
                    v2 = coord_to_idx[(c + 1, r)]
                    self.couplers.append(Coupler(u, v2, float(self._rng.normal(zz_mean, 0.15))))

        self.heating_rate = 0.0
        self.phonon_number = 0.0
        self.rf_leakage_db = -50.0
        self.cooling_rate = 0.0
        self.temperature_k = 0.015
        
        # Tunable couplers: Contour 1 spectral detuning leaves ~15% residual ZZ
        # (1.1 kHz × 0.15 ≈ 0.165 kHz residual, consistent with Paper #1 §5.1)
        self.residual_floor = 0.15

        self.platform_display_name = "Superconducting IBM Heron (133Q Tunable Couplers)"
        self.platform_description = "IBM Heron processor, T1≈172µs, ZZ≈1.1kHz (tunable)"

    # ─── Phonon Physics ───────────────────────────────────────────────────────

    def simulate_phonon_heating(self, dt_s: float = 0.1, active_cooling: bool = True):
        """
        Simulates phonon number evolution for ion trap platforms.
        dn̄/dt = ṅ (heating) - η·n̄ (cooling) when active_cooling is engaged;
        otherwise passive motional heating dn̄/dt = ṅ bounded by trap depth.
        """
        if "trapped_ion" not in self.layout_type:
            return
        ndot = self.heating_rate          # phonons/s
        eta = self.cooling_rate           # cooling rate 1/s
        n0 = self.phonon_number
        
        if active_cooling and eta > 0:
            n_ss = ndot / eta
            # Analytical solution: n̄(t) = n_ss + (n0 - n_ss)*exp(-η*t)
            self.phonon_number = n_ss + (n0 - n_ss) * math.exp(-eta * dt_s)
        else:
            self.phonon_number = min(5.0, n0 + ndot * dt_s)
        
        self.phonon_number = max(0.0, self.phonon_number)

    def reset_all(self, reset_phonons: bool = True):
        for q in self.qubits.values():
            q.reset_state()
        for c in self.couplers:
            c.active = True
            c.detuned = False
            c.zz_crosstalk = c.zz_base
        if reset_phonons:
            if "trapped_ion" in self.layout_type:
                self.phonon_number = 0.05
            else:
                self.phonon_number = 0.0

    def compute_isolation_index(
        self,
        allocations: Dict[int, List[int]],
        defense_l1_active: bool,
    ) -> float:
        """
        Partitioning & Hardware Isolation Efficiency (SPECS §5.1, Paper #1).

            isolation = 100 × (1 − J_post / J_random)

        where:
          J_random = expected cross-tenant ZZ sum under uniform random placement
          J_post   = realized cross-tenant ZZ sum under current partitioning + L1 detuning

        Returns 100.0% for single-tenant, TDM, or uncoupled arrays.
        """
        if not self.couplers:
            return 100.0

        qubit_tenant: Dict[int, int] = {}
        tenant_sizes = []
        for tenant_id, qids in allocations.items():
            if qids:
                tenant_sizes.append(len(qids))
            for qid in qids:
                qubit_tenant[qid] = tenant_id

        if len(tenant_sizes) <= 1:
            return 100.0

        total_assigned = sum(tenant_sizes)
        if total_assigned <= 1:
            return 100.0

        active_pool_zz = 0.0
        cross_zz = 0.0
        for c in self.couplers:
            t1 = qubit_tenant.get(c.q1)
            t2 = qubit_tenant.get(c.q2)
            if t1 is not None and t2 is not None:
                w = abs(c.zz_base)
                active_pool_zz += w
                if t1 != t2:
                    cross_zz += w

        if cross_zz == 0.0 or active_pool_zz == 0.0:
            return 100.0

        # Exact expected fraction of cross-tenant pairs under random qubit assignment
        same_tenant_pairs = sum(n * (n - 1) for n in tenant_sizes)
        p_cross_random = 1.0 - (same_tenant_pairs / (total_assigned * (total_assigned - 1)))
        j_random = active_pool_zz * max(1e-9, p_cross_random)

        j_post = cross_zz * (self.residual_floor if defense_l1_active else 1.0)

        isolation = 100.0 * (1.0 - j_post / j_random)
        return round(max(0.0, min(100.0, isolation)), 1)


    def isolate_faulty_zones(self, tenant_id: int = 0):
        """Isolate boundary couplers around victim tenant to prevent crosstalk propagation."""
        for c in self.couplers:
            q1_tenant = self.qubits[c.q1].active_tenant if c.q1 in self.qubits else None
            q2_tenant = self.qubits[c.q2].active_tenant if c.q2 in self.qubits else None
            if q1_tenant != q2_tenant:
                c.active = False
                c.zz_crosstalk = 0.0

    def get_adjacency_list(self) -> Dict[int, List[int]]:
        adj: Dict[int, List[int]] = {q_id: [] for q_id in self.qubits}
        for c in self.couplers:
            if c.active:
                adj[c.q1].append(c.q2)
                adj[c.q2].append(c.q1)
        return adj

    def get_telemetry_vector(self) -> List[float]:
        """Returns 16-element deterministic physical telemetry vector for Level 4 SPC monitor."""
        metrics = []
        
        # Coherence averages
        avg_t1 = float(np.mean([q.t1 for q in self.qubits.values()]))
        avg_t2 = float(np.mean([q.t2 for q in self.qubits.values()]))
        std_t1 = float(np.std([q.t1 for q in self.qubits.values()]))
        metrics.extend([avg_t1, avg_t2, std_t1])
        
        # Error rates
        avg_1q = float(np.mean([q.err_1q for q in self.qubits.values()]))
        avg_readout = float(np.mean([q.err_readout for q in self.qubits.values()]))
        metrics.extend([avg_1q, avg_readout])
        
        # Active couplers & crosstalk
        active_c = [c.zz_crosstalk for c in self.couplers if c.active]
        avg_zz = float(np.mean(active_c)) if active_c else 0.0
        metrics.append(avg_zz)
        metrics.append(len(active_c) / len(self.couplers) if self.couplers else 1.0)
        
        # Platform-specific physical telemetry
        metrics.append(float(self.phonon_number))
        metrics.append(float(self.heating_rate))
        metrics.append(float(self.rf_leakage_db))
        metrics.append(float(self.temperature_k))
        
        # Operating temperature sensors
        base_temp = float(self.temperature_k)
        if avg_t1 < 100 and "trapped" not in self.layout_type:
            base_temp = max(base_temp, 0.025)
        metrics.extend([base_temp, base_temp + 0.002, max(0.0, base_temp - 0.001)])
        
        # Deterministic padding to 16 dimensions (no random noise injection)
        while len(metrics) < 16:
            metrics.append(0.0)
        
        return metrics[:16]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "layout_type": self.layout_type,
            "platform_display_name": self.platform_display_name,
            "qubits": [q.to_dict() for q in self.qubits.values()],
            "couplers": [c.to_dict() for c in self.couplers],
            "heating_rate": self.heating_rate,
            "phonon_number": round(self.phonon_number, 4),
            "rf_leakage_db": round(self.rf_leakage_db, 1),
            "temperature_k": self.temperature_k,
            "n_vibrational_modes": len(self.vibrational_modes),
        }
