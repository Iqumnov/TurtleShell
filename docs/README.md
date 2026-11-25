# TurtleShell Documentation Architecture

Welcome to the technical documentation portal for **TurtleShell**, the multi-contour process isolation and side-channel defense platform for multi-tenant quantum clouds.

This documentation is structured according to the **Diataxis** information architecture framework, separating high-level architecture, deep engine mechanics, reference specifications, and deployment guides.

---

## Documentation Structure

```text
docs/
├── README.md                              # Documentation Portal & Navigation Index (This Document)
├── architecture/
│   ├── system-architecture.md             # 5-Layer Stack, Concurrency Model & Dual-Mode Runtime
│   └── hardware-platforms.md              # Physical Calibrations, AQT, PASQAL, IQM & EuroHPC Luxembourg
├── engines/
│   ├── contour1-partitioning.md           # Graph Laplacian Spectral Bisection & Adaptive LMS Filter
│   ├── contour2-compiler-audit.md         # SHA-256 DAG Hashing & Isolation Forest Trojan Gate
│   ├── contour3-thermal-buffer.md         # Analytical Laser Cooling Buffer Duration (tau_b) & QuTiP
│   └── contour4-differential-spc.md       # Synthetic Frequency, Non-Gaussian KS-Test & Autoencoders
├── reference/
│   ├── cli-reference.md                   # Complete qib CLI Commands, Options, Flags & Exit Codes
│   └── api-and-websocket.md               # FastAPI WebSocket Wire Frames & REST Endpoint Specs
├── quickstart.md                          # 5-Minute Developer Quickstart Guide
└── theory.md                              # Theoretical Traceability & Mathematical Formulations
```

---

## Core Reading Pathways

- **For System Administrators & Cloud Architects**:
  - Read [System Architecture](architecture/system-architecture.md) for multi-tenant scheduling and the dual-mode deployment model.
  - Read [Hardware Platforms](architecture/hardware-platforms.md) to understand physical platform noise parameters and European EuroHPC / MeluXina alignment.
- **For Security Researchers & Quantum Physicists**:
  - Read [Contour 1: Physical Partitioning](engines/contour1-partitioning.md) for Graph Laplacian derivation and LMS RF cancellation.
  - Read [Contour 3: Thermal Buffer Isolation](engines/contour3-thermal-buffer.md) for the exact analytical derivation of the laser cooling buffer time $\tau_b$.
  - Read [Contour 4: Differential Telemetry](engines/contour4-differential-spc.md) for synthetic frequency drift and Autoencoder reconstruction error bounds.
- **For Developers & DevOps Integrators**:
  - Read [CLI Reference](reference/cli-reference.md) for integrating `qib` into CI/CD pipelines.
  - Read [API & WebSocket Specification](reference/api-and-websocket.md) for custom frontend integrations and streaming event ingestion.

