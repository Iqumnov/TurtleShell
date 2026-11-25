import pytest
from app.simulation.qpu import VirtualQPU, Qubit, Coupler


def test_qpu_qubit_and_coupler_methods():
    q = Qubit(0, 1.0, 2.0, 100.0, 50.0)
    q.t1 = 80.0
    q.gate_count = 15
    q.active_tenant = 2

    q_dict = q.to_dict()
    assert q_dict["id"] == 0
    assert q_dict["t1"] == 80.0
    assert q_dict["gate_count"] == 15
    assert q_dict["active_tenant"] == 2

    q.reset_state()
    assert q.t1 == 100.0
    assert q.active_tenant is None

    c = Coupler(0, 1, 4.8)
    c_dict = c.to_dict()
    assert c_dict["q1"] == 0
    assert c_dict["q2"] == 1
    assert c_dict["zz_crosstalk"] == 4.8


def test_qpu_phonon_heating_and_fault_isolation():
    qpu = VirtualQPU("trapped_ion_paul_trap", "Ca40", 20)

    # Simulate heating for 1 second
    qpu.simulate_phonon_heating(dt_s=1.0)
    assert qpu.phonon_number >= 0.0

    # Test faulty zone isolation
    qpu.qubits[0].active_tenant = 0
    qpu.qubits[1].active_tenant = 1
    qpu.isolate_faulty_zones(tenant_id=0)

    # Isolated boundary couplers should be disabled
    boundary_couplers = [c for c in qpu.couplers if qpu.qubits[c.q1].active_tenant != qpu.qubits[c.q2].active_tenant]
    for c in boundary_couplers:
        assert c.active is False
