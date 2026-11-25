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
        
        random.seed(backend)
        np.random.seed(abs(hash(backend)) % (2**32 - 1))
        
        # Simulated Hybrid 16Q specs
        t1 = {}
        t2 = {}
        for q in qubits:
            if q < 8: # Trapped Ytterbium Ions
                t1[q] = max(1e6, float(np.random.normal(5e6, 1e5)))
                t2[q] = max(5e4, float(np.random.normal(1e5, 2e3)))
            else: # Neutral Rubidium Atoms
                t1[q] = max(1e4, float(np.random.normal(1.2e5, 5e3)))
                t2[q] = max(1e3, float(np.random.normal(8e3, 3e2)))
                
        gate_errors = {}
        for q in qubits:
            if q < 8:
                gate_errors[f"g_1q_{q}"] = max(0.0001, float(np.random.normal(0.0005, 0.0001)))
                gate_errors[f"readout_{q}"] = max(0.005, float(np.random.normal(0.015, 0.002)))
            else:
                gate_errors[f"g_1q_{q}"] = max(0.001, float(np.random.normal(0.003, 0.0005)))
                gate_errors[f"readout_{q}"] = max(0.02, float(np.random.normal(0.05, 0.005)))
                
        crosstalk = {}
        for edge in edges:
            u, v = edge
            # Interface and inter-technology crosstalk
            if u < 8 and v < 8: # ion-ion
                gate_errors[f"g_2q_{u}_{v}"] = max(0.001, float(np.random.normal(0.002, 0.0003)))
                crosstalk[f"{u}_{v}"] = max(0.001, float(np.random.normal(0.015 / abs(u - v), 0.001)))
            elif u >= 8 and v >= 8: # atom-atom
                gate_errors[f"g_2q_{u}_{v}"] = max(0.01, float(np.random.normal(0.025, 0.003)))
                crosstalk[f"{u}_{v}"] = max(0.1, float(np.random.normal(0.05, 0.005)))
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
        return [{"00": shots // 2, "11": shots // 2} for _ in circuits]

    def execute_parallel(self, backend: str, circuits_with_qubits: List[Tuple[Any, List[int]]], shots: int = 1000) -> List[Dict[str, int]]:
        return [{"00": shots // 2, "11": shots // 2} for _ in circuits_with_qubits]
