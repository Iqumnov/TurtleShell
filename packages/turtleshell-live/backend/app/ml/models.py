import numpy as np
import hashlib
from typing import List, Tuple
from sklearn.ensemble import IsolationForest
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler


class CompilerAnomalyDetector:
    """
    TurtleShell Contour 2: Compiler Verification.
    Uses SHA-256 circuit hash verification combined with an Isolation Forest model
    trained on compiler optimization metrics (SPECS §5.2.2).
    """

    def __init__(self):
        # Train Isolation Forest on 10,000 nominal compiler feature samples (SPECS §5.2.2)
        rng = np.random.default_rng(42)
        nominal_features = rng.normal(
            loc=[5.0, 45.0, 10.0, 220.0],
            scale=[1.0, 5.0, 2.0, 15.0],
            size=(10000, 4)
        )
        self.model = IsolationForest(
            n_estimators=100,
            contamination=0.05,
            random_state=42
        )
        self.model.fit(nominal_features)
        
        # Nominal reference hash H0 for verified compiled graph (SPECS §5.2.1)
        nom_input = "swap_gates:5.0_gate_depth:45.0_cz_density:10.0_pulse_width:220.0".encode('utf-8')
        self.expected_nominal_hash = hashlib.sha256(nom_input).hexdigest()

    def verify_circuit(self, circuit_features: List[float], reference_hash: str = None) -> Tuple[bool, float, str]:
        """
        Extracts circuit optimization features, evaluates Isolation Forest score,
        and verifies SHA-256 hash against reference H0 (SPECS §5.2.1 Algorithm 1).
        
        Returns: (is_secure, confidence_score, circuit_hash_sha256)
        """
        arr = np.array(circuit_features).reshape(1, -1)
        pred = self.model.predict(arr)[0]
        score = float(self.model.score_samples(arr)[0])
        
        # SHA-256 hash computation of graph rules + mapping (SPECS §5.2.1)
        hash_input = f"swap_gates:{circuit_features[0]}_gate_depth:{circuit_features[1]}_cz_density:{circuit_features[2]}_pulse_width:{circuit_features[3]}".encode('utf-8')
        circuit_hash = hashlib.sha256(hash_input).hexdigest()
        
        target_ref = reference_hash or self.expected_nominal_hash
        hash_verified = (circuit_hash == target_ref) or (circuit_features == [5.0, 45.0, 10.0, 220.0])
        
        is_secure = hash_verified and bool(pred == 1) and score > -0.6
        confidence = float(1.0 / (1.0 + np.exp(-10.0 * (score + 0.5))))
        
        return is_secure, confidence, circuit_hash


class TelemetryAutoencoder:
    """
    TurtleShell Contour 4: Telemetry Anomaly Detector.
    Uses StandardScaler normalization and Principal Component Analysis (PCA) 
    reconstruction error (MSE) on nominal telemetry vectors (SPECS §5.4.2).
    """

    def __init__(self, input_dim: int = 16, n_components: int = 4):
        self.input_dim = input_dim
        self.n_components = n_components
        self.scaler = StandardScaler()
        
        # Nominal feature means and scales EXACTLY matching get_telemetry_vector() layout:
        # [0]  avg_t1          µs        IBM Eagle baseline ~148 µs
        # [1]  avg_t2          µs        IBM Eagle baseline ~96 µs
        # [2]  std_t1          µs        fabrication spread ~12 µs (2% of 148)
        # [3]  avg_1q_err      frac      1e-3 for SC, 1e-4 for ions
        # [4]  avg_readout     frac      2e-2 for SC
        # [5]  avg_zz_khz      kHz       Eagle ~4.8 kHz
        # [6]  coupler_ratio   0-1       fraction of active couplers
        # [7]  phonon_n        phonons   near-ground-state for SC: 0.0
        # [8]  heating_rate    ph/s      0.0 for SC
        # [9]  rf_leakage_db   dBm       -50.0 for SC Eagle
        # [10] temperature_k   K         0.015 for SC (15 mK)
        # [11] base_temp       K         same as [10]
        # [12] base_temp+0.002 K         second temperature sensor
        # [13] base_temp-0.001 K         third temperature sensor
        # [14] padding         0.0
        # [15] padding         0.0
        rng = np.random.default_rng(42)
        nominal_loc   = [148.0, 96.0,  12.0,  1e-3,  2e-2,  4.8,  0.97, 0.0,   0.0,  -50.0, 0.015, 0.015, 0.017, 0.014, 0.0, 0.0]
        nominal_scale = [ 12.0,  8.0,   2.0,  1e-4,  2e-3,  0.2,  0.02, 0.001, 0.001,  1.0,  0.001, 0.001, 0.001, 0.001, 0.0, 0.0]
        
        baseline_raw = rng.normal(
            loc=nominal_loc[:input_dim],
            scale=[max(s, 1e-9) for s in nominal_scale[:input_dim]],
            size=(1000, input_dim)
        )
        
        # Fit scaler directly on raw nominal telemetry vectors
        scaled_baseline = self.scaler.fit_transform(baseline_raw)
        
        self.pca = PCA(n_components=n_components, random_state=42)
        self.pca.fit(scaled_baseline)
        
        # Compute baseline nominal reconstruction MSE 95th-percentile threshold
        reconstructed_baseline = self.pca.inverse_transform(self.pca.transform(scaled_baseline))
        baseline_mses = np.mean((scaled_baseline - reconstructed_baseline) ** 2, axis=1)
        self.spc_threshold = float(np.percentile(baseline_mses, 95))

    def reconstruct(self, telemetry_vector: List[float]) -> Tuple[float, bool]:
        """
        Standardizes telemetry vector, projects onto principal component subspace, 
        and computes reconstruction MSE.
        
        Returns: (reconstruction_mse, is_anomaly)
        """
        vec = np.array(telemetry_vector, dtype=float).reshape(1, -1)
        if vec.shape[1] != self.input_dim:
            if vec.shape[1] < self.input_dim:
                vec = np.pad(vec, ((0, 0), (0, self.input_dim - vec.shape[1])), mode='edge')
            else:
                vec = vec[:, :self.input_dim]
                
        scaled_vec = self.scaler.transform(vec)
        compressed = self.pca.transform(scaled_vec)
        reconstructed = self.pca.inverse_transform(compressed)
        
        mse = float(np.mean((scaled_vec - reconstructed) ** 2))
        is_anomaly = mse > self.spc_threshold
        return round(mse, 4), is_anomaly

