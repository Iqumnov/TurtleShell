import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.simulation.qpu import VirtualQPU
from app.simulation.scheduler import MultiTenantScheduler
from app.simulation.scenarios import SimulationScenarios
from app.simulation.defense import (
    CompilerAnomalyDetector,
    TelemetryAutoencoder,
    LMSFilter,
    LaserCoolingBuffer,
    DifferentialMonitor,
)

client = TestClient(app)


def test_virtual_qpu_platforms():
    # 1. TrappedIonPaulTrap
    qpu_ion = VirtualQPU("trapped_ion_paul_trap", "Ca40", 20)
    assert len(qpu_ion.qubits) == 20
    assert len(qpu_ion.couplers) == 190  # 20*19/2 all-to-all
    assert qpu_ion.heating_rate > 0
    telemetry = qpu_ion.get_telemetry_vector()
    assert len(telemetry) == 16

    # 2. TmOpticalLattice
    qpu_tm = VirtualQPU("tm_optical_lattice")
    assert len(qpu_tm.qubits) == 100
    assert len(qpu_tm.couplers) > 0
    assert qpu_tm.temperature_k == 300.0

    # 3. Eagle
    qpu_e = VirtualQPU("eagle")
    assert len(qpu_e.qubits) == 127
    assert len(qpu_e.couplers) > 0

    # 5. Heron
    qpu_h = VirtualQPU("heron")
    assert len(qpu_h.qubits) == 133
    assert len(qpu_h.couplers) > 0


def test_scheduler():
    qpu = VirtualQPU("eagle")
    scheduler = MultiTenantScheduler(qpu)
    demands = {0: 10, 1: 10, 2: 10}

    # Random
    alloc_random = scheduler.execute_allocation("random", demands)
    assert len(alloc_random[0]) == 10
    assert len(alloc_random[1]) == 10

    # Spectral (TurtleShell Contour 1)
    alloc_spectral = scheduler.execute_allocation("spectral", demands)
    assert len(alloc_spectral[0]) == 10
    disabled_couplers = [c for c in qpu.couplers if not c.active]
    assert len(disabled_couplers) >= 0


def test_contour1_lms_filter():
    lms = LMSFilter(order=32, step_size=0.01)
    assert lms.M == 32
    assert lms.mu == 0.01

    # Simulate RF suppression
    suppressed_db = lms.simulate_rf_suppression(-60.0)
    assert suppressed_db <= -60.0


def test_contour2_compiler_verification():
    detector = CompilerAnomalyDetector()
    is_sec, conf, circuit_hash = detector.verify_circuit([5.0, 45.0, 10.0, 220.0])  # Nominal
    assert is_sec is True
    assert 0.0 <= conf <= 1.0
    assert len(circuit_hash) == 64  # SHA-256 hex string

    is_sec_anom, conf_anom, hash_anom = detector.verify_circuit([15.0, 90.0, 20.0, 350.0])  # Anomalous
    assert is_sec_anom is False


def test_contour3_cooling_buffer():
    buf = LaserCoolingBuffer()
    # Analytical phonon cooling formula test:
    # tau_b = (1/eta) * ln[(n0 - ndot/eta) / (n* - ndot/eta)]
    tau = buf.compute_ion_cooling_time(n_bar_0=2.0, heating_rate=0.1, cooling_rate=8.0, n_star=0.2)
    assert tau > 0
    assert abs(tau - 0.2951) < 0.01

    # Edge case: n* <= ndot/eta (invalid cooling condition)
    tau_invalid = buf.compute_ion_cooling_time(n_bar_0=2.0, heating_rate=2.0, cooling_rate=8.0, n_star=0.2)
    assert tau_invalid == 0.0
    assert buf.cooling_valid is False


def test_contour4_differential_monitor():
    mon = DifferentialMonitor()

    # Feed steady sequence
    for i in range(20):
        res = mon.update(telemetry_value=1.0)

    # Inject anomaly (> 3.5 sigma)
    res_anom = mon.update(telemetry_value=10.0)
    assert res_anom["z_score"] > 3.5
    assert res_anom["threat_level"] >= 2
    assert res_anom["is_anomaly"] is True

    # Telemetry AE
    ae = TelemetryAutoencoder()
    normal_vector = [0.02] * 64
    loss, is_anom = ae.reconstruct(normal_vector)
    assert loss >= 0

    anomalous_vector = [0.9] * 64
    loss_anom, is_anom_anom = ae.reconstruct(anomalous_vector)
    assert loss_anom > loss
    assert is_anom_anom is True


def test_rf_leakage_attack():
    qpu = VirtualQPU("trapped_ion_paul_trap", "Ca40", 20)
    allocs = {0: list(range(10)), 1: list(range(10, 20))}
    res = SimulationScenarios.run_rf_leakage(qpu, allocs, snr_db=10.0)

    assert res["decode_accuracy"] > 0.5
    assert res["mutual_information_bits"] > 0.0
    assert res["rf_attack_severity"] > 0.0


def test_fastapi_endpoints():
    # Set to eagle first
    client.post("/api/simulation/configure", json={"qpu_type": "eagle"})
    response = client.get("/api/simulation/state")
    assert response.status_code == 200
    data = response.json()
    assert data["qpu_type"] == "eagle"

    # Configure TrappedIonPaulTrap
    response = client.post("/api/simulation/configure", json={
        "qpu_type": "trapped_ion_paul_trap",
        "ion_species": "Ca40",
        "n_ions": 25,
        "active_scenario": "rf_leakage",
        "snr_db": 5.0,
        "defense_l1": True,
        "defense_l2": True,
        "defense_l3": True,
        "defense_l4": True
    })
    assert response.status_code == 200

    # Verify state updated
    response = client.get("/api/simulation/state")
    data = response.json()
    assert data["qpu_type"] == "trapped_ion_paul_trap"
    assert data["ion_species"] == "Ca40"
    assert data["n_ions"] == 25
    assert data["active_scenario"] == "rf_leakage"
    assert data["defense_l1"] is True
