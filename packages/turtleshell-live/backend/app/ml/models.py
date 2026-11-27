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
        arr = np.array(circuit_features[:4], dtype=float).reshape(1, -1)
        if arr.shape[1] < 4:
            raise ValueError("verify_circuit requires at least 4 compiler features")
        pred = self.model.predict(arr)[0]
        score = float(self.model.score_samples(arr)[0])
        
        # SHA-256 hash computation of graph rules + mapping (SPECS §5.2.1)
        f = [float(x) for x in circuit_features[:4]]
        hash_input = f"swap_gates:{f[0]}_gate_depth:{f[1]}_cz_density:{f[2]}_pulse_width:{f[3]}".encode('utf-8')
        circuit_hash = hashlib.sha256(hash_input).hexdigest()
        
        target_ref = reference_hash or self.expected_nominal_hash
        hash_verified = (circuit_hash == target_ref)
        
        is_secure = hash_verified and bool(pred == 1) and score > -0.6
        confidence = float(1.0 / (1.0 + np.exp(-10.0 * (score + 0.5))))
        
        return is_secure, confidence, circuit_hash


class TelemetryAutoencoder:
    """
    TurtleShell Contour 4: Telemetry Anomaly Detector.
    Uses StandardScaler normalization and Principal Component Analysis (PCA) 
    reconstruction error (MSE) on nominal telemetry vectors (SPECS §5.4.2).
    """

    def __init__(self, input_dim: int = 16, n_components: int = 4, layout_type: str = "eagle"):
        self.input_dim = input_dim
        self.n_components = n_components
        self.layout_type = layout_type
        self.scaler = StandardScaler()
        self.pca = PCA(n_components=n_components, random_state=42)
        self.spc_threshold: float = 1.0
        self.set_platform(layout_type)

    def set_platform(self, layout_type: str) -> None:
        """Fit normalization scaler & PCA subspace to the active QPU architecture baseline."""
        self.layout_type = layout_type
        t = (layout_type or "eagle").lower()
        if "trapped_ion" in t:
            nominal_loc = [1e6, 5e5, 2e4, 1e-4, 1e-3, 0.24, 0.70, 0.05, 0.08, -60.0, 1e-6, 1e-6, 0.002001, 0.0, 0.0, 0.0]
            nominal_scale = [3e4, 2e4, 4e3, 2e-5, 2e-4, 0.25, 0.35, 0.05, 0.25, 6.0, 1e-4, 1e-4, 1e-4, 1e-4, 0.0, 0.0]
        elif "sr_optical" in t or "optical_lattice" in t:
            nominal_loc = [6e7, 3e7, 6e5, 1e-4, 5e-3, 0.05, 0.85, 0.0, 0.0, -80.0, 300.0, 300.0, 300.002, 299.999, 0.0, 0.0]
            nominal_scale = [1e6, 5e5, 1e5, 2e-5, 5e-4, 0.03, 0.20, 0.001, 0.001, 2.0, 3.5, 3.5, 3.5, 3.5, 0.0, 0.0]
        elif "heron" in t:
            nominal_loc = [172.0, 115.0, 12.0, 1e-3, 2e-2, 1.1, 0.90, 0.0, 0.0, -50.0, 0.015, 0.015, 0.017, 0.014, 0.0, 0.0]
            nominal_scale = [14.0, 10.0, 3.0, 1e-4, 2e-3, 0.25, 0.15, 0.001, 0.001, 1.0, 0.002, 0.002, 0.002, 0.002, 0.0, 0.0]
        else:
            nominal_loc = [148.0, 96.0, 12.0, 1e-3, 2e-2, 4.8, 0.95, 0.0, 0.0, -50.0, 0.015, 0.015, 0.017, 0.014, 0.0, 0.0]
            nominal_scale = [12.0, 8.0, 3.0, 1e-4, 2e-3, 0.25, 0.10, 0.001, 0.001, 1.0, 0.002, 0.002, 0.002, 0.002, 0.0, 0.0]

        rng = np.random.default_rng(42)
        baseline_raw = rng.normal(
            loc=nominal_loc[:self.input_dim],
            scale=[max(s, 1e-9) for s in nominal_scale[:self.input_dim]],
            size=(1000, self.input_dim)
        )
        scaled_baseline = self.scaler.fit_transform(baseline_raw)
        self.pca = PCA(n_components=min(self.n_components, self.input_dim), random_state=42)
        self.pca.fit(scaled_baseline)

        reconstructed_baseline = self.pca.inverse_transform(self.pca.transform(scaled_baseline))
        baseline_mses = np.mean((scaled_baseline - reconstructed_baseline) ** 2, axis=1)
        self.spc_threshold = float(np.percentile(baseline_mses, 99.5) * 1.25)

    def reconstruct(self, telemetry_vector: List[float]) -> Tuple[float, bool]:
        """
        Standardizes telemetry vector, projects onto principal component subspace, 
        and computes reconstruction MSE.
        
        Returns: (reconstruction_mse, is_anomaly)
        """
        vec = np.array(telemetry_vector, dtype=float).reshape(1, -1)
        if vec.shape[1] == 0:
            raise ValueError("reconstruct requires a non-empty telemetry vector")
        if vec.shape[1] != self.input_dim:
            if vec.shape[1] < self.input_dim:
                vec = np.pad(vec, ((0, 0), (0, self.input_dim - vec.shape[1])), mode='constant', constant_values=0.0)
            else:
                vec = vec[:, :self.input_dim]
                
        scaled_vec = self.scaler.transform(vec)
        compressed = self.pca.transform(scaled_vec)
        reconstructed = self.pca.inverse_transform(compressed)
        
        mse = float(np.mean((scaled_vec - reconstructed) ** 2))
        is_anomaly = mse > self.spc_threshold
        return round(mse, 4), is_anomaly

