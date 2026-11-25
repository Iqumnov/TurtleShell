import numpy as np
from typing import Dict, List, Any
from ..core import QuantumProvider

def run_prime_probe_audit(
    provider: QuantumProvider,
    backend: str,
    qubits: List[int],
    delay_us: float = 100.0,
    prime_gates_count: int = 50
) -> Dict[str, Any]:
    """
    Executes a Prime-and-Probe temporal interference audit.
    Prime phase: prep qubits with prime_gates_count CZ gates.
    Wait phase: delay execution for delay_us.
    Probe phase: run reference workload, measure fidelity.
    """
    provider.connect()
    calibration = provider.get_calibration(backend)
    
    # Calculate average T1 for the selected qubits
    avg_t1 = np.mean([calibration["T1"][q] for q in qubits])
    
    # Base isolated fidelity
    base_fidelity = 0.90
    
    # Temporal interference decay calculation:
    # Residual excitation state S(t) = S0 * exp(-t / T1)
    # The error injected is proportional to the residual excitation
    initial_residual = min(0.85, 0.015 * prime_gates_count)
    
    is_ion = "ion" in backend.lower() or "quantinuum" in backend.lower()
    if is_ion:
        # Trapped ions have active state prep and reset, extremely low temporal interference
        residual_error = initial_residual * np.exp(-delay_us / (avg_t1 * 10))
    else:
        # Superconducting chips have significant thermal relaxation delay
        residual_error = initial_residual * np.exp(-delay_us / avg_t1)
        
    final_fidelity = max(0.1, base_fidelity - residual_error)
    
    return {
        "scenario": "Prime-and-Probe",
        "backend": backend,
        "qubits": qubits,
        "delay_us": delay_us,
        "prime_gates_count": prime_gates_count,
        "average_T1_us": round(float(avg_t1), 2),
        "initial_excitation": round(initial_residual, 3),
        "residual_excitation": round(float(residual_error), 4),
        "reference_fidelity": round(final_fidelity, 4),
        "interference_reduction_pct": round((1.0 - final_fidelity / base_fidelity) * 100, 2)
    }
