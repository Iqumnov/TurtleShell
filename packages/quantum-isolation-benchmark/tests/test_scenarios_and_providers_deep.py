import pytest
from quantum_isolation_benchmark.core import QuantumProvider
from quantum_isolation_benchmark.providers import IBMProvider, GoogleProvider
from quantum_isolation_benchmark.scenarios.crosstalk import run_crosstalk_audit
from quantum_isolation_benchmark.scenarios.rowhammer import run_rowhammer_audit
from quantum_isolation_benchmark.scenarios.prime_probe import run_prime_probe_audit
from quantum_isolation_benchmark.scenarios.decoherence import run_decoherence_audit


class DummyProvider(QuantumProvider):
    def connect(self) -> bool:
        self.connected = True
        return True

    def get_topology(self, backend: str):
        return {"qubits": [0, 1], "edges": [(0, 1)]}

    def get_calibration(self, backend: str):
        return {"T1": {0: 100.0, 1: 100.0}, "T2": {0: 50.0, 1: 50.0}}

    def execute_circuits(self, backend: str, circuits, shots: int = 1000):
        return [{"00": 500, "11": 500}]

    def execute_parallel(self, backend: str, circuits_with_qubits, shots: int = 1000):
        return [{"00": 500, "11": 500}]


def test_custom_provider_subclass():
    dp = DummyProvider(mock=True)
    assert dp.connect() is True
    assert dp.get_topology("dummy")["qubits"] == [0, 1]
    assert dp.get_calibration("dummy")["T1"][0] == 100.0
    assert dp.execute_circuits("dummy", [])[0]["00"] == 500
    assert dp.execute_parallel("dummy", [])[0]["00"] == 500


def test_ibm_provider_all_backends():
    p = IBMProvider(mock=True)
    backends = ["ibm_brisbane", "ibm_sherbrooke", "ibm_osaka", "ibm_kyoto", "ibm_heron"]
    for b in backends:
        topo = p.get_topology(b)
        assert "qubits" in topo
        cal = p.get_calibration(b)
        assert "T1" in cal


def test_all_providers_execute_circuits_and_parallel():
    from quantum_isolation_benchmark.providers import (
        IBMProvider, GoogleProvider, AzureProvider, AWSBraketProvider, IonQProvider, GenericSimulatedProvider
    )
    providers = [
        (IBMProvider(mock=True), "ibm_brisbane"),
        (GoogleProvider(mock=True), "google_sycamore"),
        (AzureProvider(mock=True), "quantinuum_h1_1"),
        (AWSBraketProvider(mock=True), "rigetti_ankaa_2"),
        (IonQProvider(mock=True), "ionq_aria"),
        (GenericSimulatedProvider(mock=True), "paul_trapped_ion_20")
    ]

    for p, b in providers:
        p.connect()
        counts = p.execute_circuits(b, [None], shots=100)
        assert len(counts) == 1
        assert "00" in counts[0] or "0" in counts[0] or "0000" in counts[0]

def test_all_scenarios_intensity_variations():
    p = IBMProvider(mock=True)
    for intens in ["low", "medium", "high"]:
        res = run_crosstalk_audit(p, "ibm_brisbane", [0, 1], [2, 3], intensity=intens)
        assert "parallel_fidelity" in res

    res_rh = run_rowhammer_audit(p, "ibm_brisbane", [0, 1], [2, 3], iterations=1000)
    assert res_rh["iterations"] == 1000

    res_pp = run_prime_probe_audit(p, "ibm_brisbane", [0, 1], delay_us=200.0)
    assert res_pp["delay_us"] == 200.0

    res_dc = run_decoherence_audit(p, "ibm_brisbane", [0, 1], temperature_mk=50.0)
    assert res_dc["temperature_mk"] == 50.0
