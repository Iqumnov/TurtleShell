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
