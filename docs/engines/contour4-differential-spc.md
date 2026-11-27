# Contour 4: Differential Telemetry & Statistical Process Control (SPC)

Contour 4 continuously monitors calibration drift, environmental stability, and microarchitectural side-channel leakage without disrupting active tenant quantum computations.

---

## 1. Differential Synthetic Frequency Monitoring

For optical atomic platforms and frequency-stabilized systems, common-mode linear Zeeman fluctuations ($\nu_\pm = \nu_0 \pm \Delta_Z + \alpha_2 B^2$) are eliminated using the synthetic frequency method:

$$\nu_{\text{syn}} = \frac{\nu_+ + \nu_-}{2}$$
where $\nu_+$ and $\nu_-$ represent transition frequencies of nuclear-spin $\pm m_F$ Zeeman components with opposite first-order magnetic sensitivities. Averaging cancels linear magnetic drift cleanly, isolating second-order / blackbody / lattice-shift telemetry anomalies.

---

## 2. Statistical Process Control (SPC) Sliding-Window Detector

Telemetry features $x(t)$ (such as drive frequency drift, readout error spikes, and resonator phase fluctuations) are tracked across a sliding window (default $W = 600$ ticks):

$$\mu_W = \frac{1}{|W|} \sum_{i \in W} x_i, \quad \sigma_W = \sqrt{\frac{1}{|W|} \sum_{i \in W} (x_i - \mu_W)^2}$$
The normalized $Z$-score is computed as:
$$Z = \frac{|x(t) - \mu_W|}{\sigma_W}$$

### 2.1 Non-Gaussian Kolmogorov-Smirnov Test
To prevent false-positive alarms caused by heavy-tailed non-Gaussian noise:
1. Contour 4 evaluates the Kolmogorov-Smirnov goodness-of-fit test against a normal distribution.
2. If $p \ge 0.05$ (Gaussian): threshold is set to $Z_{\text{crit}} = 3.5\sigma$.
3. If $p < 0.05$ (Non-Gaussian): threshold is evaluated under Student's $t$-distribution with $\nu = 5$ degrees of freedom:
   $$Z_{\text{crit}} = t_{\alpha/2, \nu=5} \approx 6.87 \quad (\alpha = 0.001)$$

### 2.2 Threat Escalation Matrix
- **Level 0 (Normal)**: $Z < 2.5$
- **Level 1 (Notice)**: $2.5 \le Z < Z_{\text{crit}}$
- **Level 2 (Warning)**: $Z_{\text{crit}} \le Z < 1.5\,Z_{\text{crit}}$ ($3.5 \le Z < 5.25$ Gaussian)
- **Level 3 (Critical Alert)**: $Z \ge 1.5\,Z_{\text{crit}}$ ($5.25$ Gaussian / $10.30$ Student-$t$) $\implies$ Immediate circuit suspension and QPU diagnostic re-calibration.

---

## 3. Standardized Subspace Telemetry Reconstruction (`TelemetryAutoencoder`)

Environmental and calibration telemetry vectors $\mathbf{x} \in \mathbb{R}^{16}$ (averaged $T_1, T_2, \sigma_{T_1}$, gate/readout error rates, $ZZ$ coupling, QPU isolation, phonon heating metrics, RF leakage, and Zeeman-split sensor channels) are standardized using `StandardScaler` ($\tilde{\mathbf{x}} = (\mathbf{x} - \boldsymbol{\mu}) / \boldsymbol{\sigma}$) and projected onto a $k = 4$ principal subspace via Principal Component Analysis (`PCA`):
$$\mathbf{z} = W_k^T \tilde{\mathbf{x}} \in \mathbb{R}^4, \qquad \hat{\mathbf{x}} = W_k \mathbf{z}$$

Reconstruction error is evaluated via Mean Squared Error in standardized coordinates:
$$\mathcal{L}(\tilde{\mathbf{x}}, \hat{\mathbf{x}}) = \frac{1}{16} \|\tilde{\mathbf{x}} - \hat{\mathbf{x}}\|_2^2$$
When $\mathcal{L} > \theta_{\text{spc}}$ (calibrated empirically as the $95^{\text{th}}$ percentile over $N = 1000$ platform-nominal samples), an unmodeled side-channel excitation is diagnosed.

