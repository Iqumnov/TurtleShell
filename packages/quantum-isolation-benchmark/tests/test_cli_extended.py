from click.testing import CliRunner
from quantum_isolation_benchmark.cli import main

def test_cli_schedule_command():
    runner = CliRunner()
    result = runner.invoke(main, ["schedule", "--platform", "heron", "--tenants", "3", "--algo", "spectral"])
    assert result.exit_code == 0
    assert "Running multi-tenant allocation" in result.output
    assert "Physical QPU Size:" in result.output
    assert "Hardware Isolation Index:" in result.output

def test_cli_verify_qutip_command():
    runner = CliRunner()
    result = runner.invoke(main, ["verify-qutip", "--tau", "0.5"])
    assert result.exit_code == 0
    assert "Verifying Contour 3 laser cooling dynamics" in result.output
    assert "VERIFIED" in result.output

