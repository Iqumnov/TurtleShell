import pytest
from app.simulation.qpu import VirtualQPU
from app.simulation.scheduler import MultiTenantScheduler


def test_scheduler_all_algorithms_and_platforms():
    platforms = ["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]
    algos = ["random", "static", "spectral", "tdm", "invalid_fallback"]

    for plat in platforms:
        qpu = VirtualQPU(plat)
        scheduler = MultiTenantScheduler(qpu)
        demands = {0: 5, 1: 5, 2: 5} if len(qpu.qubits) >= 15 else {0: 1}

        for algo in algos:
            alloc = scheduler.execute_allocation(algo, demands)
            assert isinstance(alloc, dict)
            assert 0 in alloc


def test_scheduler_static_and_spectral_edge_cases():
    qpu = VirtualQPU("eagle")
    scheduler = MultiTenantScheduler(qpu)

    # Empty demand
    alloc_empty = scheduler.execute_allocation("spectral", {})
    assert alloc_empty == {}

    # Large demand exceeding total qubits
    alloc_large = scheduler.execute_allocation("spectral", {0: 200, 1: 200})
    assert len(alloc_large[0]) + len(alloc_large[1]) <= len(qpu.qubits)
