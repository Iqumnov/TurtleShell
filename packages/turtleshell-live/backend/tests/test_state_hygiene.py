import pytest
from app.simulation.qpu import VirtualQPU
from app.main import sim, sim_lock


def test_reset_all_restores_qubit_and_physics_state():
    qpu = VirtualQPU("trapped_ion_paul_trap", "Ca40", 20)
    q0 = qpu.qubits[0]

    # Mutate state
    q0.t1 = 100.0
    q0.err_1q = 0.05
    q0.active_tenant = 1
    qpu.phonon_number = 5.0

    # Reset state
    qpu.reset_all()

    assert q0.t1 == q0.t1_base
    assert q0.err_1q == q0.err_1q_base
    assert q0.active_tenant is None
    assert qpu.phonon_number == 0.05  # Restored to initial near-ground-state


def test_rebuild_qpu_resets_defenses():
    with sim_lock:
        sim.rebuild_qpu()
        assert sim.time_step == 0
        assert sim.cumulative_savings == 0.0
        assert sim.cumulative_costs == 0.0
