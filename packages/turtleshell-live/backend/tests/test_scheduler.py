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
    qpu = VirtualQPU("eagle")
    scheduler = MultiTenantScheduler(qpu)
    demands = {0: 20, 1: 20}

    alloc = scheduler.execute_allocation("spectral", demands)

    # Boundary couplers connecting tenant 0 and tenant 1 must be disabled (active=False, zz_crosstalk=0)
    boundary_couplers = []
    for c in qpu.couplers:
        t1 = qpu.qubits[c.q1].active_tenant
        t2 = qpu.qubits[c.q2].active_tenant
        if t1 is not None and t2 is not None and t1 != t2:
            boundary_couplers.append(c)

    for c in boundary_couplers:
        assert c.active is False
        assert c.zz_crosstalk == 0.0


def test_scheduler_tdm_mode():
    qpu = VirtualQPU("eagle")
    scheduler = MultiTenantScheduler(qpu)
    demands = {0: 10, 1: 10, 2: 10}

    alloc = scheduler.execute_allocation("tdm", demands)

    # TDM allocates qubits exclusively to tenant 0, other tenants get empty list
    assert len(alloc[0]) == 10
    assert len(alloc[1]) == 0
    assert len(alloc[2]) == 0
