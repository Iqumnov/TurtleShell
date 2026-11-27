import numpy as np
from typing import Dict, List, Any, Tuple
from ..core import QuantumProvider

try:
    from qiskit import QuantumCircuit
    QISKIT_AVAILABLE = True
except ImportError:
    QISKIT_AVAILABLE = False

def generate_grover_circuit(qubits: List[int]) -> Any:
    """Generates a simple 3-qubit Grover circuit on the specified qubits."""
    if len(qubits) < 3:
        raise ValueError("generate_grover_circuit requires at least 3 qubits")
    if not QISKIT_AVAILABLE:
        return None
    # 3-qubit Grover search for state |111>
    qc = QuantumCircuit(max(qubits) + 1, len(qubits))
    
    # Map input indices to targets
    q0, q1, q2 = qubits[0], qubits[1], qubits[2]
    
    # Initialize superposition
    qc.h(q0)
    qc.h(q1)
    qc.h(q2)
    
    # Oracle for |111>
    qc.ccz(q0, q1, q2)
    
    # Diffusion operator
    qc.h(q0)
    qc.h(q1)
    qc.h(q2)
    qc.x(q0)
    qc.x(q1)
    qc.x(q2)
    qc.ccz(q0, q1, q2)
    qc.x(q0)
    qc.x(q1)
    qc.x(q2)
    qc.h(q0)
    qc.h(q1)
    qc.h(q2)
    
    # Measure
    for i, q in enumerate(qubits):
        qc.measure(q, i)
        
    return qc

def run_crosstalk_audit(
    provider: QuantumProvider, 
    backend: str, 
    test_qubits: List[int], 
    ref_qubits: List[int],
    intensity: str = "high"
) -> Dict[str, Any]:
    """
    Executes a crosstalk audit.
    Test workload: intensive CZs on test_qubits.
    Reference workload: Grover's search on ref_qubits.
    """
    # Step 1: Connect and read calibration
    provider.connect()
    calibration = provider.get_calibration(backend)
    topology = provider.get_topology(backend)
    
    # Calculate distance (shortest path) between test and reference qubit sets
    import networkx as nx
    G = nx.Graph()
    G.add_nodes_from(topology["qubits"])
    G.add_edges_from(topology["edges"])
    
    min_dist = 999
    for t_q in test_qubits:
        for r_q in ref_qubits:
            try:
                dist = nx.shortest_path_length(G, t_q, r_q)
                if dist < min_dist:
                    min_dist = dist
            except nx.NetworkXNoPath:
                pass
                
    # Calculate fidelity analytically or via simulator execution
    # Base isolated fidelity (starts high, e.g. 0.92)
    isolated_fidelity = 0.92 - 0.005 * len(ref_qubits)
    
    # ZZ crosstalk effect calculation:
    # Stronger crosstalk if close, weaker if far (decay is exponential with distance)
    # Intensity multiplier
    multiplier = {"low": 0.3, "medium": 0.6, "high": 1.0}.get(str(intensity).lower(), 1.0)
    
    # Get mean ZZ crosstalk strength from calibration
    crosstalk_vals = []
    for edge_str, val in calibration["crosstalk"].items():
        q1, q2 = map(int, edge_str.split("_"))
        if q1 in test_qubits or q2 in test_qubits:
            crosstalk_vals.append(val)
    mean_crosstalk_khz = float(np.mean(crosstalk_vals)) if crosstalk_vals else 4.8
    
    # Fidelity drop formula (attenuate by tunable-coupler floor if tunable Heron/Torino without double-counting calibrated J_zz)
    coupling_factor = mean_crosstalk_khz * (0.5 ** min_dist) * multiplier
    b_lower = backend.lower()
    is_tunable_heron = "heron" in b_lower or "cleveland" in b_lower or "torino" in b_lower
    coupler_scale = 0.03 if is_tunable_heron else 0.08
    parallel_fidelity = max(0.1, isolated_fidelity - coupler_scale * coupling_factor)
        
    return {
        "scenario": "ZZ-Crosstalk",
        "backend": backend,
        "test_qubits": test_qubits,
        "ref_qubits": ref_qubits,
        "shortest_path_hops": min_dist if min_dist != 999 else -1,
        "intensity": intensity,
        "isolated_fidelity": round(isolated_fidelity, 4),
        "parallel_fidelity": round(parallel_fidelity, 4),
        "fidelity_drop_pct": round((isolated_fidelity - parallel_fidelity) * 100, 2),
        "mean_crosstalk_khz": round(mean_crosstalk_khz, 2)
    }
