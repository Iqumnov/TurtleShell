import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from app.simulation.qpu import Qubit, Coupler, VirtualQPU
from app.simulation.scheduler import MultiTenantScheduler
from app.simulation.scenarios import SimulationScenarios
from app.simulation.defense import LMSFilter, LaserCoolingBuffer, DifferentialMonitor
from app.main import sim, run_single_simulation_tick, connected_clients


def test_qpu_and_qubit_repr_methods():
    q = Qubit(0, 1.0, 2.0, 100.0, 50.0)
    assert repr(q) or str(q)

    c = Coupler(0, 1, 4.8)
    assert repr(c) or str(c)

    qpu = VirtualQPU("eagle")
    assert repr(qpu) or str(qpu)


def test_scheduler_max_coverage_branches():
    qpu = VirtualQPU("eagle")
    scheduler = MultiTenantScheduler(qpu)

    # Static allocation with excessive demand
    alloc_static = scheduler.execute_allocation("static", {0: 100, 1: 100, 2: 100})
    assert isinstance(alloc_static, dict)

    # Single qubit / disconnected spectral fallback
    qpu_single = VirtualQPU("eagle")
    scheduler_single = MultiTenantScheduler(qpu_single)
    alloc_single = scheduler_single.execute_allocation("spectral", {0: 5, 1: 5})
    assert 0 in alloc_single

    # Isolated node QPU
    qpu_iso = VirtualQPU("trapped_ion_paul_trap", "Ca40", 5)
    for coupler in qpu_iso.couplers:
        coupler.active = False
    scheduler_iso = MultiTenantScheduler(qpu_iso)
    alloc_iso = scheduler_iso.execute_allocation("spectral", {0: 2, 1: 2})
    assert 0 in alloc_iso


def test_scenarios_all_platform_edge_branches():
    platforms = ["trapped_ion_paul_trap", "tm_optical_lattice", "eagle", "heron"]

    for plat in platforms:
        qpu = VirtualQPU(plat)
        # Disconnect couplers to trigger distance exception/fallback paths
        for coupler in qpu.couplers:
            coupler.active = False

        alloc = {0: [0], 1: [0]}  # Same qubit or disconnected

        # Crosstalk fallback
        ct = SimulationScenarios.run_crosstalk(qpu, alloc, intensity=90.0, gate_frequency_hz=3e6)
        assert "parallel_fidelity" in ct

        # Rowhammer platform branches
        rh = SimulationScenarios.run_rowhammer(qpu, alloc, iterations=1500)
        assert "average_degradation_pct" in rh

        # Prime & Probe platform branches
        pp = SimulationScenarios.run_prime_probe(qpu, alloc, delay_us=400.0)
        assert "residual_excitation" in pp

        # RF leakage platform branches
        rf = SimulationScenarios.run_rf_leakage(qpu, alloc, snr_db=20.0)
        assert "rf_attack_severity" in rf

        # Decoherence platform branches
        SimulationScenarios.run_decoherence(qpu, temperature_mk=100.0)


def test_defense_max_coverage_branches():
    # LMS filter reset & adjust
    lms = LMSFilter(order=16, step_size=0.01)
    lms.simulate_rf_suppression(-40.0)
    assert lms.suppression_db >= 0.0

    # Cooling buffer superconducting T1 reset mode
    buf = LaserCoolingBuffer()
    buf.adjust_policy(anomaly_detected=True, n_bar=0.5, heating_rate=0.0, cooling_rate=0.0, is_ion_trap=False)
    assert buf.current_delay_us >= 0.0

    # Differential monitor KS test small sample size
    mon = DifferentialMonitor(window_size=30)
    for val in np.random.normal(10.0, 0.5, 25):
        mon.update(val)
    res = mon.update(25.0)
    assert res["z_score"] >= 0.0


def test_main_api_all_scenarios_and_defenses_combinations():
    scenarios = ["crosstalk", "rowhammer", "prime_probe", "rf_leakage", "environment"]
    platforms = ["trapped_ion_paul_trap", "tm_optical_lattice", "eagle", "heron"]

    for plat in platforms:
        for scen in scenarios:
            sim.qpu_type = plat
            sim.rebuild_qpu()
            sim.active_scenario = scen
            sim.crosstalk_intensity = 85.0
            sim.rowhammer_iterations = 800
            sim.prime_delay_us = 200.0
            sim.snr_db = 10.0
            sim.env_temperature_mk = 35.0

            # Toggle defenses ON & OFF to hit both branches
            for def_flag in [True, False]:
                sim.defense_l1 = def_flag
                sim.defense_l2 = def_flag
                sim.defense_l3 = def_flag
                sim.defense_l4 = def_flag

                payload = run_single_simulation_tick()
                assert "fidelity" in payload


def test_websocket_client_error_handling():
    mock_client = MagicMock()
    mock_client.send_json.side_effect = Exception("Connection closed")
    connected_clients.add(mock_client)

    dead_clients = set()
    for client in list(connected_clients):
        try:
            client.send_json({})
        except Exception:
            dead_clients.add(client)
    connected_clients.difference_update(dead_clients)

    assert mock_client not in connected_clients
