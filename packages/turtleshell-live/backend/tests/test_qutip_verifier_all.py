import pytest
from app.simulation.qutip_verifier import QuTiPVerifier


def test_qutip_verifier_evolution():
    verifier = QuTiPVerifier("ion_trap")

    # 1. ZZ Crosstalk evolution
    zz_res = verifier.simulate_zz_crosstalk_evolution(
        t_max_us=1.0, n_steps=10, t1_us=100.0, t2_us=50.0, j_zz_khz=5.0
    )
    assert "times_us" in zz_res
    assert "fidelity" in zz_res
    assert len(zz_res["fidelity"]) == 10
    assert 0.0 <= zz_res["final_fidelity"] <= 1.0

    # 2. Contour 3 Cooling verification
    c3_res = verifier.verify_contour3_cooling(
        n0=50.0, eta=10.0, n_dot=1.0, tau_s=0.5
    )
    assert "times_s" in c3_res
    assert "n_bar_analytical" in c3_res
    assert len(c3_res["n_bar_analytical"]) == 100
    if c3_res.get("has_qutip"):
        assert c3_res["max_abs_error"] is not None
        assert c3_res["max_abs_error"] < 1e-3


def test_qutip_zz_crosstalk_matches_exact_liouvillian():
    """Ensure QuTiP solver matches exact scipy Liouvillian fallback within 1e-4."""
    import app.simulation.qutip_verifier as qv

    verifier = qv.QuTiPVerifier("heron")
    if not qv.HAS_QUTIP:
        pytest.skip("QuTiP not installed")

    qutip_res = verifier.simulate_zz_crosstalk_evolution(
        t_max_us=5.0, n_steps=20, t1_us=172.0, t2_us=115.0, j_zz_khz=1.1, n_thermal=0.05
    )
    orig = qv.HAS_QUTIP
    try:
        qv.HAS_QUTIP = False
        exact_res = verifier.simulate_zz_crosstalk_evolution(
            t_max_us=5.0, n_steps=20, t1_us=172.0, t2_us=115.0, j_zz_khz=1.1, n_thermal=0.05
        )
    finally:
        qv.HAS_QUTIP = orig

    max_diff = max(abs(a - b) for a, b in zip(qutip_res["fidelity"], exact_res["fidelity"]))
    assert max_diff < 1e-4


def test_qutip_cooling_zero_rate_no_oom():
    """Ensure eta == 0 pure heating branch computes finite trajectory without OOM."""
    verifier = QuTiPVerifier("ion_trap")
    res = verifier.verify_contour3_cooling(n0=2.0, eta=0.0, n_dot=0.5, tau_s=1.0)
    assert len(res["n_bar_analytical"]) == 100
    assert abs(res["n_bar_analytical"][-1] - 2.5) < 1e-9
    if res.get("has_qutip"):
        assert res["max_abs_error"] is not None
        assert res["max_abs_error"] < 1e-3
