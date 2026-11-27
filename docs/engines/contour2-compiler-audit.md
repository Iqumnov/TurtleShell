# Contour 2: Compiler Verification & Integrity Gate

Contour 2 audits client quantum circuits during compilation and transpilation to eliminate malicious trojan gate insertions, pulse stretching, and localized substrate heating attacks.

---

## 1. Cryptographic Circuit Hashing

To guarantee that quantum circuits executed on physical hardware strictly conform to verified source code, Contour 2 calculates an immutable SHA-256 cryptographic digest over the normalized DAG (Directed Acyclic Graph) representation:

$$H_C = \text{SHA256}(\text{CanonicalQASM} \parallel \text{GateSchedule} \parallel \text{Parameters})$$

Any downstream tampering with gate angles, pulse durations, or routing swaps alters $H_C$, immediately halting circuit dispatch.

---

## 2. Isolation Forest Anomaly Detection

### 2.1 Threat Model
An attacker may craft synthetically valid circuits designed to exploit physical substrate properties:
- **Transpiler Trojans**: Introducing redundant $CX$ or high-amplitude microwave drive sequences to elevate local cryostat temperatures.
- **Rowhammer Pulse Stretching**: Repetitive single-qubit rotations at resonance frequencies exceeding standard duty cycles ($> 10^5$ operations), causing localized dielectric saturation and suppressing neighboring $T_1$ times.

### 2.2 Feature Representation
Before submission to the scheduler, the compiler extracts a 4-dimensional behavioral feature vector $\mathbf{f}_C$:
$$\mathbf{f}_C = [N_{\text{swaps}}, \text{Depth}, \rho_{\text{CZ}}, T_{\text{pulse}}]$$
where:
- $N_{\text{swaps}}$: inserted SWAP gate count during transpilation routing.
- $\text{Depth}$: compiled circuit depth.
- $\rho_{\text{CZ}}$: two-qubit entangling ($CX/CZ$) density.
- $T_{\text{pulse}}$: mean microwave drive pulse width ($\text{ns}$).

### 2.3 Model Evaluation
An ensemble of $T = 100$ isolation trees trained on $10{,}000$ nominal samples ($\text{contamination} = 0.05$) evaluates compiled circuits alongside strict SHA-256 hash verification:
$$s(\mathbf{f}_C, n) = 2^{-\frac{\mathbb{E}(h(\mathbf{f}_C))}{c(n)}}$$
where $\mathbb{E}(h(\mathbf{f}_C))$ is the average path length across all isolation trees and $c(n)$ is the average path length of unsuccessful searches in a Binary Search Tree:
$$c(n) = 2 \ln(n - 1) + 0.5772156649 - \frac{2(n-1)}{n}$$

Circuits failing the SHA-256 reference comparison (`hash_verified == False`) or yielding inlier classification failures (`pred != 1` or raw `score_samples <= -0.6`) raise `anomaly_flagged_l2 = True` in telemetry.

