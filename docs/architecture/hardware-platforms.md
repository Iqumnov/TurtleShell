# Hardware Platforms & European / EuroHPC Alignment

TurtleShell models four canonical, widely-adopted quantum hardware platforms with calibration metrics derived directly from published peer-reviewed literature.

---

## 1. Platform Calibration Matrix

| Platform ID | Architecture | Physical Species | Qubit Count | Connectivity | Coherence ($T_1 / T_2$) | Error Rates ($\epsilon_{1q} / \epsilon_{2q}$) |
|---|---|---|---|---|---|---|
| `trapped_ion_paul_trap` | Linear RF Paul Trap | $^{40}\text{Ca}^+$ | 20–50 | All-to-All (Phonon Bus) | $1.16\,\text{s} / 0.5\,\text{s}$ | $1.0 \times 10^{-4} / 3.0 \times 10^{-3}$ |
| `tm_optical_lattice` | 2D Optical Lattice | $^{87}\text{Sr}$ | 100 | Nearest-Neighbor (Rydberg) | $60.0\,\text{s} / 30.0\,\text{s}$ | $2.0 \times 10^{-4} / 5.0 \times 10^{-3}$ |
| `eagle` | Superconducting Transmon | Niobium / Al-AlOx | 127 | Heavy-Hex (Fixed Couplers) | $148\,\mu\text{s} / 96\,\mu\text{s}$ | $5.0 \times 10^{-4} / 1.0 \times 10^{-2}$ |
| `heron` | Superconducting Transmon | Niobium / Al-AlOx | 133 | Heavy-Hex (Tunable Couplers) | $172\,\mu\text{s} / 110\,\mu\text{s}$ | $3.0 \times 10^{-4} / 7.0 \times 10^{-3}$ |

---

## 2. Alignment with Luxembourg & EuroHPC JU Quantum Ecosystem

Luxembourg is the epicenter of European High Performance Computing as the headquarters of the **EuroHPC Joint Undertaking (EuroHPC JU)**. Through EuroHPC JU and national initiatives like **LuxProvide (Supercomputer MeluXina in Bissen, Luxembourg)** and **LuxQCI (Luxembourg Quantum Communication Infrastructure)**, Europe is establishing sovereign quantum cloud infrastructure.

TurtleShell's platform classes map directly to the primary hardware technologies procured and deployed under EuroHPC JU:

### 2.1 AQT (Alpine Quantum Technologies, Austria / EU) -> `trapped_ion_paul_trap`
- **EuroHPC Context**: Selected by EuroHPC JU for European supercomputing integration (e.g., EuroQCS-Poland at PSNC).
- **Physical Implementation**: Rack-mounted 19-inch trapped-ion quantum computer utilizing optical transitions in $^{40}\text{Ca}^+$ ions, identical to TurtleShell's `trapped_ion_paul_trap` calibration.
- **Threat Vector**: Collective motional bus phonon excitations and stray RF drive cross-talk. TurtleShell's Contour 1 (LMS filtering) and Contour 3 (laser cooling buffer $\tau_b$) directly safeguard AQT-style trapped-ion cloud systems.

### 2.2 PASQAL (France / EU) -> `tm_optical_lattice`
- **EuroHPC Context**: Procured by EuroHPC JU for EuroQCS-France (GENCI / CEA) and EuroQCS-Germany (Forschungszentrum Jülich) for hybrid HPC-QC acceleration.
- **Physical Implementation**: Neutral atom arrays trapped in optical tweezers with Rydberg blockade interactions, modeled by TurtleShell's `tm_optical_lattice`.
- **Threat Vector**: Optical cross-talk, Rydberg dipole-dipole parasitic shifts, and thermal laser drift. Addressed by TurtleShell's Contour 4 synthetic frequency drift cancellation ($\nu_{\text{syn}}$).

### 2.3 IQM Quantum Computers (Finland / Germany / EU) -> `heron` / Superconducting
- **EuroHPC Context**: Procured by EuroHPC JU for EuroQCS-Germany (LRZ Leibniz Supercomputing Centre) and VTT.
- **Physical Implementation**: Superconducting transmon QPUs with high-coherence resonators and active coupler architectures.
- **Threat Vector**: Inter-tenant $ZZ$-crosstalk and dielectric substrate heating. Mitigated by TurtleShell's Contour 1 Graph Laplacian bisection and Contour 2 transpile audit.

### 2.4 LuxProvide MeluXina Hybrid Quantum Cloud
- **Location**: LuxProvide Data Center, Bissen, Luxembourg.
- **Context**: The **Quantum MeluXina** initiative bridges European cloud users with heterogeneous quantum backends. TurtleShell provides the zero-trust multi-tenant isolation layer necessary to run concurrent untrusted commercial and academic workloads on shared European quantum hardware.

