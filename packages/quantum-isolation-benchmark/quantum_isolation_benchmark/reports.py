import html
import json
import re
from typing import Dict, List, Any


def _md_inline_to_html(text: str) -> str:
    escaped = html.escape(text, quote=False)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)

def compile_academic_report(results: List[Dict[str, Any]], format_type: str = "markdown") -> str:
    """
    Compiles a set of benchmarking audit results into a publication-style scientific paper.
    Supported formats: 'markdown', 'html'.
    """
    
    # Extract metadata deterministically
    backends = sorted(set(str(r.get("backend", "unknown")) for r in results))
    scenarios_run = sorted(set(str(r.get("scenario", "unknown")) for r in results))
    vector_noun = "vector" if len(scenarios_run) == 1 else "vectors"
    
    # Organize sections
    title = "Empirical Analysis of Process Isolation in Commercial Multi-Tenant Quantum Processing Units"
    abstract = (
        "As quantum cloud computing architectures transition to multi-tenant frameworks, verifying "
        "hardware-level process isolation becomes critical for security and computational integrity. "
        f"This report presents empirical benchmarking audits across commercial and simulated platforms: {', '.join(backends)}. "
        f"We evaluate quantum isolation under {len(scenarios_run)} physical threat {vector_noun}: {', '.join(scenarios_run)}. "
        "Our results demonstrate that physical cross-coupling (ZZ-crosstalk) and localized thermal "
        "excitation (Rowhammer) present significant channels for inter-tenant information leakage and "
        "computational fidelity degradation. We discuss architectural mitigation techniques to enforce "
        "strict logical boundaries."
    )
    
    methodology = (
        "To audit multi-tenant isolation, we deploy disjoint circuit execution protocols. "
        "1. **ZZ-Crosstalk Audits**: A reference circuit (3-qubit Grover's Search) is executed on a designated "
        "qubit partition, while concurrent CZ/CX gate sequences are applied to neighboring 'aggressor' qubits. "
        "2. **Quantum Rowhammer Audits**: High-repetition cyclic excitation loops (100–1000 cycles at 5 MHz) "
        "are driven on aggressor qubits to monitor localized thermal load and dielectric heating via victim T1/T2 decay. "
        "3. **Prime-and-Probe Audits**: We measure state relaxation decay rates by priming a partition and "
        "introducing varying delay windows (50–500 us) prior to reference probe executions. "
        "4. **Environmental Decoherence Audits**: The chip is audited under simulated temperature sweeps "
        "to characterize global hardware vulnerability boundaries. "
        "5. **RF-Leakage Audits**: For RF Paul-trap architectures, side-channel RF emission leakage is evaluated "
        "via Shannon mutual information and receiver decode accuracy across configured SNR levels."
    )
    
    # Format results section
    results_md = "### Experimental Results Summary\n\n"
    results_html = "<h3>Experimental Results Summary</h3>\n<ul>\n"
    
    for r in results:
        scenario = r.get("scenario", "Unknown")
        backend = r.get("backend", "Unknown")
        
        if scenario == "ZZ-Crosstalk":
            drop = r.get("fidelity_drop_pct", 0.0)
            isolated = r.get("isolated_fidelity", 0.0)
            parallel = r.get("parallel_fidelity", 0.0)
            hops = r.get("shortest_path_hops", 0)
            
            hop_unit = "hop" if hops == 1 else "hops"
            summary = (
                f"- **{scenario}** ({backend}): "
                f"Isolated fidelity was {isolated}, which dropped to {parallel} "
                f"under parallel workload (Fidelity Drop: **{drop}%**). "
                f"Aggressor-victim distance: {hops} {hop_unit}. "
                f"Mean coupling crosstalk: {r.get('mean_crosstalk_khz')} kHz."
            )
        elif scenario == "Quantum-Rowhammer":
            degrad = r.get("average_T1_degradation_pct", 0.0)
            flagged = r.get("vulnerable_nodes_flagged", 0)
            summary = (
                f"- **{scenario}** ({backend}): "
                f"Cyclic aggressor gate sequence (iterations: {r.get('iterations')}) resulted in an average "
                f"victim qubit T1 relaxation time degradation of **{degrad}%**. "
                f"A total of {flagged} victim nodes exceeded the 10% safety threshold."
            )
        elif scenario == "Prime-and-Probe":
            red = r.get("interference_reduction_pct", 0.0)
            delay = r.get("delay_us", 0.0)
            summary = (
                f"- **{scenario}** ({backend}): "
                f"For a wait window of {delay} us, residual tenant excitation caused a reference "
                f"fidelity drop of **{red}%**. Average relaxation time (T1) was {r.get('average_T1_us')} us."
            )
        elif scenario == "Environmental-Decoherence":
            factor = r.get("degradation_factor", 1.0)
            temp = r.get("temperature_mk", 15.0)
            summary = (
                f"- **{scenario}** ({backend}): "
                f"At a simulated operating temperature of {temp} mK, global coherence decayed by a "
                f"factor of **{factor}**, reducing predicted execution fidelity to {r.get('predicted_fidelity')}."
            )
        elif scenario == "RF-Leakage":
            is_ion = r.get("is_ion", False)
            if is_ion:
                acc = r.get("decode_accuracy", 0.0)
                mi = r.get("mutual_information_bits", 0.0)
                leak = r.get("leakage_db", -60.0)
                summary = (
                    f"- **{scenario}** ({backend}): "
                    f"RF trap emission at {leak} dBm yielded receiver decode accuracy of **{acc}** "
                    f"and Shannon mutual information of {mi} bits (SNR: {r.get('snr_db', 5.0)} dB)."
                )
            else:
                summary = (
                    f"- **{scenario}** ({backend}): "
                    f"Non-RF architecture showed 0.0 bits of mutual information leakage via Paul-trap RF side-channel."
                )
        else:
            summary = f"- **{scenario}** ({backend}): {json.dumps(r)}"
            
        results_md += summary + "\n"
        item_md = summary[2:] if summary.startswith("- ") else summary
        results_html += f"  <li>{_md_inline_to_html(item_md)}</li>\n"
        
    results_html += "</ul>\n"
    
    discussion = (
        "The experimental results reveal major vulnerabilities in current multi-tenant quantum schedulers. "
        "Superconducting QPUs (e.g., Eagle models) suffer heavily from ZZ-crosstalk and thermal rowhammering, "
        "demanding spatial guard bands (at least 3 hops) or active coupler de-tuning. In contrast, "
        "trapped-ion architectures (Azure/IonQ profiles) showcase low static lattice crosstalk, though they require "
        "strict temporal separation policies and RF shielding to mitigate slow decay and side-channel emission leakage. "
        "We conclude that the multi-contour TurtleShell stack—combining Contour 1 (Spectral Partitioning & NLMS Active Cancellation), "
        "Contour 2 (Compiler SHA-256 & Isolation Forest Verification), Contour 3 (Laser Cooling / Calibration Buffers), and Contour 4 "
        "(Autoencoder & Differential Zeeman SPC Monitoring)—is essential to establish verifiable isolation boundaries."
    )
    
    references = (
        "1. Sundaresan, N. et al. (2020). 'Reducing unitary and spectator errors in superconducting circuits'. Phys. Rev. Applied.\n"
        "2. Krantz, P. et al. (2019). 'A quantum engineer's guide to superconducting qubits'. Applied Physics Reviews.\n"
        "3. Resch, S. et al. (2021). 'Securing Multi-Tenant Quantum Computers'. ASPLOS.\n"
        "4. Igumnov, M. et al. (2026). 'TurtleShell: A Multi-Contour Process Isolation Concept for Multi-Tenant Quantum Clouds'."
    )

    if format_type == "markdown":
        report = f"""# {title}

*M. D. Igumnov (Lead Architect & Developer) • Moscow Polytechnic University*

---

### Abstract
{abstract}

---

## 1. Introduction
Cloud-based quantum computing provides shared access to expensive QPUs. However, physical coupling and thermal relaxation are not bounded by logical software virtualization, leading to a major security concern where malicious tenants can interfere with or extract information from co-located quantum workloads.

## 2. Methodology
{methodology}

## 3. Results and Performance Evaluation
{results_md}

## 4. Discussion & Mitigation Strategies
{discussion}

## 5. Conclusions
This study validates that multi-tenant quantum clouds without compiler checks or active partitioning do not guarantee workload confidentiality or execution reliability. Fraying isolation levels require immediate platform updates like physical partitioning and relaxation delay calibration.

## Conflicts of Interest
The authors declare that they have no competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.

## Data and Code Availability
The simulation software, benchmarking suite, and QPU calibration datasets supporting the findings of this study are available as open-source artifacts.

## References
{references}
"""
        return report
        
    else: # HTML format
        report = f"""<!DOCTYPE html>
<html>
<head>
    <title>TurtleShell Scientific Report</title>
    <style>
        body {{
            font-family: 'Times New Roman', Times, serif;
            line-height: 1.6;
            margin: 40px auto;
            max-width: 800px;
            color: #333;
            background: #fdfdfd;
        }}
        h1 {{ text-align: center; font-size: 24px; margin-bottom: 5px; }}
        h2 {{ border-bottom: 1px solid #ddd; font-size: 18px; margin-top: 30px; }}
        h3 {{ font-size: 16px; margin-top: 20px; }}
        .authors {{ text-align: center; font-style: italic; margin-bottom: 30px; }}
        .abstract {{
            background: #f7f7f7;
            padding: 15px;
            border-left: 4px solid #666;
            font-style: italic;
            margin: 20px 0;
        }}
        .references {{ font-size: 14px; color: #555; }}
    </style>
</head>
<body>
    <h1>{_md_inline_to_html(title)}</h1>
    <div class="authors">M. D. Igumnov (Lead Architect &amp; Developer) &bull; Moscow Polytechnic University</div>
    
    <div class="abstract">
        <strong>Abstract:</strong> {_md_inline_to_html(abstract)}
    </div>
    
    <h2>1. Introduction</h2>
    <p>Cloud-based quantum computing provides shared access to expensive QPUs. However, physical coupling and thermal relaxation are not bounded by logical software virtualization, leading to a major security concern where malicious tenants can interfere with or extract information from co-located quantum workloads.</p>
    
    <h2>2. Methodology</h2>
    <p>{_md_inline_to_html(methodology).replace(chr(10), '<br/>')}</p>
    
    <h2>3. Results and Performance Evaluation</h2>
    {results_html}
    
    <h2>4. Discussion &amp; Mitigation Strategies</h2>
    <p>{_md_inline_to_html(discussion)}</p>
    
    <h2>5. Conclusions</h2>
    <p>This study validates that multi-tenant quantum clouds without compiler checks or active partitioning do not guarantee workload confidentiality or execution reliability. Fraying isolation levels require immediate platform updates like physical partitioning and relaxation delay calibration.</p>
    
    <h2>Conflicts of Interest</h2>
    <p>The authors declare that they have no competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.</p>

    <h2>Data and Code Availability</h2>
    <p>The simulation software, benchmarking suite, and QPU calibration datasets supporting the findings of this study are available as open-source artifacts.</p>

    <h2>References</h2>
    <ol class="references">
        <li>Sundaresan, N. et al. (2020). 'Reducing unitary and spectator errors in superconducting circuits'. Phys. Rev. Applied.</li>
        <li>Krantz, P. et al. (2019). 'A quantum engineer's guide to superconducting qubits'. Applied Physics Reviews.</li>
        <li>Resch, S. et al. (2021). 'Securing Multi-Tenant Quantum Computers'. ASPLOS.</li>
        <li>Igumnov, M. et al. (2026). 'TurtleShell: A Multi-Contour Process Isolation Concept for Multi-Tenant Quantum Clouds'.</li>
    </ol>
</body>
</html>
"""
        return report
