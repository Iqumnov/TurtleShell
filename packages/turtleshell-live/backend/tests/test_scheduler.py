import pytest
from app.simulation.qpu import VirtualQPU
from app.simulation.scheduler import MultiTenantScheduler


def test_scheduler_allocations_uniqueness_and_capacity():
    qpu = VirtualQPU("eagle")
    scheduler = MultiTenantScheduler(qpu)
    demands = {0: 15, 1: 20, 2: 10}

    alloc = scheduler.execute_allocation("random", demands)

    # All assigned qubits must be unique across tenants
    all_assigned = []
    for tid, q_list in alloc.items():
        all_assigned.extend(q_list)

    assert len(all_assigned) == len(set(all_assigned))
    assert len(all_assigned) <= len(qpu.qubits)


def test_scheduler_spectral_disables_boundary_couplers():
    # Tunable-coupler Heron can detune boundary bonds down to residual_floor (15%)
    qpu_heron = VirtualQPU("heron")
    scheduler_h = MultiTenantScheduler(qpu_heron)
    scheduler_h.execute_allocation("spectral", {0: 20, 1: 20})

    heron_boundary = [
        c for c in qpu_heron.couplers
        if qpu_heron.qubits[c.q1].active_tenant is not None
        and qpu_heron.qubits[c.q2].active_tenant is not None
        and qpu_heron.qubits[c.q1].active_tenant != qpu_heron.qubits[c.q2].active_tenant
    ]
    for c in heron_boundary:
        assert c.active is False
        assert c.zz_crosstalk == pytest.approx(round(c.zz_base * qpu_heron.residual_floor, 6))

    # Fixed-coupler Eagle cannot physically switch off resonator buses (residual_floor = 1.0)
    qpu_eagle = VirtualQPU("eagle")
    scheduler_e = MultiTenantScheduler(qpu_eagle)
    scheduler_e.execute_allocation("spectral", {0: 20, 1: 20})
    for c in qpu_eagle.couplers:
        t1 = qpu_eagle.qubits[c.q1].active_tenant
        t2 = qpu_eagle.qubits[c.q2].active_tenant
        if t1 is not None and t2 is not None and t1 != t2:
            assert c.active is True
            assert c.zz_crosstalk == c.zz_base


def test_scheduler_tdm_mode():
    qpu = VirtualQPU("eagle")
    scheduler = MultiTenantScheduler(qpu)
    demands = {0: 10, 1: 10, 2: 10}

    alloc = scheduler.execute_allocation("tdm", demands)

    # TDM allocates qubits exclusively to tenant 0, other tenants get empty list
    assert len(alloc[0]) == 10
    assert len(alloc[1]) == 0
    assert len(alloc[2]) == 0
