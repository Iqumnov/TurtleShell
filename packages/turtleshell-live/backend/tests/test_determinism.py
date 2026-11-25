import pytest
from app.simulation.qpu import VirtualQPU


def test_determinism_with_fixed_seed():
    qpu1 = VirtualQPU("eagle")
    qpu2 = VirtualQPU("eagle")

    # Qubit layouts and positions must match identically
    dict1 = qpu1.to_dict()
    dict2 = qpu2.to_dict()

    assert len(dict1["qubits"]) == len(dict2["qubits"])
    for q1, q2 in zip(dict1["qubits"], dict2["qubits"]):
        assert q1["x"] == q2["x"]
        assert q1["y"] == q2["y"]
        assert q1["t1"] == q2["t1"]
