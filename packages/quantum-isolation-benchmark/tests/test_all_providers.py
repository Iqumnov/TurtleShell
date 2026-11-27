import pytest
import os
from click.testing import CliRunner

from quantum_isolation_benchmark.providers import (
    AzureProvider,
    AWSBraketProvider,
    IonQProvider,
    GenericSimulatedProvider,
    IBMProvider,
    GoogleProvider
)
from quantum_isolation_benchmark.reports import compile_academic_report
from quantum_isolation_benchmark.cli import main


def test_azure_provider():
    p = AzureProvider(mock=True)
    assert p.connect() is True
    assert p.connected is True
    topo = p.get_topology("quantinuum_h1_1")
    assert len(topo["qubits"]) > 0
    cal = p.get_calibration("quantinuum_h1_1")
    assert len(cal["T1"]) > 0


def test_braket_provider():
    p = AWSBraketProvider(mock=True)
    assert p.connect() is True
    assert p.connected is True
    topo = p.get_topology("rigetti_ankaa_2")
    assert len(topo["qubits"]) > 0
    cal = p.get_calibration("rigetti_ankaa_2")
    assert len(cal["T1"]) > 0


def test_ionq_provider():
    p = IonQProvider(mock=True)
    assert p.connect() is True
    assert p.connected is True
    topo = p.get_topology("ionq_aria")
    assert len(topo["qubits"]) == 25
    cal = p.get_calibration("ionq_aria")
    assert len(cal["T1"]) == 25


def test_simulated_provider():
    p = GenericSimulatedProvider(mock=True)
    assert p.connect() is True
    assert p.connected is True

    # 1. Trapped Ion
    topo_ion = p.get_topology("paul_trapped_ion_20")
    assert len(topo_ion["qubits"]) > 0
    cal_ion = p.get_calibration("paul_trapped_ion_20")
    assert len(cal_ion["T1"]) > 0

    # 2. Neutral Atom
    topo_na = p.get_topology("neutral_atom_100")
    assert len(topo_na["qubits"]) > 0


def test_reports_compilation():
    results = [
        {
            "backend": "ibm_brisbane",
            "scenario": "ZZ-Crosstalk",
            "isolated_fidelity": 0.94,
            "parallel_fidelity": 0.88,
            "fidelity_drop_pct": 6.38,
            "shortest_path_hops": 1,
            "mean_crosstalk_khz": 4.8
        },
        {
            "backend": "ibm_brisbane",
            "scenario": "Quantum-Rowhammer",
            "iterations": 600,
            "average_T1_degradation_pct": 12.5,
            "vulnerable_nodes_flagged": 2
        },
        {
            "backend": "ibm_brisbane",
            "scenario": "Prime-and-Probe",
            "delay_us": 80.0,
            "interference_reduction_pct": 5.2,
            "average_T1_us": 148.0,
            "phonon_n_bar": 0.05
        },
        {
            "backend": "ibm_brisbane",
            "scenario": "Environmental-Decoherence",
            "temperature_mk": 25.0,
            "degradation_factor": 0.85,
            "predicted_fidelity": 0.946
        }
    ]

    # Markdown report
    md_content = compile_academic_report(results, format_type="markdown")
    assert "Empirical Analysis of Process Isolation" in md_content
    assert "ZZ-Crosstalk" in md_content
    assert "None" not in md_content

    # HTML report
    html_content = compile_academic_report(results, format_type="html")
    assert "<html>" in html_content
    assert "<strong>" in html_content
    assert "- **" not in html_content
    assert "None" not in html_content
    assert "IEEE P7130" not in html_content


def test_cli_all_subcommands():
    runner = CliRunner()

    # 1. benchmark command across all
    report_file = "test_cli_out.md"
    res_bench = runner.invoke(main, ["benchmark", "--provider", "all", "--output", report_file])
    assert res_bench.exit_code == 0
    assert os.path.exists(report_file)
    os.remove(report_file)

    # 2. recon command
    res_recon = runner.invoke(main, ["recon", "--provider", "ibm", "--backend", "ibm_brisbane"])
    assert res_recon.exit_code == 0
    if os.path.exists("recon_ibm_ibm_brisbane.json"):
        os.remove("recon_ibm_ibm_brisbane.json")
