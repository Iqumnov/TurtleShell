import random
import numpy as np
from typing import Dict, List, Any, Tuple
from ..core import QuantumProvider

class GenericSimulatedProvider(QuantumProvider):
    """
    Generic Simulated Cloud Provider Adapter.
    Simulates a 16Q dual trapped-ion and neutral-atom hybrid processor.
    """
    
    def connect(self) -> bool:
        self.connected = True
        return True

    def get_topology(self, backend: str) -> Dict[str, Any]:
        b = (backend or "").lower()
        if "ion" in b or "paul" in b:
            n_qubits = 20
            qubits = list(range(n_qubits))
            edges = [(i, j) for i in range(n_qubits) for j in range(i + 1, n_qubits)]
            coordinates = {i: ((i - (n_qubits - 1) / 2.0) * 1.5, 0.0) for i in qubits}
            return {"qubits": qubits, "edges": edges, "coordinates": coordinates}

        if "neutral" in b or "atom" in b or "sr_" in b or "sr-" in b:
            n_side = 10
            qubits = list(range(n_side * n_side))
            edges = []
            coordinates = {}
            for r in range(n_side):
                for c in range(n_side):
                    q_id = r * n_side + c
                    coordinates[q_id] = (c * 4.0, r * 4.0)
                    if c + 1 < n_side:
                        edges.append((q_id, q_id + 1))
                    if r + 1 < n_side:
                        edges.append((q_id, q_id + n_side))
            return {"qubits": qubits, "edges": edges, "coordinates": coordinates}

        # Simulated Hybrid Architecture: 16Q Dual Technology Processor
        # - Q0 to Q7: 8 Trapped Ytterbium Ions in a linear chain (all-to-all)
        # - Q8 to Q15: 8 Neutral Rubidium Atoms in a 2x4 optical tweezer array
        qubits = list(range(16))
        
        edges = []
        # Trapped Ions all-to-all
        for i in range(8):
            for j in range(i + 1, 8):
                edges.append((i, j))
                
        # Neutral Atoms 2x4 grid
        for k in range(8):
            q_id = 8 + k
            r = k // 4
            c = k % 4
            if c + 1 < 4:
                edges.append((q_id, q_id + 1))
            if r + 1 < 2:
                edges.append((q_id, q_id + 4))
                
        # Inter-register interface coupler
        edges.append((3, 11))
        
        # Coordinates
        coordinates = {}
        # Trapped ions
        for i in range(8):
            coordinates[i] = ((i - 3.5) * 2.0, 2.0)
        # Neutral atoms
        for k in range(8):
            q_id = 8 + k
            r = k // 4
            c = k % 4
            coordinates[q_id] = ((c - 1.5) * 4.0, -2.0 + r * 2.2)
            
        return {
            "qubits": qubits,
            "edges": edges,
            "coordinates": coordinates
        }

    def get_calibration(self, backend: str) -> Dict[str, Any]:
        topology = self.get_topology(backend)
        qubits = topology["qubits"]
        edges = topology["edges"]
        
        import zlib
        rng = np.random.default_rng(zlib.crc32(backend.encode("utf-8")))
        
        b = (backend or "").lower()
        n_q = len(qubits)
        t1 = {}
        t2 = {}
        gate_errors = {}
        crosstalk = {}

        if "ion" in b or "paul" in b:
            for q in qubits:
                t1_val = max(1e5, float(rng.normal(1e6, 2e4)))
                t1[q] = t1_val
                t2[q] = min(2.0 * t1_val, max(1e4, float(rng.normal(5e5, 1e4))))
                gate_errors[f"g_1q_{q}"] = 1e-4
                gate_errors[f"readout_{q}"] = 1e-3
            for u, v in edges:
                gate_errors[f"g_2q_{u}_{v}"] = 5e-3
                crosstalk[f"{u}_{v}"] = max(0.001, 2.0 / (abs(u - v) ** 3))
        elif "neutral" in b or "atom" in b or "sr_" in b or "sr-" in b:
            for q in qubits:
                t1_val = max(1e6, float(rng.normal(6e7, 6e5)))
                t1[q] = t1_val
                t2[q] = min(2.0 * t1_val, max(1e6, float(rng.normal(3e7, 3e5))))
                gate_errors[f"g_1q_{q}"] = 1e-4
                gate_errors[f"readout_{q}"] = 5e-3
            for u, v in edges:
                gate_errors[f"g_2q_{u}_{v}"] = 1e-2
                crosstalk[f"{u}_{v}"] = max(0.001, float(rng.normal(0.05, 0.005)))
        else:
            # Simulated Hybrid 16Q specs
            for q in qubits:
                if q < 8: # Trapped Ytterbium Ions
                    t1_val = max(1e6, float(rng.normal(5e6, 1e5)))
                    t1[q] = t1_val
                    t2[q] = min(2.0 * t1_val, max(5e4, float(rng.normal(1e5, 2e3))))
                    gate_errors[f"g_1q_{q}"] = max(0.0001, float(rng.normal(0.0005, 0.0001)))
                    gate_errors[f"readout_{q}"] = max(0.005, float(rng.normal(0.015, 0.002)))
                else: # Neutral Rubidium Atoms
                    t1_val = max(1e4, float(rng.normal(1.2e5, 5e3)))
                    t1[q] = t1_val
                    t2[q] = min(2.0 * t1_val, max(1e3, float(rng.normal(8e3, 3e2))))
                    gate_errors[f"g_1q_{q}"] = max(0.001, float(rng.normal(0.003, 0.0005)))
                    gate_errors[f"readout_{q}"] = max(0.02, float(rng.normal(0.05, 0.005)))

            for u, v in edges:
                if u < 8 and v < 8: # ion-ion
                    gate_errors[f"g_2q_{u}_{v}"] = max(0.001, float(rng.normal(0.002, 0.0003)))
                    crosstalk[f"{u}_{v}"] = max(0.001, float(rng.normal(0.015 / abs(u - v), 0.001)))
                elif u >= 8 and v >= 8: # atom-atom
                    gate_errors[f"g_2q_{u}_{v}"] = max(0.01, float(rng.normal(0.025, 0.003)))
                    crosstalk[f"{u}_{v}"] = max(0.01, float(rng.normal(0.05, 0.005)))
                else: # interface
                    gate_errors[f"g_2q_{u}_{v}"] = 0.08
                    crosstalk[f"{u}_{v}"] = 0.25
                
        return {
            "T1": t1,
            "T2": t2,
            "gate_errors": gate_errors,
            "crosstalk": crosstalk
        }

    def execute_circuits(self, backend: str, circuits: List[Any], shots: int = 1000) -> List[Dict[str, int]]:
        if not self.mock:
            raise RuntimeError("SimulatedCloudProvider supports mock=True only; no live cloud endpoint is configured.")
        return [{"00": shots // 2, "11": shots - shots // 2} for _ in circuits]

    def execute_parallel(self, backend: str, circuits_with_qubits: List[Tuple[Any, List[int]]], shots: int = 1000) -> List[Dict[str, int]]:
        if not self.mock:
            raise RuntimeError("SimulatedCloudProvider supports mock=True only; no live cloud endpoint is configured.")
        return [{"00": shots // 2, "11": shots - shots // 2} for _ in circuits_with_qubits]
