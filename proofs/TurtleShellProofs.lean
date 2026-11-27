/-
  TurtleShell Formal Verification Suite (Lean 4)
  Machine-checked invariants for Contours 1, 3, 4 and physical coherence bounds.
-/

namespace TurtleShellFormal

/-- Auxiliary non-negativity of integer squares: d * d >= 0. -/
theorem int_sq_nonneg (d : Int) : 0 ≤ d * d := by
  by_cases h : 0 ≤ d
  · exact Int.mul_nonneg h h
  · have hn : 0 ≤ -d := by omega
    have hmul : 0 ≤ (-d) * (-d) := Int.mul_nonneg hn hn
    simpa [Int.neg_mul_neg] using hmul

/-- Contour 1: Per-edge Graph Laplacian quadratic form w * (x_i - x_j)^2 >= 0 for w >= 0. -/
def laplacianEdgeQuad (w xi xj : Int) : Int :=
  w * ((xi - xj) * (xi - xj))

theorem laplacian_edge_nonneg (w xi xj : Int) (hw : 0 ≤ w) :
    0 ≤ laplacianEdgeQuad w xi xj := by
  unfold laplacianEdgeQuad
  exact Int.mul_nonneg hw (int_sq_nonneg (xi - xj))

/-- Contour 1: Graph Laplacian quadratic form vanishes identically on constant vectors (L * 1 = 0). -/
theorem laplacian_constant_nullspace (w01 w12 w02 c : Int) :
    laplacianEdgeQuad w01 c c + laplacianEdgeQuad w12 c c + laplacianEdgeQuad w02 c c = 0 := by
  unfold laplacianEdgeQuad
  simp

/-- Contour 1: 3-node weighted Graph Laplacian L = D - W is positive semi-definite. -/
theorem laplacian_3node_psd (w01 w12 w02 x0 x1 x2 : Int)
    (h01 : 0 ≤ w01) (h12 : 0 ≤ w12) (h02 : 0 ≤ w02) :
    0 ≤ laplacianEdgeQuad w01 x0 x1 + laplacianEdgeQuad w12 x1 x2 + laplacianEdgeQuad w02 x0 x2 := by
  have a := laplacian_edge_nonneg w01 x0 x1 h01
  have b := laplacian_edge_nonneg w12 x1 x2 h12
  have c := laplacian_edge_nonneg w02 x0 x2 h02
  omega

/-- Contour 1: Isolation index numerator satisfies 0 <= 100 * (J_random - J_post) <= 100 * J_random. -/
theorem isolation_index_bounds (j_post j_random : Int)
    (hp : 0 ≤ j_post) (hle : j_post ≤ j_random) :
    0 ≤ 100 * (j_random - j_post) ∧ 100 * (j_random - j_post) ≤ 100 * j_random := by
  constructor <;> omega

/-- Contour 1: Spectral detuning (J_detuned <= J_raw) strictly improves or preserves isolation. -/
theorem detuning_improves_isolation (j_detuned j_raw j_random : Int)
    (hdet : j_detuned ≤ j_raw) :
    100 * (j_random - j_raw) ≤ 100 * (j_random - j_detuned) := by
  omega

/-- Contour 1: NLMS step stability bound: 2 * 45 * ||u||^2 < 100 * (||u||^2 + eps),
    guaranteeing 2 * mu_eff * ||u||^2 < 0.9 < 2 for all signal amplitudes. -/
theorem nlms_step_stability_bound (norm_sq eps : Int) (hn : 0 ≤ norm_sq) (he : 0 < eps) :
    2 * 45 * norm_sq < 100 * (norm_sq + eps) := by
  omega

/-- Contour 3: Laser cooling buffer positivity condition (n* > n_dot / eta, n0 > n*):
    guarantees numerator (n0 * eta - n_dot) > denominator (n* * eta - n_dot) > 0. -/
theorem laser_cooling_buffer_positive (n0 n_star n_dot eta : Int)
    (_heta : 0 < eta)
    (hsteady : n_dot < n_star * eta)
    (habove : n_star * eta < n0 * eta) :
    0 < n_star * eta - n_dot ∧ n_star * eta - n_dot < n0 * eta - n_dot := by
  constructor <;> omega

/-- Contour 4: Synthetic frequency exact first-order Zeeman cancellation:
    (nu0 + deltaZ + quad) + (nu0 - deltaZ + quad) = 2 * (nu0 + quad). -/
theorem synthetic_freq_zeeman_cancellation (nu0 deltaZ quad : Int) :
    (nu0 + deltaZ + quad) + (nu0 - deltaZ + quad) = 2 * (nu0 + quad) := by
  omega

/-- Physical quantum coherence bound: clamped T2 <= 2 * T1 holds universally. -/
theorem coherence_t2_bound (t1 t2_raw : Int) :
    min (2 * t1) t2_raw ≤ 2 * t1 := by
  omega

end TurtleShellFormal

