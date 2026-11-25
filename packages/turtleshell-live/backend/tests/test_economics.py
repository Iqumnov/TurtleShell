import pytest
from app.main import sim, sim_lock


def test_economics_model_invariants():
    with sim_lock:
        sim.rebuild_qpu()

        # Cumulative savings must be non-negative
        assert sim.cumulative_savings >= 0.0
        assert sim.cumulative_costs >= 0.0

        # Net benefit formula: savings - costs
        net_benefit = sim.cumulative_savings - sim.cumulative_costs
        assert net_benefit == 0.0
