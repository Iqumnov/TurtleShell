import pytest
from app.simulation.qpu import VirtualQPU
from app.simulation.scenarios import SimulationScenarios


def test_attack_immunities_and_early_returns():
    # 1. Rowhammer on Optical Lattice: 0 degradation (neutral atoms)
    qpu_tm = VirtualQPU("tm_optical_lattice")
    rh_res = SimulationScenarios.run_rowhammer(qpu_tm, {0: [0]}, 600)
    assert rh_res["average_degradation_pct"] == 0.0

    # 2. RF Leakage on Non-Ion Platform (Eagle): 0 decode accuracy
    qpu_e = VirtualQPU("eagle")
    rf_res = SimulationScenarios.run_rf_leakage(qpu_e, {0: [0, 1]}, snr_db=10.0)
    assert rf_res["decode_accuracy"] == 0.0
    assert rf_res["mutual_information_bits"] == 0.0

    # 3. Crosstalk early-return on empty tenant allocations
    ct_empty = SimulationScenarios.run_crosstalk(qpu_e, {}, intensity=80.0)
    assert ct_empty["phase_error_rad"] == 0.0
    assert ct_empty["fidelity_drop"] == 0.0
