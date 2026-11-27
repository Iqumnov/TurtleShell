import pytest
from app.simulation.qpu import VirtualQPU


def test_platform_physical_invariants():
    # 1. TrappedIonPaulTrap: T1=1e6 µs base (with small jitter), heating_rate > 0
    qpu_ion = VirtualQPU("trapped_ion_paul_trap", "Ca40", 20)
    assert abs(qpu_ion.qubits[0].t1_base - 1.0e6) / 1.0e6 < 0.05
    assert qpu_ion.heating_rate > 0

    # 2. SrOpticalLattice: T1=6e7 µs, heating_rate = 0 (neutral atoms)
    qpu_sr = VirtualQPU("sr_optical_lattice")
    assert abs(qpu_sr.qubits[0].t1_base - 6.0e7) / 6.0e7 < 0.05
    assert qpu_sr.heating_rate == 0.0
    assert qpu_sr.clock_freq_hz > 0

    # 3. Superconducting Eagle & Heron: clock_freq_hz = 0
    qpu_e = VirtualQPU("eagle")
    assert qpu_e.clock_freq_hz == 0.0
    qpu_h = VirtualQPU("heron")
    assert qpu_h.clock_freq_hz == 0.0
