import math
from collections import deque
import numpy as np
import networkx as nx
from typing import Dict, List, Any
from .qpu import VirtualQPU


def _multi_source_bfs_distances(adj_graph: nx.Graph, sources: List[int]) -> Dict[int, int]:
    """Exact unweighted multi-source BFS shortest-path distances in O(V + E)."""
    distances: Dict[int, int] = {}
    queue: deque = deque()
    for src in sources:
        if src in adj_graph and src not in distances:
            distances[src] = 0
            queue.append(src)
    while queue:
        node = queue.popleft()
        d_next = distances[node] + 1
        for nbr in adj_graph.neighbors(node):
            if nbr not in distances:
                distances[nbr] = d_next
                queue.append(nbr)
    return distances


class SimulationScenarios:
    """
    TurtleShell-RT Attack Engine.
    
    Implements all 5 attack vectors from the SPECS:
    1. CrosstalkAttacker  — ZZ-crosstalk via gate frequency
    2. RowhammerAttacker  — Thermal Rowhammer cycling
    3. PrimeAndProbeAttacker — Phonon/excitation residuals
    4. RFLeakageAttacker  — RF trap side-channel (NEW)
    5. DecoherenceAttacker — Targeted environmental decoherence
    """

    @staticmethod
    def run_crosstalk(
        qpu: VirtualQPU,
        tenant_allocations: Dict[int, List[int]],
        intensity: float,
        gate_frequency_hz: float = 1e6
    ) -> Dict[str, Any]:
        """
        CrosstalkAttacker: Aggressor (Tenant 1) executes intensive gate sequences,
        inducing ZZ dephasing on Victim (Tenant 0) qubits.
        
        Physical model:
        - Phase error: δφ = 2π × Σ J_ij × t  (accumulated over gate sequence)
        - J_ij from QpuCoupler.zz_base (kHz for SC, arbitrary for ions)
        - Fidelity decay: F = F_isolated × exp(-δφ²)
        
        Args:
            intensity: CZ gate density, 0-100 (%)
            gate_frequency_hz: Aggressor gate rate in Hz (1e5 to 1e7)
        """
        t = qpu.layout_type
        t0_qubits = tenant_allocations.get(0, [])
        t1_qubits = tenant_allocations.get(1, [])
        
        if "trapped_ion" in t:
            isolated_fidelity = 0.995
        elif "sr_optical" in t:
            isolated_fidelity = 0.999
        else:
            isolated_fidelity = 0.94
        
        if not t0_qubits or not t1_qubits:
            return {
                "isolated_fidelity": isolated_fidelity,
                "parallel_fidelity": isolated_fidelity,
                "fidelity_drop": 0.0,
                "min_distance_hops": -1,
                "phase_error_rad": 0.0,
                "gate_count_attacker": 0,
            }
        
        G = nx.Graph()
        G.add_nodes_from(qpu.qubits.keys())
        detuned_boundary = False
        for c in qpu.couplers:
            if c.active or (getattr(c, "detuned", False) and c.zz_crosstalk > 0.0):
                G.add_edge(c.q1, c.q2)
                if getattr(c, "detuned", False):
                    detuned_boundary = True
        
        # Multi-source BFS for minimum distance from attacker set to victim set O(V+E)
        if "trapped_ion" in t:
            # 1D linear ion chain index distance
            min_dist = min((abs(q0 - q1) for q0 in t0_qubits for q1 in t1_qubits), default=99)
        else:
            distances = _multi_source_bfs_distances(G, t1_qubits)
            min_dist = min((distances[q0] for q0 in t0_qubits if q0 in distances), default=99)
        
        # Platform-specific base ZZ coupling derived directly from QPU coupler topology
        t0_set = set(t0_qubits)
        t1_set = set(t1_qubits)
        boundary_zz = [
            abs(c.zz_base)
            for c in qpu.couplers
            if (c.q1 in t0_set and c.q2 in t1_set) or (c.q2 in t0_set and c.q1 in t1_set)
        ]
        incident_zz = [
            abs(c.zz_base)
            for c in qpu.couplers
            if c.q1 in t0_set or c.q2 in t0_set or c.q1 in t1_set or c.q2 in t1_set
        ]
        if boundary_zz:
            base_zz = float(np.mean(boundary_zz))
        elif incident_zz:
            base_zz = float(np.mean(incident_zz))
        elif qpu.couplers:
            base_zz = float(np.mean([abs(c.zz_base) for c in qpu.couplers]))
        elif "trapped_ion" in t:
            base_zz = 2.0
        elif "sr_optical" in t:
            base_zz = 0.05
        elif "heron" in t:
            base_zz = 1.1
        else:
            base_zz = 4.8

        # Attenuate by L1 tunable-coupler residual floor when boundary was spectrally detuned
        atten_factor = qpu.residual_floor if (detuned_boundary and qpu.residual_floor < 1.0) else 1.0

        if min_dist == 99 or atten_factor == 0.0:
            parallel_fidelity = isolated_fidelity
            phase_error = 0.0
            gate_count = 0
        else:
            freq_factor = max(0.5, min(3.0, gate_frequency_hz / 1e6))
            gate_count = int(round(500 * freq_factor))  # Fixed-window aggressor pulse count
            window_s = 100.0e-6 * (intensity / 100.0)
            duration_s = window_s * freq_factor

            effective_zz_khz = base_zz * atten_factor * (0.65 ** max(0, min_dist - 1))
            zz_hz = effective_zz_khz * 1e3
            phase_error = min(math.pi, 2 * math.pi * zz_hz * duration_s)

            # Dephasing fidelity loss driven directly by accumulated phase error δφ = 2π J_eff t
            crosstalk_drop = min(0.35, 0.36 * (1.0 - math.exp(-0.25 * (phase_error ** 2))))
            parallel_fidelity = max(0.1, isolated_fidelity - crosstalk_drop)
        
        return {
            "isolated_fidelity": round(isolated_fidelity, 4),
            "parallel_fidelity": round(parallel_fidelity, 4),
            "fidelity_drop": round(max(0.0, (isolated_fidelity - parallel_fidelity) * 100), 2),
            "min_distance_hops": min_dist if min_dist != 99 else -1,
            "phase_error_rad": round(phase_error, 4),
            "gate_count_attacker": gate_count,
        }

    @staticmethod
    def run_rowhammer(
        qpu: VirtualQPU,
        tenant_allocations: Dict[int, List[int]],
        iterations: int
    ) -> Dict[str, Any]:
        """
        RowhammerAttacker: Cyclical CX/CZ gate loops inducing resonance
        in shared buses and degrading T1/T2 of victim qubits.
        
        Algorithm from SPECS §4.6:
        for i in range(N):
            CX(qubits[i], qubits[i+1])
            CZ(qubits[i+1], qubits[i+2])
            measure(qubits[i]); reset(qubits[i])
        """
        t0_qubits = tenant_allocations.get(0, [])
        t1_qubits = tenant_allocations.get(1, [])
        
        if not t0_qubits or not t1_qubits:
            return {"average_degradation_pct": 0.0, "error_rate_increase": 0.0}
        
        t = qpu.layout_type
        if "trapped_ion" in t:
            distances = {}
        else:
            G = nx.Graph()
            G.add_nodes_from(qpu.qubits.keys())
            for c in qpu.couplers:
                if c.active or (getattr(c, "detuned", False) and c.zz_crosstalk > 0.0):
                    G.add_edge(c.q1, c.q2)

            # Multi-source BFS for minimum distances to all aggressor qubits O(V+E)
            distances = _multi_source_bfs_distances(G, t1_qubits)

        total_degrad = 0.0
        count = 0

        for v_q in t0_qubits:
            if "trapped_ion" in t:
                min_dist = min((abs(v_q - a_q) for a_q in t1_qubits), default=99)
            else:
                min_dist = distances.get(v_q, 99)

            if min_dist < 5:
                dist_factor = 1.0 / (max(1, min_dist) ** 2)
                load = iterations / 1000.0
                if "trapped_ion" in t:
                    # Trapped ions: Rowhammer via phonon excitation coupling
                    # Less severe than superconducting (no shared substrate)
                    degrad = min(0.15, 0.08 * load * dist_factor)
                elif "sr_optical" in t:
                    # Neutral atoms: virtually immune to Rowhammer
                    degrad = 0.0
                elif "heron" in t:
                    degrad = min(0.40, 0.35 * load * dist_factor * 0.6)
                else:
                    degrad = min(0.40, 0.35 * load * dist_factor)
                
                qpu.qubits[v_q].t1 = qpu.qubits[v_q].t1_base * (1.0 - degrad)
                qpu.qubits[v_q].t2 = qpu.qubits[v_q].t2_base * (1.0 - degrad)
                qpu.qubits[v_q].err_1q = qpu.qubits[v_q].err_1q_base * (1.0 + 3.0 * degrad)
                
                total_degrad += degrad
                count += 1
        
        avg_degrad = (total_degrad / count) * 100 if count > 0 else 0.0
        # Error rate increase proportional to avg degradation
        error_rate_increase = round(avg_degrad * 0.3, 3)
        
        return {
            "average_degradation_pct": round(avg_degrad, 2),
            "error_rate_increase": error_rate_increase,
        }

    @staticmethod
    def run_prime_probe(
        qpu: VirtualQPU,
        tenant_allocations: Dict[int, List[int]],
        delay_us: float
    ) -> Dict[str, Any]:
        """
        PrimeAndProbeAttacker: Residual phonon/excitation state remains after
        attacker primes the environment; victim reads degraded fidelity.
        
        For ion traps: uses phonon number model.
        For superconducting: uses T1 decay model.
        
        Algorithm from SPECS §4.3:
        1. Prime phase: attacker executes gates → n̄ increases
        2. Delay interval: t_delay
        3. Probe phase: victim runs, fidelity degraded by residual excitation
        """
        t0_qubits = tenant_allocations.get(0, [])
        if not t0_qubits:
            return {"probe_fidelity": 0.90, "residual_excitation": 0.0, "phonon_n_bar": 0.0}
        
        t = qpu.layout_type
        
        if "trapped_ion" in t:
            # Ion trap model: transient motional excitation thermalization over µs probe window
            # After priming, n̄ is elevated and relaxes over optical/sideband thermalization τ ≈ 300 µs
            n_bar_prime = 2.0 + qpu.heating_rate * 0.1
            tau_decay_us = 300.0
            n_bar_residual = n_bar_prime * math.exp(-max(0.0, delay_us) / tau_decay_us)
            
            # Fidelity drop from residual phonons:
            # F ≈ F0 / (1 + 0.3 * n̄_residual) for Lamb-Dicke regime
            base_fidelity = 0.995
            probe_fidelity = max(0.1, base_fidelity / (1.0 + n_bar_residual * 0.3))
            residual_excitation = round(n_bar_residual, 4)
            
            return {
                "probe_fidelity": round(probe_fidelity, 4),
                "residual_excitation": residual_excitation,
                "phonon_n_bar": round(qpu.phonon_number, 4),
                "average_t1_us": round(
                    float(np.mean([qpu.qubits[q].t1 for q in t0_qubits])), 2
                ),
            }
        elif "sr_optical" in t:
            # Optical lattice (87Sr): residual excitation is rapidly cleared by optical pumping / state reset (~1 ms)
            avg_t1 = float(np.mean([qpu.qubits[q].t1 for q in t0_qubits]))
            base_fidelity = 0.94
            initial_excitation = 0.05
            residual_excitation = initial_excitation * math.exp(-delay_us / 1000.0)
            probe_fidelity = max(0.1, base_fidelity - residual_excitation * 0.05)
            
            return {
                "probe_fidelity": round(probe_fidelity, 4),
                "residual_excitation": round(residual_excitation, 4),
                "phonon_n_bar": 0.0,
                "average_t1_us": round(avg_t1, 2),
            }
        else:
            # Superconducting model: T1 decay
            avg_t1 = float(np.mean([qpu.qubits[q].t1 for q in t0_qubits]))
            base_fidelity = 0.90
            initial_excitation = 0.6
            residual_excitation = initial_excitation * math.exp(-delay_us / avg_t1)
            probe_fidelity = max(0.1, base_fidelity - residual_excitation)
            
            return {
                "probe_fidelity": round(probe_fidelity, 4),
                "residual_excitation": round(residual_excitation, 4),
                "phonon_n_bar": 0.0,
                "average_t1_us": round(avg_t1, 2),
            }

    @staticmethod
    def run_rf_leakage(
        qpu: VirtualQPU,
        tenant_allocations: Dict[int, List[int]],
        snr_db: float = -10.0
    ) -> Dict[str, Any]:
        """
        RFLeakageAttacker (NEW): External observer intercepts parasitic RF emission
        from the trap generator and decodes information about qubit operations.
        
        SPECS §4.4 algorithm:
        1. Simulate RF generator with base leakage level (qpu.rf_leakage_db)
        2. Ion motion modulates impedance load → parasitic AM/PM modulation
        3. Observer intercepts with given SNR
        4. Apply linear decoder to estimate gate operations
        
        Returns:
        - decode_accuracy: how accurately attacker can guess operations (0-1)
        - mutual_information: Shannon mutual information I(S;L) in bits
        - leakage_db: effective leakage level after any suppression
        """
        t = qpu.layout_type
        
        # Base leakage level (dBm)
        base_leakage_db = qpu.rf_leakage_db
        
        # Only ion traps have significant RF leakage
        if "trapped_ion" not in t:
            return {
                "decode_accuracy": 0.0,
                "mutual_information_bits": 0.0,
                "leakage_db": base_leakage_db,
                "rf_attack_severity": 0.0,
            }
        
        t0_qubits = tenant_allocations.get(0, [])
        t1_qubits = tenant_allocations.get(1, [])
        
        if not t0_qubits:
            return {
                "decode_accuracy": 0.0,
                "mutual_information_bits": 0.0,
                "leakage_db": base_leakage_db,
                "rf_attack_severity": 0.0,
            }
        
        # Ion motion modulation: each gate operation induces Δ leakage
        gate_induced_leakage = base_leakage_db + 6.0  # +6dB during gate
        
        # SNR at receiver: SNR = signal - noise
        # snr_db is the receiver's SNR above noise floor
        snr_linear = 10.0 ** (snr_db / 10.0)
        
        # Shannon channel capacity: C = log2(1 + SNR) bits
        channel_capacity = math.log2(1.0 + max(0.0, snr_linear))
        
        # Decode accuracy scales with SNR: logistic model
        # At SNR=0dB, accuracy ~50%; at SNR=20dB, accuracy ~95%
        decode_accuracy = 1.0 / (1.0 + math.exp(-(snr_db + 5.0) / 5.0))
        
        # Mutual information (bits per session) — bounded by Shannon channel capacity and gate alphabet
        mutual_info = min(channel_capacity, decode_accuracy * math.log2(max(2, len(t0_qubits))))
        
        # RF attack severity (0-1): how much info leaked about victim's operations
        rf_severity = decode_accuracy * (1.0 - abs(base_leakage_db) / 120.0)
        rf_severity = max(0.0, min(1.0, rf_severity))
        
        return {
            "decode_accuracy": round(decode_accuracy, 4),
            "mutual_information_bits": round(mutual_info, 4),
            "leakage_db": round(gate_induced_leakage, 1),
            "rf_attack_severity": round(rf_severity, 4),
        }

    @staticmethod
    def run_decoherence(
        qpu: VirtualQPU,
        temperature_mk: float,
        decoherence_type: str = "temperature"
    ) -> Dict[str, Any]:
        """
        DecoherenceAttacker: Targeted manipulation of environment
        (temperature, EM field, vibrations) to induce decoherence.
        
        SPECS §4.5: Attacker changes environment parameter →
        affects coherence times T1/T2.
        """
        t = qpu.layout_type
        
        # Platform-specific baseline operating temperatures
        if "trapped_ion" in t:
            # Trapped ions: laser-cooled (~1 uK baseline); temperature perturbation shifts
            # mean thermal phonon occupation smoothly toward equilibrium without unbounded drift.
            delta_temp_mk = max(0.0, temperature_mk - 15.0)
            delta_temp_k = delta_temp_mk * 1e-3

            if delta_temp_k > 0:
                target_phonon = min(5.0, 0.05 + delta_temp_k * 20.0)
                qpu.phonon_number = max(qpu.phonon_number, target_phonon)
                degrad = min(0.35, delta_temp_k * 5.0)
            else:
                degrad = 0.0

            for q in qpu.qubits.values():
                q.t1 = q.t1_base * (1.0 - degrad)
                q.t2 = q.t2_base * (1.0 - degrad)
                
        elif "sr_optical" in t:
            # Neutral atoms (87Sr) are laser-cooled to ~1 uK inside a 300 K UHV glass cell;
            # dilution-fridge mixing-chamber heating (15 mK -> 100 mK) does not affect them.
            degrad = 0.0
            for q in qpu.qubits.values():
                q.t1 = q.t1_base * (1.0 - degrad)
                q.t2 = q.t2_base * (1.0 - degrad)
        else:
            # Superconducting: mixing chamber baseline = 15.0 mK
            base_temp_mk = 15.0
            temp_delta_mk = max(0.0, temperature_mk - base_temp_mk)
            
            # Baseline (temp_delta_mk = 0) -> coherence_factor = 1.0 (0% decay)
            # Higher temp -> exponential thermal photon decoherence
            coherence_factor = float(np.exp(-temp_delta_mk / 8.0))
            
            for q in qpu.qubits.values():
                q.t1 = q.t1_base * coherence_factor
                q.t2 = q.t2_base * coherence_factor
                q.err_1q = q.err_1q_base * (1.0 + (1.0 - coherence_factor) * 5.0)
        
        avg_t1 = float(np.mean([q.t1 for q in qpu.qubits.values()]))
        avg_t2 = float(np.mean([q.t2 for q in qpu.qubits.values()]))
        
        return {
            "avg_t1_after": round(avg_t1, 2),
            "avg_t2_after": round(avg_t2, 2),
            "temperature_mk": temperature_mk,
        }
