# Contour 3: Thermal Buffer Isolation & Analytical Laser Cooling

Contour 3 guarantees temporal isolation across consecutive tenant execution batches. In shared physical architectures (trapped-ion chains and transmon cryostats), state preparation, measurement (SPAM), and multi-qubit entangling pulses deposit residual energy that decays slowly relative to gate clock cycles.

---

## 1. Motional Phonon Mode Heating Dynamics

In a linear RF Paul trap confining $N$ ions, two-qubit operations (such as Mølmer-Sørensen gates) couple electronic qubit states through the collective motional harmonic oscillator bus.

The mean phonon occupancy $\bar{n}(t) = \langle a^\dagger a \rangle$ evolves according to the Master Equation:
$$\frac{d\rho}{dt} = -i [H, \rho] + \frac{\dot{n}}{2} \mathcal{D}[a^\dagger]\rho + \frac{\eta + \dot{n}}{2} \mathcal{D}[a]\rho$$
where $\mathcal{D}[O]\rho = 2 O \rho O^\dagger - O^\dagger O \rho - \rho O^\dagger O$ is the Lindblad superoperator, $\dot{n}$ is the anomalous background heating rate, and $\eta$ is the active Doppler laser cooling rate.

Under zero coherent drive ($H = 0$), the mean phonon number satisfies the first-order ordinary differential equation:
$$\frac{d\bar{n}}{dt} = \dot{n} - \eta \bar{n}$$

---

## 2. Analytical Derivation of Buffer Time $\tau_b$

Given an initial excited phonon state $\bar{n}(0) = \bar{n}_0$ resulting from an antecedent tenant's computation, we seek the exact duration $\tau_b$ of laser cooling required to restore vibrational mode purity below a target threshold $n^*$ ($\bar{n}(\tau_b) = n^*$):

1. **Separation of Variables**:
   $$\frac{d\bar{n}}{\dot{n} - \eta \bar{n}} = dt \implies \frac{d\bar{n}}{\bar{n} - \dot{n}/\eta} = -\eta dt$$

2. **Integration over Interval $[0, \tau_b]$**:
   $$\int_{\bar{n}_0}^{n^*} \frac{d\bar{n}}{\bar{n} - \dot{n}/\eta} = -\eta \int_0^{\tau_b} dt$$
   $$\ln \left| \frac{n^* - \dot{n}/\eta}{\bar{n}_0 - \dot{n}/\eta} \right| = -\eta \tau_b$$

3. **Inversion for $\tau_b$**:
   $$\tau_b = \frac{1}{\eta} \ln \left( \frac{\bar{n}_0 - \dot{n}/\eta}{n^* - \dot{n}/\eta} \right)$$

### 2.1 Physical Parameters & Reference Test
- Anomalous heating rate: $\dot{n} = 1.0\,\text{s}^{-1}$
- Active cooling rate: $\eta = 10.0\,\text{s}^{-1}$
- Initial phonon excitation: $\bar{n}_0 = 100.0$
- Ground state threshold: $n^* = 0.2$
- Asymptotic heating limit: $n_\infty = \frac{\dot{n}}{\eta} = 0.1 < n^*$

Evaluating the formula:
$$\tau_b = \frac{1}{10.0} \ln \left( \frac{100.0 - 0.1}{0.2 - 0.1} \right) = 0.1 \times \ln(999) \approx 0.6908\,\text{seconds}$$

This numerical value matches Table 2 of the benchmark and is verified to within $10^{-3}$ in `turtleshell_contour3.py` and `build_all.sh`.

---

## 3. Superconducting Transmon Thermal Quenching

For superconducting transmon systems, Contour 3 enforces an adaptive reset buffer duration:
$$\tau_{\text{reset}} = 5 \times \max_{q \in V_{\text{victim}}} T_1(q)$$
guaranteeing residual thermal population $P(|1\rangle) \le e^{-5} \approx 0.0067$ ($< 0.7\%$) before granting physical control to the next tenant.
