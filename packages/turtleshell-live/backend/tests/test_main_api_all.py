import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app, global_simulation_loop, sim

client = TestClient(app)


def test_api_configure_and_state_endpoints():
    # 1. GET state
    res_state = client.get("/api/simulation/state")
    assert res_state.status_code == 200
    data_state = res_state.json()
    assert "qpu_type" in data_state

    # 2. POST configure all fields
    config_payload = {
        "qpu_type": "trapped_ion_paul_trap",
        "ion_species": "Sr88",
        "n_ions": 25,
        "tenant_count": 4,
        "scheduling_algo": "spectral",
        "active_scenario": "rf_leakage",
        "crosstalk_intensity": 60.0,
        "gate_frequency_hz": 2e6,
        "rowhammer_iterations": 700,
        "prime_delay_us": 120.0,
        "env_temperature_mk": 20.0,
        "snr_db": 8.0,
        "defense_l1": True,
        "defense_l2": True,
        "defense_l3": True,
        "defense_l4": True,
        "playback_speed": 1.5
    }
    res_conf = client.post("/api/simulation/configure", json=config_payload)
    assert res_conf.status_code == 200
    assert res_conf.json()["status"] == "ok"

    # 3. GET /api/qutip/verify
    res_qutip = client.get("/api/qutip/verify")
    assert res_qutip.status_code == 200
    assert "zz_crosstalk" in res_qutip.json()

    # 4. POST /api/simulation/reset
    res_reset = client.post("/api/simulation/reset")
    assert res_reset.status_code == 200
    assert res_reset.json()["status"] == "ok"


def test_main_simulation_loop_all_combos():
    from app.main import run_single_simulation_tick
    platforms = ["trapped_ion_paul_trap", "sr_optical_lattice", "eagle", "heron"]
    scenarios = ["crosstalk", "rowhammer", "prime_probe", "rf_leakage", "environment"]

    for plat in platforms:
        for scen in scenarios:
            sim.qpu_type = plat
            sim.rebuild_qpu()
            sim.active_scenario = scen
            sim.defense_l1 = True
            sim.defense_l2 = True
            sim.defense_l3 = True
            sim.defense_l4 = True

            payload = run_single_simulation_tick()
            assert "fidelity" in payload
            assert "qpu" in payload
            assert payload["platform_type"] == sim.qpu.layout_type


def test_api_configure_rejects_out_of_range_values():
    """Verify Pydantic bounds reject unphysical or invalid configuration inputs cleanly."""
    bad_payloads = [
        {"n_ions": 1},
        {"utilization": 150.0},
        {"playback_speed": -1.0},
        {"crosstalk_intensity": 200.0},
    ]
    for bad in bad_payloads:
        res = client.post("/api/simulation/configure", json=bad)
        assert res.status_code == 422, f"Expected 422 for {bad}, got {res.status_code}"
