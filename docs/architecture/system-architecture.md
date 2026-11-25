# System Architecture & Layered Concurrency Model

TurtleShell enforces strict process isolation across multi-tenant Quantum Processing Units (QPUs). Unlike classical multi-core CPUs, quantum processors feature non-local Hamiltonian crosstalk, common motional phonon vibrational buses, and cryostat dielectric thermal dissipation that cannot be isolated using memory management units (MMUs) or virtualization rings.

---

## 1. Five-Layer Architecture

```
+-----------------------------------------------------------------------------------+
|                        Layer 5: Analytics & Visualization                         |
|  - 3D WebGL Multi-Platform Mesh Viewer  - SVG Real-Time Telemetry Sparklines      |
|  - Financial SLA ROI & Loss Calculator  - Multi-Tenant Allocation Heatmap         |
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
|                        Layer 4: Orchestration & Dispatch                          |
|  - Multi-Tenant Spectral Scheduler   - Real-Time WebSocket Streaming Engine       |
|  - Session Context Isolation Gate    - In-Browser Client Engine Fallback          |
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
|                        Layer 3: Four Defense Contours                             |
|  [Contour 1: Laplacian & LMS]        [Contour 2: SHA-256 & Isolation Forest]      |
|  [Contour 3: Laser Cooling Buffer]   [Contour 4: Diff-SPC & Telemetry Autoencoder]|
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
|                        Layer 2: Multi-Tenant Attack Engine                        |
|  - Inter-Tenant ZZ-Crosstalk         - Prime+Probe Motional Phonon Heating        |
|  - Transpiler Rowhammer Trojan       - Stray RF Microwave Drive Leakage           |
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
|                        Layer 1: Physical QPU Platforms                            |
|  - Trapped-Ion Paul Trap (Ca-40)     - Neutral Atom Optical Lattice (Sr-87)       |
|  - Superconducting Fixed (IBM Eagle) - Superconducting Tunable (IBM Heron)        |
+-----------------------------------------------------------------------------------+
```

---

## 2. Dual-Mode Runtime Model

TurtleShell is designed with two complementary runtime profiles:

### Mode A: Standalone In-Browser Engine (Edge Client Mode)
- **Deployment**: Hosted on Cloudflare Pages (`https://turtleshell.iqumnov.com`).
- **Engine**: Implemented entirely in TypeScript ([clientEngine.ts](../../packages/turtleshell-live/frontend/src/store/clientEngine.ts)).
- **Zero-Backend Dependency**: Executes numerical differential equations, lattice layout generation, and defense metric calculations locally in the user's browser sandbox.
- **Privacy Guarantee**: Circuits, tenant allocations, and security telemetry never leave the client machine.

### Mode B: Full-Stack Local Toolchain (HPC & Benchmark Mode)
- **Deployment**: Local workstation, containerized Docker Compose, or HPC clusters.
- **Backend Service**: Asynchronous Python FastAPI service streaming telemetry via WebSockets (`ws://127.0.0.1:8000/api/simulation/stream`).
- **Benchmark CLI (`qib`)**: CLI toolchain for high-throughput batch evaluations, QuTiP master equation trajectory verifications, and Markdown report synthesis.
- **Seamless Fallback**: The frontend dashboard automatically tries connecting to the local WebSocket; if offline, it immediately engages the in-browser physics engine without interruption.

