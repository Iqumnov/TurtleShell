import pytest
from app.simulation.defense import LMSFilter


def test_lms_suppression_bounds():
    lms = LMSFilter(order=32, step_size=0.01)

    # Initial suppression is 0
    assert lms.suppression_db == 0.0

    # Simulate RF suppression
    suppressed = lms.simulate_rf_suppression(base_leakage_db=-60.0)

    # Suppression in dB must be bounded in [0, 40]
    assert 0.0 <= lms.suppression_db <= 40.0
    assert suppressed <= -60.0


def test_lms_convergence():
    lms = LMSFilter(order=16, step_size=0.02)
    # Feed continuous signal and verify error decreases
    base_signal = -50.0
    result = lms.simulate_rf_suppression(base_signal)
    assert result <= base_signal
