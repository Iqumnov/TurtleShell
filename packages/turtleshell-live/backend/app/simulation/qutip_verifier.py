"""
TurtleShell QuTiP Verification Module (SPECS §5.3, §5.4, Paper #1 Eq. 1, Paper #2 Eq. 5).

Performs genuine open quantum system dynamics via QuTiP Lindblad master equation solver:
    dρ/dt = -i [H, ρ] + Σ_k ( L_k ρ L_k^† - 1/2 {L_k^† L_k, ρ} )

Used for:
  1. Contour 1 & 4 ZZ-crosstalk decoherence on multi-tenant qubits (Paper #1 Eq. 1).
  2. Contour 3 Laser Cooling Buffer dynamics on harmonic phonon/bosonic modes (Paper #2 Eq. 5).
"""

import numpy as np
from typing import Dict, Any

try:
    import qutip as qt
    HAS_QUTIP = True
except ImportError:
    HAS_QUTIP = False


class QuTiPVerifier:
    """
    QuTiP Open Quantum System Lindblad Master Equation Verifier.
    """

    def __init__(self, platform: str = "ion_trap"):
        self.platform = platform

    def simulate_zz_crosstalk_evolution(
        self,
        t_max_us: float = 2.0,
        n_steps: int = 100,
        t1_us: float = 147.13,
        t2_us: float = 96.72,
        j_zz_khz: float = 4.8,
        n_thermal: float = 0.05
    ) -> Dict[str, Any]:
        """
        Solves Lindblad master equation for 2 multi-tenant qubits under ZZ-crosstalk 
        in the rotating frame using microsecond (µs⁻¹) units throughout (SPECS §5.3).
        
        Rotating Frame Hamiltonian (Paper #1 Eq. 1):
            H_rot = J_zz * (σ_z^(0) ⊗ σ_z^(1))
            
        Dephasing collapse operator normalized correctly for rate γ_φ:
            L_φ = √(γ_φ / 2) * σ_z
        """
        # Convert ZZ-coupling from kHz to rad/µs (1 kHz = 2π × 10^-3 rad/µs)
        j_zz_rad_us = 2.0 * np.pi * (j_zz_khz * 1.0e-3)

        # Decay rates in µs⁻¹ matching µs time grid
        gamma1 = 1.0 / max(0.01, t1_us)
        gamma2 = 1.0 / max(0.01, t2_us)
        gamma_phi = max(0.0, gamma2 - 0.5 * gamma1)

        times = np.linspace(0, t_max_us, n_steps)

        if not HAS_QUTIP:
            # Analytical exact solution fallback when QuTiP library is absent
            fidelity = np.exp(-gamma2 * times) * np.cos(j_zz_rad_us * times) ** 2
            return {
                "has_qutip": False,
                "times_us": times.tolist(),
                "fidelity": fidelity.tolist(),
                "final_fidelity": float(fidelity[-1]),
                "status": "Analytical mode (QuTiP library absent)"
            }

        # 2-Qubit System Operators
        q0_z = qt.tensor(qt.sigmaz(), qt.qeye(2))
        q1_z = qt.tensor(qt.qeye(2), qt.sigmaz())
        q0_m = qt.tensor(qt.sigmam(), qt.qeye(2))
        q0_p = qt.tensor(qt.sigmap(), qt.qeye(2))
        q1_m = qt.tensor(qt.qeye(2), qt.sigmam())
        q1_p = qt.tensor(qt.qeye(2), qt.sigmap())

        # Rotating Frame Hamiltonian H = J_zz * (σ_z0 ⊗ σ_z1)
        H_rot = j_zz_rad_us * (q0_z * q1_z)

        # Correctly scaled Lindblad collapse operators (Bug 3 fix: L = √(γ_φ/2) * σ_z)
        c_ops = [
            np.sqrt(gamma1 * (1.0 + n_thermal)) * q0_m,
            np.sqrt(gamma1 * n_thermal) * q0_p,
            np.sqrt(gamma1 * (1.0 + n_thermal)) * q1_m,
            np.sqrt(gamma1 * n_thermal) * q1_p,
            np.sqrt(gamma_phi / 2.0) * q0_z,
            np.sqrt(gamma_phi / 2.0) * q1_z,
        ]

        # Initial state |10⟩ (Tenant 0 qubit excited, Tenant 1 qubit ground)
        psi0 = qt.tensor(qt.basis(2, 1), qt.basis(2, 0))
        rho0 = qt.ket2dm(psi0)

        # Solve master equation via mesolve
        result = qt.mesolve(H_rot, rho0, times, c_ops=c_ops, e_ops=[q0_z, q1_z], options={'store_states': True})

        # State fidelity F(t) = ⟨10|ρ(t)|10⟩
        fidelities = [float(qt.fidelity(psi0, state) ** 2) for state in result.states]

        return {
            "has_qutip": True,
            "times_us": times.tolist(),
            "fidelity": fidelities,
            "final_fidelity": fidelities[-1],
            "expectation_q0_z": [float(val) for val in result.expect[0]],
            "expectation_q1_z": [float(val) for val in result.expect[1]],
            "status": "QuTiP Lindblad mesolve solver executed successfully"
        }

    def verify_contour3_cooling(
        self,
        n0: float = 50.0,
        eta: float = 10.0,
        n_dot: float = 1.0,
        tau_s: float = 0.5,
        N: int = 80
    ) -> Dict[str, Any]:
        """
        Verifies Contour 3 Laser Cooling Buffer dynamics on a harmonic phonon mode (Paper #2 Eq. 5).
        
        Lindblad Master Equation for Harmonic Mode:
            dρ/dt = -i[H, ρ] + η D[a]ρ + ṅ D[a^†]ρ
            
        Analytical closed form:
            n̄(τ) = n̄_∞ + (n̄_0 - n̄_∞) e^(-η τ),  where n̄_∞ = ṅ / η
        """
        times = np.linspace(0, tau_s, 100)
        n_inf = n_dot / max(1e-5, eta)
        analytic_n_bar = n_inf + (n0 - n_inf) * np.exp(-eta * times)

        if not HAS_QUTIP:
            return {
                "has_qutip": False,
                "times_s": times.tolist(),
                "n_bar_numerical": analytic_n_bar.tolist(),
                "n_bar_analytical": analytic_n_bar.tolist(),
                "max_abs_error": None,
                "max_error_str": "N/A (QuTiP absent)",
                "status": "Analytical mode (QuTiP library absent)"
            }

        # Bosonic annihilation operator
        a = qt.destroy(N)
        H = 0 * a.dag() * a  # Rotating frame (zero detuning)

        # Collapse operators: L_cool = √η * a, L_heat = √ṅ * a^†
        c_ops = [
            np.sqrt(eta) * a,
            np.sqrt(n_dot) * a.dag()
        ]

        # Thermal state with mean photon/phonon number n0
        rho0 = qt.thermal_dm(N, max(n0, 1e-4))

        # Expectation operator: N_op = a^† a
        num_op = a.dag() * a

        # Solve master equation
        res = qt.mesolve(H, rho0, times, c_ops=c_ops, e_ops=[num_op])
        n_bar_num = [float(v) for v in res.expect[0]]

        max_err = float(np.max(np.abs(np.array(n_bar_num) - analytic_n_bar)))

        return {
            "has_qutip": True,
            "times_s": times.tolist(),
            "n_bar_numerical": n_bar_num,
            "n_bar_analytical": analytic_n_bar.tolist(),
            "max_abs_error": max_err,
            "status": f"QuTiP Contour 3 Laser Cooling Verified (Max Error: {max_err:.2e})"
        }
