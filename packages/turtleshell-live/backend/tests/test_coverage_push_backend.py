import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from app.main import sanitize_payload, sim, run_single_simulation_tick, connected_clients
from app.simulation.qpu import VirtualQPU
from app.simulation.scheduler import MultiTenantScheduler
from app.simulation.scenarios import SimulationScenarios
from app.simulation.qutip_verifier import QuTiPVerifier, HAS_QUTIP


def test_sanitize_payload_all_types():
    data = {
        "int_val": np.int64(42),
        "float_val": np.float64(3.14),
        "nan_val": np.nan,
        "inf_val": np.inf,
        "array_val": np.array([1.0, 2.0, 3.0]),
        "list_val": [np.int32(1), np.float32(2.5)],
        "str_val": "test"
    }
    sanitized = sanitize_payload(data)
    assert sanitized["int_val"] == 42
    assert sanitized["float_val"] == 3.14
    assert sanitized["nan_val"] is None
    assert sanitized["inf_val"] is None
    assert sanitized["array_val"] == [1.0, 2.0, 3.0]
    assert sanitized["list_val"] == [1, 2.5]
    assert sanitized["str_val"] == "test"


def test_qpu_adjacency_list():
    qpu = VirtualQPU("eagle")
    adj = qpu.get_adjacency_list()
    assert isinstance(adj, dict)
    assert 0 in adj
    assert len(adj[0]) > 0


def test_scenarios_remaining_branches():
    platforms = ["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]
    for plat in platforms:
        qpu = VirtualQPU(plat)
        alloc = {0: [0, 1], 1: [2, 3]} if len(qpu.qubits) > 3 else {0: [0]}

        # Rowhammer
        rh = SimulationScenarios.run_rowhammer(qpu, alloc, iterations=1200)
        assert "average_degradation_pct" in rh

        # Prime and Probe
        pp = SimulationScenarios.run_prime_probe(qpu, alloc, delay_us=300.0)
        assert "residual_excitation" in pp

        # RF Leakage
        rf = SimulationScenarios.run_rf_leakage(qpu, alloc, snr_db=15.0)
        assert "rf_attack_severity" in rf


def test_scheduler_spectral_disconnected_fallbacks():
    # Test single qubit / small QPU spectral fallback
    qpu_small = VirtualQPU("eagle")
    scheduler = MultiTenantScheduler(qpu_small)
    alloc = scheduler.execute_allocation("spectral", {0: 1, 1: 1})
    assert 0 in alloc


def test_websocket_broadcast_handling():
    mock_ws = MagicMock()
    connected_clients.add(mock_ws)
    payload = run_single_simulation_tick()
    assert payload["time_step"] > 0
    connected_clients.clear()


def test_qutip_verifier_has_qutip_mock():
    mock_qt = MagicMock()
    mock_qt.sigmaz.return_value = MagicMock()
    mock_qt.qeye.return_value = MagicMock()
    mock_qt.sigmam.return_value = MagicMock()
    mock_qt.sigmap.return_value = MagicMock()
    mock_qt.tensor.return_value = MagicMock()
    mock_qt.basis.return_value = MagicMock()
    mock_qt.ket2dm.return_value = MagicMock()
    
    mock_res = MagicMock()
    mock_res.expect = [[1.0], [1.0]]
    mock_res.states = [MagicMock()]
    mock_qt.mesolve.return_value = mock_res
    mock_qt.fidelity.return_value = 0.99

    with patch("app.simulation.qutip_verifier.qt", mock_qt, create=True):
        with patch("app.simulation.qutip_verifier.HAS_QUTIP", True):
            verifier = QuTiPVerifier("ion_trap")
            res_zz = verifier.simulate_zz_crosstalk_evolution(t_max_us=0.5, n_steps=5)
            assert "fidelity" in res_zz

            res_c3 = verifier.verify_contour3_cooling(n0=10.0, eta=5.0, n_dot=1.0, tau_s=0.2)
            assert "times_s" in res_c3
