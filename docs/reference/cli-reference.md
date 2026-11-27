# CLI Reference: `qib` (Quantum Isolation Benchmark)

The `qib` command-line utility provides tools for auditing quantum cloud isolation, running multi-tenant scheduling benchmarks, and evaluating financial ROI.

---

## 1. Global Usage

```bash
qib [OPTIONS] COMMAND [ARGS]...
```

### Global Flags
- `--help`: Show CLI help and options.

---

## 2. Commands

### 2.1 `qib benchmark`
Executes comprehensive isolation benchmarks across quantum hardware platforms and attack scenarios.

```bash
qib benchmark [OPTIONS]
```

#### Options:
- `-p, --provider [all|ibm|google|ionq|azure|braket|simulated]`: Target cloud provider or simulation backend. Default: `all`.
- `-s, --scenario [all|crosstalk|prime_probe|rf_leakage|rowhammer|decoherence|environment]`: Threat vector to simulate. Default: `all`.
- `-o, --output PATH`: File path to write the Markdown or HTML isolation report (`.md` or `.html`). Default: `isolation_report.md`.
- `--tenants INTEGER`: Number of concurrent tenants sharing the processor (`>= 1`). Default: `3`.
- `--live`: Attempt live provider connections instead of offline mock calibration.

#### Example:
```bash
qib benchmark --provider simulated --scenario crosstalk --output report.md
```

---

### 2.2 `qib schedule`
Evaluates multi-tenant spatial allocation algorithms on a physical hardware graph.

```bash
qib schedule [OPTIONS]
```

#### Options:
- `--platform [trapped_ion_paul_trap|sr_optical_lattice|eagle|heron]`: Physical QPU architecture.
- `--tenants INTEGER`: Concurrent tenant count (`>= 1`). Default: `2`.
- `--algo [spectral|static|random|tdm]`: Partitioning algorithm. Default: `spectral`.

#### Example:
```bash
qib schedule --platform heron --tenants 3 --algo spectral
```

---

### 2.3 `qib verify-qutip`
Runs formal quantum trajectory and Lindblad Master Equation verification of Contour 3 laser cooling buffer dynamics.

```bash
qib verify-qutip [OPTIONS]
```

#### Options:
- `--tau FLOAT`: Laser cooling duration in seconds. Default: `0.5`.

---

### 2.4 `qib recon` & `qib crosstalk`
Targeted topology/calibration reconnaissance (`qib recon -p <provider> -b <backend> [--live]`) and standalone two-tenant crosstalk audit (`qib crosstalk -p <provider> -b <backend> --test-qubits 0,1,2 --ref-qubits 4,5,6 --intensity [low|medium|high] -o crosstalk_audit.json`).

---

## 3. Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success: All benchmarks passed and isolation bounds were verified. |
| `1` | Error: Invalid configuration, missing dependencies, or unhandled exception. |

