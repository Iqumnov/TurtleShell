# Quantum Cloud Isolation Benchmarking Framework (`qib`)

This framework audits commercial and simulated quantum processors to verify multi-tenant process isolation, analyzing crosstalk, rowhammer, temporal interference, and environmental parameters.

## CLI Usage

Verify connectivity and extract topology:
```bash
qib recon --provider ibm --backend ibm_brisbane
```

Execute crosstalk evaluation:
```bash
qib crosstalk --provider ibm --backend ibm_brisbane --test-qubits 15,16,17 --ref-qubits 45,46,47 --intensity high
```

Run full suite benchmarking:
```bash
qib benchmark --provider all --output my_report.md
```
