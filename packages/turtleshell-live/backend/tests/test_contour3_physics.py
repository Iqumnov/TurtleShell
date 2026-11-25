import math
import pytest
from app.simulation.defense import LaserCoolingBuffer


def test_contour3_formula6_precision():
    buf = LaserCoolingBuffer()
    # SPECS Formula (6): tau_b = (1/eta) * ln[(n0 - ndot/eta) / (n* - ndot/eta)]
    # Parameters: n_bar_0=100, heating_rate=1.0, cooling_rate=10.0, n_star=0.2
    # ndot/eta = 0.1
    # tau_b = (1/10.0) * ln[(100 - 0.1) / (0.2 - 0.1)] = 0.1 * ln(99.9 / 0.1) = 0.1 * ln(999) ~ 0.69068 s
    tau = buf.compute_ion_cooling_time(
        n_bar_0=100.0,
        heating_rate=1.0,
        cooling_rate=10.0,
        n_star=0.2
    )
    expected_tau = (1.0 / 10.0) * math.log((100.0 - 0.1) / (0.2 - 0.1))
    assert abs(tau - expected_tau) < 1e-4
    assert abs(tau - 0.6907) < 0.002
    assert buf.cooling_valid is True


def test_contour3_invalid_cooling_condition():
    buf = LaserCoolingBuffer()
    # Invalid condition: n* <= ndot/eta (n_star=0.1, ndot=1.0, eta=10.0 -> ndot/eta=0.1)
    tau_invalid = buf.compute_ion_cooling_time(
        n_bar_0=100.0,
        heating_rate=1.0,
        cooling_rate=10.0,
        n_star=0.1
    )
    assert tau_invalid == 0.0
    assert buf.cooling_valid is False

    # Valid condition restores cooling_valid to True
    tau_valid = buf.compute_ion_cooling_time(
        n_bar_0=100.0,
        heating_rate=1.0,
        cooling_rate=10.0,
        n_star=0.2
    )
    assert tau_valid > 0
    assert buf.cooling_valid is True


def test_contour3_monotonicity():
    buf = LaserCoolingBuffer()
    # Monotonicity test: larger n0 -> larger tau_b
    tau1 = buf.compute_ion_cooling_time(n_bar_0=10.0, heating_rate=0.1, cooling_rate=8.0, n_star=0.2)
    tau2 = buf.compute_ion_cooling_time(n_bar_0=50.0, heating_rate=0.1, cooling_rate=8.0, n_star=0.2)
    tau3 = buf.compute_ion_cooling_time(n_bar_0=100.0, heating_rate=0.1, cooling_rate=8.0, n_star=0.2)

    assert tau1 < tau2 < tau3
