import os
import json
import pytest
from click.testing import CliRunner

from quantum_isolation_benchmark.providers import IBMProvider, GoogleProvider
from quantum_isolation_benchmark.scenarios import (
    run_crosstalk_audit,
    run_rowhammer_audit,
    run_prime_probe_audit,
    run_decoherence_audit,
)
from quantum_isolation_benchmark.cli import main

def test_ibm_provider_mock():
    """Verify that the IBM Provider returns correct layout coordinates and calibration data in mock mode."""
    provider = IBMProvider(mock=True)
    assert provider.connect() is True
    
    # Eagle
    topo_eagle = provider.get_topology("ibm_eagle")
    assert len(topo_eagle["qubits"]) == 127
    assert len(topo_eagle["edges"]) > 0
    assert len(topo_eagle["coordinates"]) == 127
    
    cal_eagle = provider.get_calibration("ibm_eagle")
    assert len(cal_eagle["T1"]) == 127
    assert len(cal_eagle["T2"]) == 127
    assert len(cal_eagle["crosstalk"]) == len(topo_eagle["edges"])

def test_google_provider_mock():
    """Verify that the Google Provider returns the Sycamore 54-qubit layout and calibration."""
    provider = GoogleProvider(mock=True)
    assert provider.connect() is True
    
    topo = provider.get_topology("google_sycamore")
    assert len(topo["qubits"]) == 54
    assert len(topo["edges"]) > 0
    
    cal = provider.get_calibration("google_sycamore")
    assert len(cal["T1"]) == 54

def test_scenarios():
    """Verify scenario math returns physically bounding fidelities and metrics."""
    provider = IBMProvider(mock=True)
    
    # 1. Crosstalk
    res_ct = run_crosstalk_audit(provider, "ibm_brisbane", [0, 1], [4, 5], intensity="high")
    assert res_ct["scenario"] == "ZZ-Crosstalk"
    assert res_ct["isolated_fidelity"] > res_ct["parallel_fidelity"]
    assert res_ct["fidelity_drop_pct"] >= 0.0
    
    # 2. Rowhammer
    res_rh = run_rowhammer_audit(provider, "ibm_brisbane", [0, 1], [2, 3], iterations=500)
    assert res_rh["scenario"] == "Quantum-Rowhammer"
    assert res_rh["average_T1_degradation_pct"] > 0.0
    
    # 3. Prime and Probe
    res_pp = run_prime_probe_audit(provider, "ibm_brisbane", [0, 1, 2], delay_us=50.0)
    assert res_pp["scenario"] == "Prime-and-Probe"
    assert res_pp["reference_fidelity"] < 0.90
    
    # 4. Decoherence
    res_dc = run_decoherence_audit(provider, "ibm_brisbane", [0, 1], temperature_mk=30.0)
    assert res_dc["scenario"] == "Environmental-Decoherence"
    assert res_dc["degradation_factor"] < 1.0

def test_cli_recon():
    """Verify Click CLI recon command."""
    runner = CliRunner()
    result = runner.invoke(main, ["recon", "--provider", "ibm", "--backend", "ibm_brisbane"])
    assert result.exit_code == 0
    assert "Connecting to IBM" in result.output
    assert "Found 127 qubits" in result.output
    
    # Clean up created recon file
    recon_file = "recon_ibm_ibm_brisbane.json"
    if os.path.exists(recon_file):
        os.remove(recon_file)

def test_cli_crosstalk():
    """Verify Click CLI crosstalk command."""
    runner = CliRunner()
    result = runner.invoke(main, [
        "crosstalk", 
        "--provider", "ibm", 
        "--backend", "ibm_brisbane", 
        "--test-qubits", "0,1", 
        "--ref-qubits", "4,5"
    ])
    assert result.exit_code == 0
    assert "Isolated Fidelity:" in result.output
    
    output_file = "crosstalk_ibm_ibm_brisbane.json"
    if os.path.exists(output_file):
        os.remove(output_file)

def test_cli_benchmark():
    """Verify Click CLI global benchmark command."""
    runner = CliRunner()
    report_file = "test_paper_draft.md"
    result = runner.invoke(main, ["benchmark", "--provider", "simulated", "--output", report_file])
    assert result.exit_code == 0
    assert "Commencing global quantum isolation audit" in result.output
    assert os.path.exists(report_file)
    
    with open(report_file, "r") as f:
        content = f.read()
        assert "Abstract" in content
        assert "Methodology" in content
        
    os.remove(report_file)


def test_prime_probe_ion_lower_interference_than_superconducting():
    """Active optical pumping on trapped ions must yield strictly lower residual interference than SC T1 decay."""
    from quantum_isolation_benchmark.providers import IonQProvider
    ibm = IBMProvider(mock=True)
    ionq = IonQProvider(mock=True)

    res_sc = run_prime_probe_audit(ibm, "ibm_brisbane", [0, 1, 2], delay_us=50.0)
    res_ion = run_prime_probe_audit(ionq, "ionq_aria", [0, 1, 2], delay_us=50.0)

    assert res_ion["residual_excitation"] < res_sc["residual_excitation"]
    assert res_ion["reference_fidelity"] > res_sc["reference_fidelity"]


def test_all_providers_enforce_t2_coherence_bound():
    """Verify physical Lindblad coherence limit T2 <= 2*T1 holds across every QIB provider."""
    from quantum_isolation_benchmark.providers import (
        IBMProvider,
        GoogleProvider,
        AWSBraketProvider,
        AzureProvider,
        IonQProvider,
        GenericSimulatedProvider,
    )

    cases = [
        (IBMProvider(mock=True), "ibm_brisbane"),
        (IBMProvider(mock=True), "ibm_heron"),
        (GoogleProvider(mock=True), "google_sycamore"),
        (AWSBraketProvider(mock=True), "aws_braket_rigetti"),
        (AzureProvider(mock=True), "azure_quantinuum_h1"),
        (IonQProvider(mock=True), "ionq_aria"),
        (GenericSimulatedProvider(mock=True), "simulated_hybrid_16q"),
    ]
    for prov, backend in cases:
        prov.connect()
        cal = prov.get_calibration(backend)
        for q, t1_val in cal["T1"].items():
            assert cal["T2"][q] <= 2.0 * t1_val + 1e-9, f"{backend} q={q}: T2={cal['T2'][q]} > 2*T1={2*t1_val}"


def test_rf_leakage_report_formatted_cleanly():
    """Verify RF-Leakage benchmark entries compile cleanly without dumping raw JSON."""
    runner = CliRunner()
    report_file = "test_rf_report.md"
    result = runner.invoke(main, ["benchmark", "--provider", "ionq", "--scenario", "rf_leakage", "--output", report_file])
    assert result.exit_code == 0
    with open(report_file, "r", encoding="utf-8") as f:
        content = f.read()
    os.remove(report_file)
    assert "RF-Leakage" in content
    assert "Shannon mutual information" in content
    assert '{"scenario":' not in content
