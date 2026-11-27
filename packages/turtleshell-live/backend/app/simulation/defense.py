import hashlib
import math
import numpy as np
from typing import Dict, List, Any, Tuple, Deque, Optional
from collections import deque
from scipy import stats as scipy_stats

from ..ml.models import TelemetryAutoencoder, CompilerAnomalyDetector


class LMSFilter:
    """
    Contour 1, Component 1.2: Adaptive LMS filter for RF leakage suppression.
    
    Implements the Least Mean Squares adaptive filter algorithm from SPECS §5.1:
    - Filter order M (default 32)
    - Step size µ (default 0.01)
    - Converges in ~10ms at typical parameters
    - Suppresses RF leakage by 20-30 dB
    
    e(k) = L(k) - F[u(k)]
    w(k+1) = w(k) + 2µ × e(k) × u(k)
    """
    
    def __init__(self, order: int = 32, step_size: float = 0.01):
        self.M = max(8, min(128, order))
        self.mu = max(0.001, min(0.1, step_size))
        
        # Filter weights and signal buffer
        self.weights = np.zeros(self.M)
        self.signal_buffer = np.zeros(self.M)
        
        # Metrics
        self.suppression_db: float = 0.0
        self.converged: bool = False
        self._step_count: int = 0
        self._mse_history: List[float] = []
        self._input_power_history: List[float] = []
        # Local RNG for AWGN noise on RF line (seed 7, never touches global stream)
        self._rng = np.random.default_rng(7)
    
    def update(self, desired: float, input_signal: float) -> Tuple[float, float]:
        """
        LMS update step.
        
        Args:
            desired: The desired (reference) signal L(k)
            input_signal: The input signal u(k)
        
        Returns:
            (error, suppression_db): filtered error and current suppression level
        """
        # Shift signal buffer
        self.signal_buffer = np.roll(self.signal_buffer, 1)
        self.signal_buffer[0] = input_signal
        
        # Filter output: F[u(k)] = w^T · u
        filtered_output = float(np.dot(self.weights, self.signal_buffer))
        
        # Error signal
        error = desired - filtered_output
        
        # Normalized LMS step bound: guarantees stability (2 * mu_eff * ||u||^2 < 1 < 2)
        # across arbitrary filter orders (M=8..128) and signal amplitudes while preserving
        # exact standard LMS step size mu when within the convergence bound.
        norm_sq = float(np.dot(self.signal_buffer, self.signal_buffer)) + 1e-8
        effective_mu = min(self.mu, 0.45 / norm_sq)
        self.weights = self.weights + 2.0 * effective_mu * error * self.signal_buffer
        
        self._step_count += 1
        # Append once to each history (error was double-appended previously — bug fixed)
        self._mse_history.append(error ** 2)
        self._input_power_history.append(input_signal ** 2 + 1e-12)
        if len(self._mse_history) > 100:
            self._mse_history.pop(0)
        if len(self._input_power_history) > 100:
            self._input_power_history.pop(0)
        
        if len(self._mse_history) >= 10:
            recent_mse = float(np.mean(self._mse_history[-10:]))
            input_power = float(np.mean(self._input_power_history[-10:]))
            if input_power > 0 and recent_mse > 0:
                self.suppression_db = max(0.0, 10.0 * math.log10(input_power / (recent_mse + 1e-12)))
                self.suppression_db = min(40.0, self.suppression_db)
            else:
                self.suppression_db = 0.0
            
            # Converged if MSE < 1e-4
            self.converged = recent_mse < 1e-4
        
        return error, self.suppression_db
    
    def simulate_rf_suppression(self, base_leakage_db: float) -> float:
        """
        Simulates LMS adaptive noise cancellation on RF leakage level.
        Models a reference RF drive u(k) canceling a phase-shifted, attenuated
        parasitic leakage signal d(k) on the victim channel (Widrow-Hoff ANC).
        Returns suppressed leakage level in dB.
        """
        omega = 2 * math.pi * 1e6  # 1 MHz RF frequency
        for k in range(120):
            t = k * 1.35e-6  # Non-integer period sampling to prevent aliasing
            ref_drive = math.sin(omega * t) + 0.02 * float(self._rng.standard_normal())
            leaked_desired = 0.85 * math.sin(omega * t - 0.35) + 0.03 * float(self._rng.standard_normal())
            self.update(leaked_desired, ref_drive)
        
        # Suppression achieved
        return base_leakage_db - self.suppression_db





class LaserCoolingBuffer:
    """
    Contour 3: Temporal laser cooling buffer for ion trap platforms.
    
    SPECS §5.3 formula (6):
    τ_б = (1/η) × ln[(n̄₀ - ṅ/η) / (n* - ṅ/η)]
    
    For superconducting: uses T1 reset delay (5×T1 relaxation).
    """
    
    def __init__(self):
        # Default parameters
        self.n_star: float = 0.2          # Target phonon number threshold
        self.base_delay_us: float = 750.0  # 5 × T1 (µs) for SC
        self.current_delay_us: float = 750.0
        self.current_tau_s: float = 0.0    # Laser cooling time τ_б in seconds
        self.overhead_pct: float = 12.3
        self.active_reset_enabled: bool = False
        self.cooling_valid: bool = True     # n* > ṅ/η condition
    
    def compute_ion_cooling_time(
        self,
        n_bar_0: float,
        heating_rate: float,
        cooling_rate: float,
        n_star: Optional[float] = None
    ) -> float:
        """
        Compute laser cooling buffer duration from SPECS formula (6):
        τ_б = (1/η) × ln[(n̄₀ - ṅ/η) / (n* - ṅ/η)]
        
        Args:
            n_bar_0: Current mean phonon number n̄₀
            heating_rate: ṅ (phonons/s)
            cooling_rate: η (1/s)
            n_star: Target phonon threshold
        
        Returns:
            τ_б in seconds (or 0 if condition n* > ṅ/η is violated)
        """
        n_star_val = n_star if n_star is not None else self.n_star
        
        # Pre-check: n* > ṅ/η required (steady-state must be below n*)
        if cooling_rate <= 0:
            self.cooling_valid = False
            return 0.0
        
        n_steady = heating_rate / cooling_rate  # ṅ/η
        
        if n_star_val <= n_steady:
            # Cannot reach n* with current parameters
            self.cooling_valid = False
            return 0.0
        
        self.cooling_valid = True
        
        # Avoid log of zero or negative
        numerator = n_bar_0 - n_steady
        denominator = n_star_val - n_steady
        
        if denominator <= 0 or numerator <= denominator:
            # Already below threshold
            self.cooling_valid = True
            return 0.0
        
        # τ_б = (1/η) × ln(numerator/denominator)
        tau = (1.0 / cooling_rate) * math.log(numerator / denominator)
        return max(0.0, tau)
    
    def adjust_policy(
        self,
        anomaly_detected: bool,
        n_bar: float = 0.0,
        heating_rate: float = 0.0,
        cooling_rate: float = 0.0,
        is_ion_trap: bool = False
    ):
        """
        Adaptive policy: adjust buffer duration based on anomaly detection and phonon state.
        """
        if is_ion_trap and cooling_rate > 0:
            # Compute physics-based cooling time
            tau_s = self.compute_ion_cooling_time(
                n_bar_0=n_bar,
                heating_rate=heating_rate,
                cooling_rate=cooling_rate
            )
            self.current_tau_s = tau_s
            self.current_delay_us = tau_s * 1e6  # Convert to µs
        else:
            # Superconducting: 5×T1 adaptive reset
            if anomaly_detected:
                self.current_delay_us = min(1500.0, self.current_delay_us * 1.20)
                self.overhead_pct = min(35.0, self.overhead_pct + 4.5)
            else:
                self.current_delay_us = max(400.0, self.current_delay_us * 0.90)
                self.overhead_pct = max(5.0, self.overhead_pct - 1.2)
            self.current_tau_s = self.current_delay_us * 1e-6
        
        # Update overhead
        if is_ion_trap:
            # Overhead = τ_б / (τ_б + T_session)
            # Approximate T_session as 1 second
            self.overhead_pct = min(50.0, (self.current_tau_s / max(0.01, self.current_tau_s + 1.0)) * 100.0)


CoolingBufferManager = LaserCoolingBuffer


class DifferentialMonitor:
    """
    Contour 4: Differential telemetric monitoring with z-score SPC.
    
    SPECS §5.4 Components:
    - 4.1: Synthetic frequency method (for optical lattice)
    - 4.2: Threshold detector using sliding window z-score
    - 4.3: 4-level threat response
    
    Threat levels from SPECS §5.4.3:
    - Level 0: z < 2.5 → observation only
    - Level 1: 2.5 ≤ z < 3.5 → warning, increase measurement frequency
    - Level 2: z ≥ 3.5 → suspend session, full diagnostics
    - Level 3 (critical): z ≫ 3.5 → emergency shutdown
    """
    
    # Threshold from SPECS
    SIGMA_THRESHOLD = 3.5
    WARNING_THRESHOLD = 2.5
    
    def __init__(self, window_size: int = 600):
        """
        Args:
            window_size: sliding window size (default 600 = 10 min at 1Hz)
        """
        self.window_size = window_size
        self.history: Deque[float] = deque(maxlen=window_size)
        
        # SPC state
        self.z_score: float = 0.0
        self.threat_level: int = 0
        self.is_anomaly: bool = False
        self.false_alarm_count: int = 0
        self.detection_count: int = 0
        
        # Autoencoder (kept from original for L4 reconstruction loss)
        self._ae = TelemetryAutoencoder()
        
        # Synthetic frequency tracking (for optical platforms)
        self._nu_plus_history: Deque[float] = deque(maxlen=100)
        self._nu_minus_history: Deque[float] = deque(maxlen=100)
    
    def compute_synthetic_frequency(self, nu_plus: float, nu_minus: float) -> float:
        """
        SPECS §5.4.1: Synthetic frequency method (Zeeman-free mean of opposite m_F transitions).
        ν_syn = (ν+ + ν-) / 2

        Since first-order Zeeman shifts enter with opposite signs on ν± = ν_0 ± Δ_Z + α_2 B²,
        their average cancels the linear magnetic shift while remaining sensitive to:
        - Blackbody radiation / temperature perturbations
        - Lattice vibrations and AC Stark shifts
        - Motional mode heating
        """
        self._nu_plus_history.append(nu_plus)
        self._nu_minus_history.append(nu_minus)
        
        return (nu_plus + nu_minus) / 2.0
    
    def update(self, telemetry_value: float, nu_plus: float = 0.0, nu_minus: float = 0.0) -> Dict[str, Any]:
        """
        SPECS §5.4.2: z-score based anomaly detection.
        
        1. Maintain sliding window of measurements
        2. z = |ν_syn - µ| / σ
        3. Kolmogorov-Smirnov test for Gaussianity
        4. Non-Gaussian: use Student-t with df=5
        """
        self.history.append(telemetry_value)
        
        if len(self.history) < 10:
            return {
                "z_score": 0.0,
                "threat_level": 0,
                "is_anomaly": False,
                "synthetic_freq": 0.0,
                "mu": 0.0,
                "sigma": 0.0,
                "is_gaussian": True,
            }
        
        # Baseline statistics computed strictly over prior observations (arr[:-1]) so
        # Samuelson's inequality (z <= sqrt(n-1) < 3.5 for n <= 13) cannot self-mask spikes.
        arr = np.array(list(self.history))
        baseline = arr[:-1]
        mu = float(np.mean(baseline))
        sigma = float(np.std(baseline))
        
        # Noise floor: prevents division-by-zero when all window values are identical.
        # σ_min = 0.02 ≈ smallest physically resolvable coherence variation (µs).
        sigma = max(0.02, sigma)
        z = abs(telemetry_value - mu) / sigma
        
        self.z_score = z
        
        # Gaussianity check (Kolmogorov-Smirnov) — SPECS §5.4.2
        if len(self.history) >= 30:
            std_data = (arr[-30:] - mu) / max(sigma, 1e-10)
            ks_res = scipy_stats.kstest(std_data, 'norm')
            p_value = float(ks_res.pvalue)
            is_gaussian = p_value >= 0.05
        else:
            is_gaussian = True
        
        # Threshold application
        if is_gaussian:
            threshold = self.SIGMA_THRESHOLD
        else:
            # Student-t distribution with df=5 (heavier tails) — SPECS §5.4.2 (two-tailed alpha=10^-3 -> ~6.87)
            threshold = float(scipy_stats.t.ppf(0.9995, df=5))
        
        self.is_anomaly = z >= threshold
        
        # Threat level assignment — SPECS §5.4.3
        if z < self.WARNING_THRESHOLD:
            self.threat_level = 0
        elif z < threshold:
            self.threat_level = 1
        elif z < threshold * 1.5:
            self.threat_level = 2
        else:
            self.threat_level = 3
        
        if self.is_anomaly:
            self.detection_count += 1
        
        # Synthetic frequency (optical lattice platforms)
        syn_freq = self.compute_synthetic_frequency(nu_plus, nu_minus) if nu_plus > 0 else 0.0
        
        return {
            "z_score": round(z, 4),
            "threat_level": self.threat_level,
            "is_anomaly": self.is_anomaly,
            "synthetic_freq": round(syn_freq, 2),
            "mu": round(mu, 6),
            "sigma": round(sigma, 6),
            "is_gaussian": is_gaussian,
        }
    
    def set_platform(self, layout_type: str) -> None:
        """Calibrate internal autoencoder baseline to the active QPU architecture."""
        if hasattr(self._ae, "set_platform"):
            self._ae.set_platform(layout_type)

    def reconstruct(self, telemetry_vector: List[float]) -> Tuple[float, bool]:
        """
        Autoencoder reconstruction for multi-dimensional anomaly detection.
        Delegates to internal TelemetryAutoencoder.
        """
        return self._ae.reconstruct(telemetry_vector)



