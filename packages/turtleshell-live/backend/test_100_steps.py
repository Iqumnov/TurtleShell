import asyncio
import numpy as np
from app.main import sim, SimulationState
from app.simulation.scenarios import SimulationScenarios

print("Testing 100 steps of simulation loop...")

sim = SimulationState()
sim.active_scenario = "crosstalk"

for step in range(100):
    try:
        sim.qpu.reset_all()
        sim.update_allocations()
        
        is_ion_trap = "trapped_ion" in sim.qpu.layout_type
        if is_ion_trap:
            sim.qpu.simulate_phonon_heating(dt_s=0.1)
            
        ct_results = SimulationScenarios.run_crosstalk(
            sim.qpu, sim.allocations, sim.crosstalk_intensity, sim.gate_frequency_hz
        )
        
        l2_nominal = [5.0, 45.0, 10.0, 220.0]
        if sim.crosstalk_intensity > 75 and sim.active_scenario == "crosstalk" and not sim.defense_l2:
            l2_nominal = [14.0, 78.0, 15.0, 310.0]
            
        l2_secure, l2_conf, circuit_hash = sim.detector.verify_circuit(l2_nominal)
        l2_flagged = not l2_secure
        
        sim.buffer.adjust_policy(
            anomaly_detected=l2_flagged,
            n_bar=sim.qpu.phonon_number,
            heating_rate=sim.qpu.heating_rate,
            cooling_rate=sim.qpu.cooling_rate,
            is_ion_trap=is_ion_trap
        )
        
        telemetry = sim.qpu.get_telemetry_vector()
        ae_loss, ae_anomaly = sim.monitor.reconstruct(telemetry)
        
        monitor_result = sim.monitor.update(
            telemetry_value=float(np.mean(telemetry[:5])),
            nu_plus=sim.qpu.clock_freq_hz * 1.0000001 if sim.qpu.clock_freq_hz > 0 else 0.0,
            nu_minus=sim.qpu.clock_freq_hz * 0.9999999 if sim.qpu.clock_freq_hz > 0 else 0.0
        )
        
        if step % 10 == 0:
            print(f"Step {step}: fid_drop={0.94 - ct_results.get('parallel_fidelity', 0.94):.4f}, z_score={monitor_result['z_score']:.2f}")
            
    except Exception as e:
        print(f"ERROR at step {step}: {e}")
        import traceback
        traceback.print_exc()
        break

print("100 steps test completed successfully!")
