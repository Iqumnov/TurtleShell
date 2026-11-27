# TurtleShell Physical Equations & Theoretical Model

This document traces the mathematical equations from the papers directly to their implementation in the code.

---

## 1. Contour 1: Graph Laplacian Spectral Partitioning (SPECS §5.1)

The inter-tenant coupler matrix $J_{ij}$ is partitioned using the Graph Laplacian:
$$L = D - |J|$$
where $D_{ii} = \sum_j |J_{ij}|$. Spectral partitioning computes the Fiedler vector $\mathbf{v}_2$ (the eigenvector corresponding to the second smallest eigenvalue $\lambda_2$ of the Graph Laplacian $L$) to minimize cross-boundary crosstalk coupling subject to zero-sum and unit-norm constraints:
$$\min_{\substack{\mathbf{x} \perp \mathbf{1} \\ \|\mathbf{x}\| = 1}} \mathbf{x}^T L \mathbf{x} = \frac{1}{2} \sum_{i,j} |J_{ij}| (x_i - x_j)^2$$

* **Implementation**: `backend/app/simulation/scheduler.py` (`MultiTenantScheduler._schedule_spectral_partitioning`)

---

## 2. Contour 1: LMS Adaptive Filter for RF Leakage (SPECS §5.1, Paper #1 Eq. 12)

The error signal $e(k)$ and weight update rule:
$$e(k) = d(k) - \mathbf{w}^T(k) \mathbf{u}(k)$$
$$\mathbf{w}(k+1) = \mathbf{w}(k) + 2\mu e(k) \mathbf{u}(k)$$

* **Implementation**: `backend/app/simulation/defense.py` (`LMSFilter`)

---

## 3. Contour 3: Laser Cooling Buffer Duration (SPECS §5.3, Paper #2 Eq. 6)

$$\tau_b = \frac{1}{\eta} \ln \left( \frac{\bar{n}_0 - \dot{n}/\eta}{n^* - \dot{n}/\eta} \right)$$

* $\bar{n}_0$: initial mean phonon number
* $\dot{n}$: heating rate (phonons/s)
* $\eta$: laser cooling rate ($1/\text{s}$)
* $n^*$: target phonon threshold (default $0.2$)

* **Implementation**: `backend/app/simulation/defense.py` (`LaserCoolingBuffer.compute_ion_cooling_time`)
* **Reference Test**: `tests/test_contour3_physics.py` ($\tau_b \approx 0.6907\text{ s}$ for baseline test parameters: $\bar{n}_0=100.0, \dot{n}=1.0, \eta=10.0, n^*=0.2$).

---

## 4. Contour 4: Statistical Process Control & Synthetic Frequency (SPECS §5.4)

Synthetic frequency method for optical lattice atomic platforms:
$$\nu_{\text{syn}} = \frac{\nu_+ + \nu_-}{2}$$

Sliding window Z-score calculation:
$$Z = \frac{|x - \mu|}{\sigma}$$
Threshold application:
* Gaussian ($p \ge 0.05$): $3.5\sigma$
* Non-Gaussian (KS-test $p < 0.05$): Student-$t$ distribution with $\text{df}=5$, $\text{threshold} = \text{t.ppf}(0.9995, \text{df}=5) \approx 6.87$.

* **Implementation**: `backend/app/simulation/defense.py` (`DifferentialMonitor`)
