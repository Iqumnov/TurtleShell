# Contour 4: Differential Telemetry & Statistical Process Control (SPC)

Contour 4 continuously monitors calibration drift, environmental stability, and microarchitectural side-channel leakage without disrupting active tenant quantum computations.

---

## 1. Differential Synthetic Frequency Monitoring

For optical atomic platforms and frequency-stabilized systems, common-mode environmental fluctuations (magnetic field drift, temperature swings) are eliminated using the differential synthetic frequency method:

$$\nu_{\text{syn}} = \frac{\nu_+ - \nu_-}{2}$$
where $\nu_+$ and $\nu_-$ represent the transition frequencies of Zeeman sublevels exhibiting opposing magnetic sensitivity ($g$-factors). Differential subtraction cancels common-mode environmental noise by $> 40\,\text{dB}$.

---

## 2. Statistical Process Control (SPC) Sliding-Window Detector

Telemetry features $x(t)$ (such as drive frequency drift, readout error spikes, and resonator phase fluctuations) are tracked across a sliding window $W = 60$ ticks:

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
- **Level 1 (Notice)**: $2.5 \le Z < 3.5$
- **Level 2 (Warning)**: $3.5 \le Z < 5.25$
- **Level 3 (Critical Alert)**: $Z \ge 5.25 \implies$ Immediate circuit suspension and QPU diagnostic re-calibration.

---

## 3. Deep Telemetry Autoencoder

An undercomplete neural network architecture compresses sensor vectors $\mathbf{x} \in \mathbb{R}^8$ into an information bottleneck $\mathbf{z} \in \mathbb{R}^4$:
$$\mathbf{z} = \sigma(W_e \mathbf{x} + \mathbf{b}_e)$$
$$\hat{\mathbf{x}} = \sigma(W_d \mathbf{z} + \mathbf{b}_d)$$

Reconstruction error is calculated using Mean Squared Error:
$$\mathcal{L}(\mathbf{x}, \hat{\mathbf{x}}) = \frac{1}{d} \|\mathbf{x} - \hat{\mathbf{x}}\|_2^2$$
When $\mathcal{L} > \theta_{\text{auto}} = 0.035$, an unmodeled side-channel excitation is diagnosed.

