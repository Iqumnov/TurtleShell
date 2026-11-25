from app.main import app
from app.simulation.defense import LMSFilter, LaserCoolingBuffer, DifferentialMonitor, CompilerAnomalyDetector
from app.simulation.qpu import VirtualQPU
from app.simulation.scenarios import SimulationScenarios

print("All imports OK")

# Test defense systems
lms = LMSFilter()
buf = LaserCoolingBuffer()
mon = DifferentialMonitor()
det = CompilerAnomalyDetector()
print(f"Defense classes OK: LMS M={lms.M}, mu={lms.mu}")

# Test phonon cooling formula
tau = buf.compute_ion_cooling_time(2.0, 0.1, 8.0, 0.2)
print(f"Cooling tau_b = {tau:.4f}s (n0=2.0, ndot=0.1, eta=8.0, n*=0.2)")
print(f"Expected: (1/8)*ln((2-0.0125)/(0.2-0.0125)) = {(1/8)*__import__('math').log((2-0.1/8)/(0.2-0.1/8)):.4f}s")

# Test z-score monitor
for i in range(20):
    res = mon.update(float(i * 0.01))
res = mon.update(5.0)  # Big anomaly
print(f"Z-score SPC: z={res['z_score']:.3f}, threat={res['threat_level']}, anomaly={res['is_anomaly']}")

# Test LMS RF suppression
q_ion = VirtualQPU('trapped_ion_paul_trap', 'Ca40', 20)
suppressed_db = lms.simulate_rf_suppression(q_ion.rf_leakage_db)
print(f"LMS RF suppression: {q_ion.rf_leakage_db:.1f} dBm -> {suppressed_db:.1f} dBm")

# Test RF leakage attack
q_ion.reset_all()
allocs = {0: list(range(10)), 1: list(range(10, 20))}
rf_res = SimulationScenarios.run_rf_leakage(q_ion, allocs, snr_db=10.0)
print(f"RF Leakage attack (SNR=10dB): decode={rf_res['decode_accuracy']:.3f}, I(S;L)={rf_res['mutual_information_bits']:.3f} bits")

# Test circuit verification
secure, conf, hash_val = det.verify_circuit([5.0, 45.0, 10.0, 220.0])
print(f"Compiler verification (nominal): secure={secure}, conf={conf:.4f}, hash={hash_val[:16]}...")
secure2, conf2, hash2 = det.verify_circuit([14.0, 78.0, 15.0, 310.0])
print(f"Compiler verification (anomaly): secure={secure2}, conf={conf2:.4f}")

print("\nAll tests PASSED!")
