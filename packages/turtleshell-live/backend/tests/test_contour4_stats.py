import pytest
import numpy as np
from scipy import stats as scipy_stats
from app.simulation.defense import DifferentialMonitor


def test_contour4_gaussian_false_alarm():
    # Gaussian tail probability at 3.5 sigma = 2 * (1 - norm.cdf(3.5)) ~ 4.65e-4
    prob = 2.0 * (1.0 - scipy_stats.norm.cdf(3.5))
    assert abs(prob - 4.65e-4) < 1e-5


def test_contour4_student_t_threshold():
    # Student-t distribution with df=5 at alpha=10^-3 two-tailed
    thresh = float(scipy_stats.t.ppf(0.9995, df=5))
    assert abs(thresh - 6.8688) < 0.05


def test_contour4_z_score_calculation():
    monitor = DifferentialMonitor(window_size=100)
    # Feed 50 normal observations
    rng = np.random.RandomState(42)
    data = rng.normal(loc=10.0, scale=0.5, size=50)

    for val in data:
        monitor.update(val)

    # Now feed an outlier
    outlier = 15.0  # (15 - 10) / 0.5 = 10 sigma
    res = monitor.update(outlier)

    assert res["z_score"] > 3.5
    assert res["is_anomaly"] is True
    assert res["threat_level"] >= 2
