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
     $$\nu_{\text{syn}} = \frac{\nu_+ + \nu_-}{2}$$
   - Non-Gaussian Kolmogorov-Smirnov statistical anomaly detector with Student-$t$ distribution thresholding ($Z > 3.5\sigma$ / $6.87$).
   - 16-dimensional Standardized PCA telemetry subspace detector (`StandardScaler` + `PCA(4)`) monitoring environmental sensor vectors for stealthy microarchitectural side channels.

---

## 2. Supported QPU Hardware Architectures

TurtleShell models four canonical, widely-adopted quantum hardware platforms with calibration parameters derived strictly from peer-reviewed scientific literature:

| Platform ID | Architecture | Qubits | Coupling Topology | Physical Characteristics | EuroHPC / EU Ecosystem Counterpart |
|---|---|---|---|---|---|
| `trapped_ion_paul_trap` | Linear RF Paul Trap ($^{40}\text{Ca}^+$) | 20–50 | All-to-all motional bus | Individual addressing, phonon heating $\dot{n} \approx 0.02\text{--}0.1\,\text{s}^{-1}$ | AQT IBEX / PINE (Innsbruck / EuroHPC JU) |
| `sr_optical_lattice` | 2D Optical Lattice ($^{87}\text{Sr}$) | 100 | Nearest-neighbor Rydberg | Optical dipole trap (~1 $\mu\text{K}$ atoms in 300 K UHV chamber), $\nu_{\text{syn}}$ | PASQAL Fresnel / Orion-class neutral atoms (France / EuroHPC JU) |
| `eagle` | Superconducting Transmon | 127 | Heavy-Hex (fixed couplers) | Cross-resonance gates, static $ZZ$-coupling ($J \approx 4.8\,\text{kHz}$) | Standard transmon baseline |
| `heron` | Superconducting Transmon | 133 | Heavy-Hex (tunable couplers) | Fast flux-tunable couplers, dynamic crosstalk suppression ($J \approx 1.1\,\text{kHz}$) | IQM Radiance / Spark (Finland / Germany / EuroHPC) |

### European & Luxembourg (EuroHPC JU) Infrastructure Context

Luxembourg serves as the administrative and technological headquarters of the **EuroHPC Joint Undertaking (EuroHPC JU)**, driving European quantum sovereignty. Under EuroHPC JU and national infrastructure initiatives (such as **LuxProvide MeluXina** in Bissen, Luxembourg, and **LuxQCI / EAGLE-1**):
- **AQT Trapped-Ion Integration**: TurtleShell's `trapped_ion_paul_trap` directly models the physical vibrational and RF leakage dynamics of AQT $^{40}\text{Ca}^+$ hardware procured for EuroHPC supercomputing centers.
- **Neutral-Atom Optical Lattice ($^{87}\text{Sr}$ / PASQAL-class)**: The `sr_optical_lattice` platform models 2D Rydberg blockade arrays ($R_b \approx 5.2\,\mu\text{m}$ at $a = 4.0\,\mu\text{m}$) aligned with European neutral-atom quantum systems.
- **IQM Superconducting Transmons**: The tunable transmon model (`heron`) captures dynamic flux-bias isolation implemented in modern European quantum processors.
- **MeluXina Hybrid Quantum Cloud**: Provides the zero-trust multi-tenant isolation layer required to run concurrent academic and industrial workloads on shared EuroHPC quantum accelerators.

---

## 3. Deployment, Execution Modes & Documentation

TurtleShell is organized with [Diataxis documentation](docs/README.md) across `docs/` (`architecture/`, `engines/`, `reference/`) and runs in two complementary runtimes:

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
pnpm install

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
| **Lean 4** | **Formal Invariants (Zero-Sorry)** | Laplacian PSD, NLMS bound, Cooling $\tau_b > 0$, Zeeman cancel, $T_2 \le 2T_1$ | `proofs/TurtleShellProofs.lean` |

---

## 7. Citation

If you use **TurtleShell** in your research, isolation benchmarks, or quantum cloud infrastructure, please cite this software repository:

```bibtex
@software{igumnov2026turtleshell,
  author       = {Igumnov, Matvei Dmitrievich},
  title        = {TurtleShell: Multi-Contour Process Isolation and Side-Channel Defense Framework for Multi-Tenant Quantum Clouds},
  year         = {2026},
  publisher    = {GitHub},
  version      = {1.0.0},
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

---

# TurtleShell (Русская версия)

Многоконтурная система изоляции процессов и защиты от атак по побочным каналам для многоарендных квантовых облаков

[![Лицензия: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-purple.svg)](https://vitejs.dev/)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24528037.svg)](https://doi.org/10.5281/zenodo.24528037)
[![Интерактивная веб-версия](https://img.shields.io/badge/Live%20Web-turtleshell.iqumnov.com-emerald.svg)](https://turtleshell.iqumnov.com)
[![Автор: Матвей Игумнов](https://img.shields.io/badge/Author-Matvei%20Igumnov-blue.svg)](https://github.com/Iqumnov)

> **Интерактивное веб-приложение**: [https://turtleshell.iqumnov.com](https://turtleshell.iqumnov.com)  
> Физический симулятор реального времени, исполняемый непосредственно в браузере на Cloudflare Pages без необходимости установки бэкенда. Моделирует 4 архитектуры квантовых процессоров (QPU), 5 сценариев многопользовательских атак по побочным каналам и 4 защитных контура на чистом TypeScript, а также поддерживает подключение к локальному демону на Python.

---

## 1. Архитектура платформы

TurtleShell предоставляет многоконтурную архитектуру безопасности для обеспечения пространственной и временной изоляции процессов в модели Zero-Trust между независимыми пользователями, выполняющими задачи на общем квантовом процессоре (QPU).

### Четыре контура защиты

1. **Контур 1 — Физическое пространственное секционирование и изоляция наводок**:
   - Вычисляет лапласиан графа $L = D - |J|$ топологии связности кубитов.
   - Спектральная бисекция на основе вектора Фидлера минимизирует паразитные члены гамильтониана $ZZ$-кросстока на межпользовательской границе.
   - Адаптивный фильтр наименьших средних квадратов (LMS) динамически компенсирует паразитные утечки СВЧ-импульсов управления ($e(k) = d(k) - \mathbf{w}^T \mathbf{u}$).

2. **Контур 2 — Верификация доверенного компилятора и контроль целостности схем**:
   - Криптографическая фиксация хэша SHA-256 промежуточного представления клиентской схемы.
   - Анализ транспиляции алгоритмом Isolation Forest без учителя для выявления паразитных вентилей, аномального растяжения импульсов и манипуляций частотами.

3. **Контур 3 — Временная буферная изоляция и тепловое гашение состояний**:
   - Подавление остаточных фононных возбуждений и перегрева криостата между сессиями клиентов.
   - Динамический расчет аналитической длительности лазерного охлаждения $\tau_b$:
     $$\tau_b = \frac{1}{\eta} \ln \left( \frac{\bar{n}_0 - \dot{n}/\eta}{n^* - \dot{n}/\eta} \right)$$
   - Применение пауз охлаждения до тех пор, пока заселенность колебательной моды не достигнет безопасного порога $\bar{n} \le n^*$.

4. **Контур 4 — Дифференциальная телеметрия и статистический контроль процессов (SPC)**:
   - Мониторинг дрейфа калибровки в реальном времени с использованием метода синтетических частот:
     $$\nu_{\text{syn}} = \frac{\nu_+ + \nu_-}{2}$$
   - Непараметрический детектор аномалий Колмогорова-Смирнова с адаптивными порогами распределения Стьюдента ($Z > 3.5\sigma$ / $6.87$).
   - 16-мерный детектор подпространства телеметрии на базе стандартизированного метода главных компонент (`StandardScaler` + `PCA(4)`) для выявления скрытых микроархитектурных каналов утечки.

---

## 2. Поддерживаемые архитектуры квантовых процессоров (QPU)

TurtleShell моделирует 4 канонические аппаратные платформы с физическими параметрами, строго основанными на рецензируемых научных публикациях:

| Идентификатор | Архитектура | Кубиты | Топология взаимодействия | Физические параметры | Аналог в EuroHPC / ЕС |
|---|---|---|---|---|---|
| `trapped_ion_paul_trap` | Линейная ловушка Пауля ($^{40}\text{Ca}^+$) | 20–50 | Общая колебательная шина | Индивидуальная адресация, скорость нагрева $\dot{n} \approx 0.02\text{--}0.1\,\text{с}^{-1}$ | AQT IBEX / PINE (Инсбрук / EuroHPC JU) |
| `sr_optical_lattice` | 2D оптическая решетка ($^{87}\text{Sr}$) | 100 | Ближайшие соседи (Ридберг) | Оптические дипольные ловушки (~1 мкК в УВВ-камере 300 К), $\nu_{\text{syn}}$ | PASQAL Fresnel / нейтральные атомы EuroHPC JU |
| `eagle` | Сверхпроводниковые трансмоны | 127 | Heavy-Hex (фиксированные связи) | Кросс-резонансные вентили, статическая связь $ZZ$ ($J \approx 4.8\,\text{кГц}$) | Стандартная архитектура трансмонов |
| `heron` | Сверхпроводниковые трансмоны | 133 | Heavy-Hex (перестраиваемые связи) | Быстрые перестраиваемые потоковые связи, подавление наводок ($J \approx 1.1\,\text{кГц}$) | IQM Radiance / Spark (Финляндия / Германия / EuroHPC) |

### Контекст европейской квантовой инфраструктуры (EuroHPC JU)

Люксембург является административной и технологической штаб-квартирой совместного предприятия **EuroHPC Joint Undertaking (EuroHPC JU)**, координирующего квантовые вычисления в Европе (включая **LuxProvide MeluXina** в Биссене и **LuxQCI / EAGLE-1**):
- **Ионные ловушки AQT**: Модель `trapped_ion_paul_trap` напрямую воспроизводит колебательную динамику и утечки СВЧ-излучения процессоров AQT $^{40}\text{Ca}^+$, закупаемых для центров EuroHPC.
- **Нейтральные атомы ($^{87}\text{Sr}$ / класс PASQAL)**: Платформа `sr_optical_lattice` отражает физику 2D ридберговской блокады ($R_b \approx 5.2\,\text{мкм}$ при $a = 4.0\,\text{мкм}$) европейских нейроатомных систем EuroHPC.
- **Сверхпроводниковые процессоры IQM**: Модель с перестраиваемыми связями (`heron`) моделирует динамическую изоляцию современных европейских процессоров IQM.
- **Гибридное облако MeluXina**: Обеспечивает уровень изоляции Zero-Trust для параллельного выполнения академических и коммерческих квантовых вычислений.

---

## 3. Режимы исполнения и структура документации

### Режимы работы:
- **Режим А (Автономный веб-клиент)**: Развернут на Cloudflare Pages ([https://turtleshell.iqumnov.com](https://turtleshell.iqumnov.com)), все вычисления происходят на клиенте в изолированной песочнице браузера на TypeScript (`clientEngine.ts`) с нулевыми сетевыми задержками.
- **Режим B (Академический бенчмарк-комплекс `qib`)**: Пакет на Python (`packages/quantum-isolation-benchmark`) для строгой верификации уравнения Линдблада в QuTiP и автоматизированной генерации отчетов.

Документация построена по фреймворку **Diataxis** и доступна в [docs/README.md](docs/README.md).

---

## 4. Быстрый старт и установка

### Универсальный скрипт (Linux / macOS / WSL)
```bash
curl -sSL https://raw.githubusercontent.com/Iqumnov/TurtleShell/main/install.sh | bash
```

### Запуск через Docker Compose
```bash
git clone https://github.com/Iqumnov/TurtleShell.git
cd TurtleShell
docker-compose up --build
```
Интерфейс доступен по адресу [http://localhost:5173](http://localhost:5173).

---

## 5. Использование CLI для бенчмаркинга (`qib`)

```bash
# Комплексный аудит изоляции по всем 4 платформам
qib benchmark --provider all --output isolation_report.md

# Верификация динамики охлаждения Контура 3 через уравнение Линдблада в QuTiP
qib verify-qutip

# Спектральное планирование задач в условиях атаки Crosstalk
qib schedule --platform heron --tenants 3 --algo spectral
```

---

## 6. Математический аппарат и трассируемость

| Раздел спецификации | Контур защиты / Функция | Физическое уравнение | Реализация в кодовой базе |
|---|---|---|---|
| **§5.1** | **Контур 1: Спектральное разбиение** | $L = D - \|J\| \implies \min_{\mathbf{x} \perp \mathbf{1}, \|\mathbf{x}\|=1} \mathbf{x}^T L \mathbf{x}$ | `backend/app/simulation/scheduler.py` |
| **§5.1** | **Контур 1: Адаптивный LMS-фильтр** | $\mathbf{w}(k+1) = \mathbf{w}(k) + 2\mu e(k)\mathbf{u}(k)$ | `backend/app/simulation/defense.py` |
| **§5.2** | **Контур 2: Хэширование и аудит** | $\text{SHA256}(C) \parallel \text{IsoForest}(X) \le \theta$ | `backend/app/ml/models.py` |
| **§5.3** | **Контур 3: Буфер лазерного охлаждения** | $\tau_b = \frac{1}{\eta} \ln \left( \frac{\bar{n}_0 - \dot{n}/\eta}{n^* - \dot{n}/\eta} \right)$ | `backend/app/simulation/defense.py` |
| **§5.4** | **Контур 4: Дифференциальный монитор** | $Z = \frac{\|x - \mu\|}{\sigma} \ge Z_{\text{crit}}$ | `backend/app/simulation/defense.py` |
| **§5.4** | **Контур 4: Автоэнкодер телеметрии** | $\mathcal{L}(x, \hat{x}) = \|x - \text{Dec}(\text{Enc}(x))\|_2^2$ | `backend/app/ml/models.py` |
| **§6.0** | **Экономика: Финансовая окупаемость** | $\text{Чистая выгода} = \text{Экономия} - \text{Накладные расходы}$ | `backend/app/main.py` |
| **Lean 4** | **Формальные инварианты (0 `sorry`)** | ПП-определенность $L$, граница NLMS, $\tau_b > 0$, Зееман, $T_2 \le 2T_1$ | `proofs/TurtleShellProofs.lean` |

---

## 7. Цитирование

При использовании программного комплекса **TurtleShell** в исследованиях просьба указывать ссылку на репозиторий:

```bibtex
@software{igumnov2026turtleshell,
  author       = {Igumnov, Matvei Dmitrievich},
  title        = {TurtleShell: Multi-Contour Process Isolation and Side-Channel Defense Framework for Multi-Tenant Quantum Clouds},
  year         = {2026},
  publisher    = {GitHub},
  version      = {1.0.0},
  doi          = {10.5281/zenodo.24528037},
  url          = {https://github.com/Iqumnov/TurtleShell}
}
```

---

## 8. Автор, аффилиация и академический статус

Автор заявляет об отсутствии конфликта интересов и личных связей, способных повлиять на результаты разработки.

### Автор
**Матвей Дмитриевич Игумнов** (ORCID: [0009-0001-7924-1522](https://orcid.org/0009-0001-7924-1522))  
   *Кафедра «Информационная безопасность», Московский политехнический университет, Москва, Россия*  
   Email: `matvei@iqumnov.com`

---

## 9. Лицензия

Проект распространяется под открытой лицензией **MIT** — подробности в файле [LICENSE](LICENSE).
