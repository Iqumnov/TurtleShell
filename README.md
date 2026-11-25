# TurtleShell

Multi-Contour Process Isolation and Side-Channel Defense Framework for Multi-Tenant Quantum Clouds

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-purple.svg)](https://vitejs.dev/)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24528037.svg)](https://doi.org/10.5281/zenodo.24528037)
[![Live Web Dashboard](https://img.shields.io/badge/Live%20Web-turtleshell.iqumnov.com-emerald.svg)](https://turtleshell.iqumnov.com)
[![Author: Matvei Igumnov](https://img.shields.io/badge/Author-Matvei%20Igumnov-blue.svg)](https://github.com/Iqumnov)

> **Live Interactive Web Application**: [https://turtleshell.iqumnov.com](https://turtleshell.iqumnov.com)  
> Zero-install, client-side real-time interactive physics engine running directly in the browser on Cloudflare Pages. Simulates 4 quantum physical QPU architectures, 5 multi-tenant side-channel attacks, and the 4 defense contours in pure TypeScript with zero backend required, or connects seamlessly to a local Python daemon.

---

## 1. Platform Architecture

TurtleShell provides a multi-contour defense envelope designed to enforce zero-trust spatial and temporal process isolation between concurrent tenants executing on shared Quantum Processing Units (QPUs).

```
+-----------------------------------------------------------------------------------+
|                                TurtleShell Platform                               |
+-----------------------------------------------------------------------------------+
        |                         |                         |                 |
        v                         v                         v                 v
+---------------+         +---------------+         +---------------+   +-----------+
|   Contour 1   |         |   Contour 2   |         |   Contour 3   |   | Contour 4 |
| Physical      |         | Compiler      |         | Buffer Delay  |   | Telemetry |
| Partitioning  |         | Verification  |         | & Thermal Qu. |   | & SPC Mon |
| - Laplacian   |         | - SHA-256     |         | - Laser Cool  |   | - Diff.   |
|   Spectral    |         |   Circuit     |         | - tau_b Calc  |   |   Z-Score |
| - LMS Filter  |         | - Iso-Forest  |         | - Phonon Qu.  |   | - Autoenc |
+---------------+         +---------------+         +---------------+   +-----------+
```

### Four Defense Contours

1. **Contour 1 — Physical Spatial Partitioning & Crosstalk Isolation**:
   - Computes Graph Laplacian $L = D - |J|$ on QPU coupling topology.
   - Spectral bisection via the Fiedler vector minimizes inter-tenant $ZZ$-crosstalk boundary Hamiltonian terms.
   - Least Mean Squares (LMS) adaptive filter dynamically cancels stray RF drive pulse leakage ($e(k) = d(k) - \mathbf{w}^T \mathbf{u}$).

2. **Contour 2 — Trusted Compiler Verification & Circuit Integrity**:
   - SHA-256 cryptographically seals client quantum circuit intermediate representation.
   - Unsupervised Isolation Forest audits circuit transpilation for parasitic gate insertion, aggressive pulse stretching, or frequency tampering.

3. **Contour 3 — Temporal Buffer Isolation & Thermal State Quenching**:
   - Eliminates residual inter-tenant motional phonon excitations and transmon cryostat heating.
   - Dynamically calculates required laser cooling buffer duration $\tau_b$:
     $$\tau_b = \frac{1}{\eta} \ln \left( \frac{\bar{n}_0 - \dot{n}/\eta}{n^* - \dot{n}/\eta} \right)$$
   - Enforces cooling delay between subsequent tenant execution batches until vibrational mode $\bar{n} \le n^*$.

4. **Contour 4 — Differential Telemetry & Statistical Process Control (SPC)**:
   - Real-time calibration drift monitoring using differential synthetic frequency methods:
     $$\nu_{\text{syn}} = \frac{\nu_+ - \nu_-}{2}$$
   - Non-Gaussian Kolmogorov-Smirnov statistical anomaly detector with Student-$t$ distribution thresholding ($Z > 3.5\sigma$ / $6.87$).
   - Deep Autoencoder neural network monitoring environmental sensor telemetry for stealthy microarchitectural side channels.

---

## 2. Supported QPU Hardware Architectures

TurtleShell models four canonical, widely-adopted quantum hardware platforms with calibration parameters derived strictly from peer-reviewed scientific literature:

| Platform ID | Architecture | Qubits | Coupling Topology | Physical Characteristics | EuroHPC / EU Ecosystem Counterpart |
|---|---|---|---|---|---|
| `trapped_ion_paul_trap` | Linear RF Paul Trap ($^{40}\text{Ca}^+$) | 20–50 | All-to-all motional bus | Individual addressing, phonon heating $\dot{n} \approx 2\,\text{s}^{-1}$ | AQT IBEX / PINE (Innsbruck / EuroHPC JU) |
| `tm_optical_lattice` | 2D Optical Lattice ($^{87}\text{Sr}$) | 100 | Nearest-neighbor Rydberg | Optical dipole trap, synthetic frequency shift $\nu_{\text{syn}}$ | PASQAL Fresnel / Orion (France / EuroHPC JU) |
| `eagle` | Superconducting Transmon | 127 | Heavy-Hex (fixed couplers) | Cross-resonance gates, static $ZZ$-coupling ($J \approx 100\,\text{kHz}$) | Standard transmon baseline |
| `heron` | Superconducting Transmon | 133 | Heavy-Hex (tunable couplers) | Fast flux-tunable couplers, dynamic crosstalk suppression | IQM Radiance / Spark (Finland / Germany / EuroHPC) |

### European & Luxembourg (EuroHPC JU) Infrastructure Context

Luxembourg serves as the administrative and technological headquarters of the **EuroHPC Joint Undertaking (EuroHPC JU)**, driving European quantum sovereignty. Under EuroHPC JU and national infrastructure initiatives (such as **LuxProvide MeluXina** in Bissen, Luxembourg, and **LuxQCI / EAGLE-1**):
- **AQT Trapped-Ion Integration**: TurtleShell's `trapped_ion_paul_trap` directly models the physical vibrational and RF leakage dynamics of AQT $^{40}\text{Ca}^+$ hardware procured for EuroHPC supercomputing centers.
- **PASQAL Neutral Atoms**: The `tm_optical_lattice` platform reflects Rydberg blockade arrays deployed under EuroHPC hybrid quantum initiatives.
- **IQM Superconducting Transmons**: The tunable transmon model (`heron`) captures dynamic flux-bias isolation implemented in modern European quantum processors.
- **MeluXina Hybrid Quantum Cloud**: Provides the zero-trust multi-tenant isolation layer required to run concurrent academic and industrial workloads on shared EuroHPC quantum accelerators.

---

## 3. Documentation Architecture

TurtleShell technical documentation is organized according to the **Diataxis** framework:

```text
docs/
|-- README.md                         # Documentation Portal & Navigation Index
|-- architecture/
|   |-- system-architecture.md        # 5-Layer Stack, Concurrency, and Dual-Mode Runtime
|   `-- hardware-platforms.md         # Physical Calibrations, AQT, PASQAL, IQM & EuroHPC
|-- engines/
|   |-- contour1-partitioning.md      # Graph Laplacian Bisection and LMS Adaptive Filter
|   |-- contour2-compiler-audit.md    # SHA-256 Hashing and Isolation Forest Trojan Gate
|   |-- contour3-thermal-buffer.md    # Analytical Cooling Buffer Duration (tau_b) & QuTiP
|   `-- contour4-differential-spc.md  # Synthetic Frequency, KS Test, and Autoencoder
`-- reference/
    |-- cli-reference.md              # Complete qib CLI Commands, Options, and Exit Codes
    `-- api-and-websocket.md          # REST Endpoints and WebSocket Wire Protocol
```

Access the documentation portal at [docs/README.md](docs/README.md).

---

## 3. Deployment & Execution Modes

TurtleShell is designed with two complementary runtimes:

### Mode A: Standalone Client-Side Web Platform (Flagship)
- **Zero-Backend Requirement**: Deployed as a static single-page application on Cloudflare Pages ([https://turtleshell.iqumnov.com](https://turtleshell.iqumnov.com)).
- **In-Browser Numerical Engine**: Implements the full physical QPU layout generation, crosstalk models, phonon heating differential equations, and 4 defense contours in pure TypeScript (`clientEngine.ts`).
- **Privacy & Zero Latency**: All simulations and audits execute locally inside your browser sandbox without transmitting telemetry across the network.
- **Zero Installation**: Accessible instantly on any device (desktop, tablet, mobile) with zero dependencies.

### Mode B: Academic Research Benchmark Toolchain (`qib`)
- **Scientific Master Equation Verification**: Python research package (`packages/quantum-isolation-benchmark`) for academic researchers to verify multi-tenant isolation against open-system master equations.
- **High-Throughput Daemon**: Optional Python backend streaming real-time simulation metrics via WebSocket (`ws://127.0.0.1:8000/api/simulation/stream`) when running locally.
- **Automated Installers**: POSIX (`install.sh`) and Windows PowerShell (`install.ps1`) one-line setup scripts.
- **`qib` Benchmark CLI**: Command-line interface for running automated isolation benchmarks, generating QuTiP quantum trajectory verifications, and producing Markdown audit reports.

---

## 4. Quickstart & Installation

### Option 1: Universal One-Line Installer (Linux / macOS / WSL)
```bash
curl -sSL https://raw.githubusercontent.com/Iqumnov/TurtleShell/main/install.sh | bash
```

### Option 2: Windows PowerShell Installer
```powershell
irm https://raw.githubusercontent.com/Iqumnov/TurtleShell/main/install.ps1 | iex
```

### Option 3: Run with Docker Compose
```bash
git clone https://github.com/Iqumnov/TurtleShell.git
cd TurtleShell
docker-compose up --build
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Option 4: Manual Local Setup
```bash
# 1. Clone repository
git clone https://github.com/Iqumnov/TurtleShell.git
cd TurtleShell

# 2. Setup Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 3. Install benchmark package and backend dependencies
pip install -e packages/quantum-isolation-benchmark
pip install -r packages/turtleshell-live/backend/requirements.txt

# 4. Install web app dependencies (optional; auto-installed by runner)
cd packages/turtleshell-live/frontend && npm install && cd ../../..

# 5. Start live dashboard
./run_live.sh  # On Windows PowerShell: .\run_live.ps1
```

---

## 5. Benchmark CLI (`qib`)

The `qib` (Quantum Isolation Benchmark) CLI evaluates isolation efficacy and calculates financial ROI across multi-tenant workloads:

```bash
# Run comprehensive isolation benchmark across all 4 platforms
qib benchmark --provider all --output isolation_report.md

# Verify Contour 3 cooling buffer with QuTiP master equation
qib verify-qutip

# Run multi-tenant spectral scheduler against Crosstalk Attack
qib schedule --platform heron --tenants 3 --algo spectral
```

---

## 6. Mathematical Foundations & Traceability

| SPECS § | Defense Contour / Feature | Physical Equation | Implementation Target |
|---|---|---|---|
| **§5.1** | **Contour 1: Spectral Partition** | $L = D - \|J\| \implies \min_{\mathbf{x}} \mathbf{x}^T L \mathbf{x}$ | `backend/app/simulation/scheduler.py` |
| **§5.1** | **Contour 1: Adaptive LMS Filter** | $\mathbf{w}(k+1) = \mathbf{w}(k) + 2\mu e(k)\mathbf{u}(k)$ | `backend/app/simulation/defense.py` |
| **§5.2** | **Contour 2: Circuit Hash & Audit** | $\text{SHA256}(C) \parallel \text{IsoForest}(X) \le \theta$ | `backend/app/ml/models.py` |
| **§5.3** | **Contour 3: Laser Cooling Buffer** | $\tau_b = \frac{1}{\eta} \ln \left( \frac{\bar{n}_0 - \dot{n}/\eta}{n^* - \dot{n}/\eta} \right)$ | `backend/app/simulation/defense.py` |
| **§5.4** | **Contour 4: Differential Monitor** | $Z = \frac{\|x - \mu\|}{\sigma} \ge Z_{\text{crit}}$ | `backend/app/simulation/defense.py` |
| **§5.4** | **Contour 4: Telemetry Autoencoder** | $\mathcal{L}(x, \hat{x}) = \|x - \text{Dec}(\text{Enc}(x))\|_2^2$ | `backend/app/ml/models.py` |
| **§6.0** | **Economics: Financial ROI** | $\text{Net Benefit} = \text{Savings} - \text{Overhead}$ | `backend/app/main.py` |

---

## 7. Citation

If you use **TurtleShell** in your research, isolation benchmarks, or quantum cloud infrastructure, please cite this software repository:

```bibtex
@software{igumnov2026turtleshell,
  author       = {Igumnov, Matvei Dmitrievich},
  title        = {TurtleShell: Multi-Contour Process Isolation and Side-Channel Defense Framework for Multi-Tenant Quantum Clouds},
  year         = {2026},
  publisher    = {GitHub},
  version      = {0.1.0},
  doi          = {10.5281/zenodo.24528037},
  url          = {https://github.com/Iqumnov/TurtleShell}
}
```

---

## 8. Author, Affiliations & Academic Scope

The author declares that he has no competing financial interests or personal relationships that could have appeared to influence the work reported in this software framework.

### Author
**Matvei Dmitrievich Igumnov** (ORCID: [0009-0001-7924-1522](https://orcid.org/0009-0001-7924-1522))  
   *Department of Information Security, Moscow Polytechnic University, Moscow, Russia*  
   Email: `matvei@iqumnov.com`

### Parametric Transparency & Open Science
- **Physical Calibrations**: All QPU calibration metrics, coherence times, and coupling parameters are derived transparently from open, peer-reviewed academic literature with verifiable DOIs.
- **Civilian Computational Scope**: Platforms and models are restricted strictly to civilian open-science architectures (compatible with EuroHPC JU / AQT / PASQAL / IQM standards).

---

## 9. License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
