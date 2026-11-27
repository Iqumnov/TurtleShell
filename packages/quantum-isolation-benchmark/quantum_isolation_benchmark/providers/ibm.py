import numpy as np
import random
from typing import Dict, List, Any, Tuple
from ..core import QuantumProvider

# Try importing Qiskit packages, handle gracefully if missing
try:
    from qiskit import QuantumCircuit
    from qiskit_aer import AerSimulator
    from qiskit_ibm_runtime import QiskitRuntimeService
    QISKIT_AVAILABLE = True
except ImportError:
    QISKIT_AVAILABLE = False

class IBMProvider(QuantumProvider):
    """
    IBM Quantum Cloud Provider Adapter.
    Integrates with Qiskit Runtime Service and simulates Eagle and Heron QPUs in mock mode.
    """
    
    def connect(self) -> bool:
        if self.mock:
            self.connected = True
            return True
        if not QISKIT_AVAILABLE:
            raise RuntimeError("Qiskit and qiskit-ibm-runtime are required for live connection.")
        try:
            # Try loading default account
            self.service = QiskitRuntimeService(token=self.api_key)
            self.connected = True
            return True
        except Exception as e:
            print(f"IBM connection failed: {e}. Falling back to mock mode.")
            self.mock = True
            self.connected = True
            return True

    def get_topology(self, backend: str) -> Dict[str, Any]:
        backend_lower = backend.lower()
        
        # Heavy-hex / grid connection
        coordinates = {}
        edges = []
        
        if "heron" in backend_lower or "cleveland" in backend_lower or "torino" in backend_lower:
            # IBM Heron: 133Q Heavy-Hex layout
            n_qubits = 133
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
                coordinates[i] = (c * 1.5, r * 1.0)
                
            for (c, r), u in coord_to_idx.items():
                if (c, r+1) in coord_to_idx:
                    v = coord_to_idx[(c, r+1)]
                    edges.append((u, v))
                if c % 2 == 1:
                    if (c-1, r) in coord_to_idx:
                        v1 = coord_to_idx[(c-1, r)]
                        edges.append((u, v1))
                    if (c+1, r) in coord_to_idx:
                        v2 = coord_to_idx[(c+1, r)]
                        edges.append((u, v2))
                        
        elif "eagle" in backend_lower or "brisbane" in backend_lower or "kyoto" in backend_lower:
            # IBM Eagle: 127Q Heavy-Hex layout
            n_qubits = 127
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
                coordinates[i] = (c * 1.5, r * 1.0)
                
            for (c, r), u in coord_to_idx.items():
                if (c, r+1) in coord_to_idx:
                    v = coord_to_idx[(c, r+1)]
                    edges.append((u, v))
                if c % 2 == 1:
                    if (c-1, r) in coord_to_idx:
                        v1 = coord_to_idx[(c-1, r)]
                        edges.append((u, v1))
                    if (c+1, r) in coord_to_idx:
                        v2 = coord_to_idx[(c+1, r)]
                        edges.append((u, v2))
                        
        else:
            # Other backend fallback (e.g. Condor, Osprey, Falcon etc.)
            if "condor" in backend_lower:
                n_qubits = 1121
                rows, cols = 38, 30
            elif "osprey" in backend_lower:
                n_qubits = 433
                rows, cols = 25, 18
            elif "hummingbird" in backend_lower:
                n_qubits = 65
                rows, cols = 9, 8
            else: # falcon
                n_qubits = 27
                rows, cols = 6, 5
                
            qubit_idx = 0
            for r in range(rows):
                for c in range(cols):
                    if qubit_idx < n_qubits:
                        coordinates[qubit_idx] = (c * 1.5, r * 1.0)
                        qubit_idx += 1
            
            for i in range(n_qubits):
                if i + 1 < n_qubits and (i % cols) != (cols - 1):
                    if (i // cols) % 2 == 0:
                        edges.append((i, i + 1))
                if i + cols < n_qubits:
                    if (i % cols) % 2 == 0 or (i // cols) % 2 == 0:
                        edges.append((i, i + cols))
                        
        return {
            "qubits": list(range(n_qubits)),
            "edges": edges,
            "coordinates": coordinates
        }

    def get_calibration(self, backend: str) -> Dict[str, Any]:
        topology = self.get_topology(backend)
        qubits = topology["qubits"]
        edges = topology["edges"]
        
        backend_lower = backend.lower()
        if "condor" in backend_lower:
            t1_mean = 140.0
            t2_mean = 90.0
            err_1q_mean = 0.0012
            err_2q_mean = 0.015
            readout_mean = 0.025
            is_heron = False
        elif "osprey" in backend_lower:
            t1_mean = 150.0
            t2_mean = 100.0
            err_1q_mean = 0.001
            err_2q_mean = 0.012
            readout_mean = 0.020
            is_heron = False
        elif "heron" in backend_lower or "cleveland" in backend_lower or "torino" in backend_lower:
            t1_mean = 172.0
            t2_mean = 115.0
            err_1q_mean = 0.0005
            err_2q_mean = 0.007
            readout_mean = 0.012
            is_heron = True
        elif "eagle" in backend_lower or "brisbane" in backend_lower or "kyoto" in backend_lower:
            t1_mean = 148.0
            t2_mean = 96.0
            err_1q_mean = 0.001
            err_2q_mean = 0.012
            readout_mean = 0.020
            is_heron = False
        elif "hummingbird" in backend_lower:
            t1_mean = 120.0
            t2_mean = 80.0
            err_1q_mean = 0.0015
            err_2q_mean = 0.018
            readout_mean = 0.030
            is_heron = False
        else: # Falcon or default
            t1_mean = 100.0
            t2_mean = 70.0
            err_1q_mean = 0.002
            err_2q_mean = 0.022
            readout_mean = 0.035
            is_heron = False
        
        # Set deterministic local RNG per backend name without mutating global PRNG state
        import zlib
        rng = np.random.default_rng(zlib.crc32(backend.encode("utf-8")))
        
        t1 = {q: max(30.0, float(rng.normal(t1_mean, 15.0))) for q in qubits}
        t2 = {q: min(2.0 * t1[q], max(15.0, float(rng.normal(t2_mean, 10.0)))) for q in qubits}
        
        gate_errors = {}
        for q in qubits:
            gate_errors[f"x_{q}"] = max(0.0001, float(rng.normal(err_1q_mean, 0.0001)))
            gate_errors[f"readout_{q}"] = max(0.001, float(rng.normal(readout_mean, 0.005)))
            
        crosstalk = {}
        for edge in edges:
            gate_errors[f"ecr_{edge[0]}_{edge[1]}"] = max(0.001, float(rng.normal(err_2q_mean, 0.002)))
            # ZZ crosstalk value in kHz (mean of 4.8 kHz on Eagle, 1.1 kHz with Tunable Couplers on Heron)
            base_zz = 1.1 if is_heron else 4.8
            zz_std = 0.15 if is_heron else 0.2
            crosstalk[f"{edge[0]}_{edge[1]}"] = max(0.1, float(rng.normal(base_zz, zz_std)))
            
        return {
            "T1": t1,
            "T2": t2,
            "gate_errors": gate_errors,
            "crosstalk": crosstalk
        }

    def execute_circuits(self, backend: str, circuits: List[Any], shots: int = 1000) -> List[Dict[str, int]]:
        if self.mock or not QISKIT_AVAILABLE:
            # Simulate circuit execution using Qiskit Aer locally
            if not QISKIT_AVAILABLE:
                # Fallback to analytical counts if Qiskit is missing entirely
                return [{"00": shots // 2, "11": shots // 2} for _ in circuits]
                
            simulator = AerSimulator()
            results = []
            for qc in circuits:
                # Simple transpiled execution
                job = simulator.run(qc, shots=shots)
                results.append(job.result().get_counts())
            return results
        else:
            # Run on actual IBM backend via Runtime Service (supports SamplerV2 and legacy Sampler)
            ibm_backend = self.service.backend(backend)
            try:
                from qiskit_ibm_runtime import SamplerV2 as RuntimeSampler
                is_v2 = True
            except ImportError:
                from qiskit_ibm_runtime import Session, Sampler as RuntimeSampler
                is_v2 = False

            if is_v2:
                sampler = RuntimeSampler(mode=ibm_backend)
                job = sampler.run(circuits, shots=shots)
                result = job.result()
                counts_list = []
                for pub_res in result:
                    data = pub_res.data
                    counts = None
                    for field in ("meas", "c", "cr"):
                        if hasattr(data, field):
                            counts = getattr(data, field).get_counts()
                            break
                    if counts is None:
                        keys = [k for k in (getattr(data, "__dict__", {}).keys() or dir(data)) if not k.startswith("_") and hasattr(getattr(data, k, None), "get_counts")]
                        counts = getattr(data, keys[0]).get_counts() if keys else {}
                    counts_list.append(counts)
                return counts_list
            else:
                with Session(service=self.service, backend=ibm_backend) as session:
                    sampler = RuntimeSampler(session=session)
                    job = sampler.run(circuits, shots=shots)
                    result = job.result()
                    counts_list = []
                    for i in range(len(circuits)):
                        dist = result.quasi_dists[i]
                        counts = {bin(k)[2:].zfill(circuits[i].num_qubits): int(round(v * shots)) for k, v in dist.items()}
                        counts_list.append(counts)
                    return counts_list

    @staticmethod
    def _pack_parallel_circuits(circuits_with_qubits: List[Tuple[Any, List[int]]]):
        from qiskit import QuantumCircuit
        total_qubits = max(max(qubits) for _, qubits in circuits_with_qubits) + 1
        combined_qc = QuantumCircuit(total_qubits, total_qubits)
        for qc, qubits in circuits_with_qubits:
            for item in qc.data:
                instr, qargs, cargs = item.operation, item.qubits, item.clbits
                new_qargs = [combined_qc.qubits[qubits[qc.find_bit(q).index]] for q in qargs]
                new_cargs = [combined_qc.clbits[qubits[qc.find_bit(c).index]] for c in cargs]
                combined_qc.append(instr, new_qargs, new_cargs)
        return combined_qc

    @staticmethod
    def _split_parallel_counts(
        full_counts: Dict[str, int],
        circuits_with_qubits: List[Tuple[Any, List[int]]],
    ) -> List[Dict[str, int]]:
        sub_counts = []
        for _qc, qubits in circuits_with_qubits:
            counts: Dict[str, int] = {}
            for bitstring, count in full_counts.items():
                reversed_bits = bitstring.replace(" ", "")[::-1]
                sub_bitstring = "".join(
                    reversed_bits[q] if q < len(reversed_bits) else "0" for q in qubits
                )[::-1]
                counts[sub_bitstring] = counts.get(sub_bitstring, 0) + count
            sub_counts.append(counts)
        return sub_counts

    def execute_parallel(self, backend: str, circuits_with_qubits: List[Tuple[Any, List[int]]], shots: int = 1000) -> List[Dict[str, int]]:
        if not circuits_with_qubits:
            return []
        if self.mock or not QISKIT_AVAILABLE:
            if not QISKIT_AVAILABLE:
                return [{"00": shots // 2, "11": shots - shots // 2} for _ in circuits_with_qubits]

            combined_qc = self._pack_parallel_circuits(circuits_with_qubits)
            simulator = AerSimulator()
            job = simulator.run(combined_qc, shots=shots)
            full_counts = job.result().get_counts()
            return self._split_parallel_counts(full_counts, circuits_with_qubits)
        else:
            combined_qc = self._pack_parallel_circuits(circuits_with_qubits)
            results = self.execute_circuits(backend, [combined_qc], shots=shots)
            return self._split_parallel_counts(results[0] if results else {}, circuits_with_qubits)
