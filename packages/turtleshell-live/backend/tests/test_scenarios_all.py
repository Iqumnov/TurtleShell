import pytest
from app.simulation.qpu import VirtualQPU
from app.simulation.scenarios import SimulationScenarios


def test_run_crosstalk_all_platforms():
    platforms = ["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]
    for plat in platforms:
        qpu = VirtualQPU(plat)
        alloc = {0: [0], 1: [1]} if len(qpu.qubits) > 1 else {0: [0]}
        res = SimulationScenarios.run_crosstalk(
            qpu, alloc, intensity=75.0, gate_frequency_hz=2e6
        )
        assert "parallel_fidelity" in res
        assert "fidelity_drop" in res
        assert "phase_error_rad" in res
        assert res["isolated_fidelity"] >= 0.90


def test_run_rowhammer_all_platforms():
    platforms = ["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]
    for plat in platforms:
        qpu = VirtualQPU(plat)
        alloc = {0: [0, 1], 1: [2, 3]} if len(qpu.qubits) > 3 else {0: [0]}
        res = SimulationScenarios.run_rowhammer(
            qpu, alloc, iterations=800
        )
        assert "average_degradation_pct" in res


def test_run_prime_probe_all_platforms():
    platforms = ["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]
    for plat in platforms:
        qpu = VirtualQPU(plat)
        alloc = {0: [0, 1], 1: [2, 3]} if len(qpu.qubits) > 3 else {0: [0]}
        res = SimulationScenarios.run_prime_probe(
            qpu, alloc, delay_us=150.0
        )
        assert "residual_excitation" in res
        assert "phonon_n_bar" in res


def test_run_rf_leakage_all_platforms():
    platforms = ["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]
    for plat in platforms:
        qpu = VirtualQPU(plat)
        alloc = {0: [0, 1], 1: [2, 3]} if len(qpu.qubits) > 3 else {0: [0]}
        res = SimulationScenarios.run_rf_leakage(
            qpu, alloc, snr_db=5.0
        )
        assert "rf_attack_severity" in res
        assert "decode_accuracy" in res
        assert "mutual_information_bits" in res


def test_run_decoherence_all_platforms():
    platforms = ["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]
    for plat in platforms:
        qpu = VirtualQPU(plat)
        qpu.qubits[0].active_tenant = 0
        SimulationScenarios.run_decoherence(qpu, temperature_mk=25.0)
        assert qpu.qubits[0].t1 > 0
        assert qpu.qubits[0].t2 > 0
