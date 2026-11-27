import random
import numpy as np
import networkx as nx
from typing import List, Dict, Tuple, Set, Any
from .qpu import VirtualQPU

class MultiTenantScheduler:
    """Manages allocation of qubits to multiple tenants on a shared QPU."""
    
    def __init__(self, qpu: VirtualQPU):
        self.qpu = qpu
        self._cached_spectral_key: Any = None
        self._cached_spectral_alloc: Any = None

    def execute_allocation(
        self,
        algorithm: str,
        tenant_demands: Dict[int, int],
        defense_l1_active: bool = True,
    ) -> Dict[int, List[int]]:
        """
        Allocates qubits to tenants based on the selected algorithm.
        tenant_demands: dict mapping tenant_id -> number of qubits required.
        Returns: dict mapping tenant_id -> list of assigned qubit IDs.
        """
        # First reset active assignments
        for q in self.qpu.qubits.values():
            q.active_tenant = None
        for c in self.qpu.couplers:
            c.active = True # re-enable all
            c.detuned = False
            c.zz_crosstalk = c.zz_base
            
        # Proportionally scale demands to fit inside QPU capacity.
        # This guarantees every tenant gets at least 1 qubit when possible and the
        # total never exceeds the number of physical qubits.
        total_q = len(self.qpu.qubits)
        n_tenants = len(tenant_demands)
        
        if n_tenants == 0:
            return {}
        
        total_demand = sum(tenant_demands.values())
        adjusted_demands = {}
        
        if n_tenants > total_q:
            # More tenants than qubits: grant 1 qubit each to top-demand tenants until capacity exhausted
            ranked = sorted(tenant_demands.items(), key=lambda kv: (-kv[1], kv[0]))
            for idx, (tid, _) in enumerate(ranked):
                adjusted_demands[tid] = 1 if idx < total_q else 0
        elif total_demand <= total_q:
            # Demands fit — preserve zero demands for idle/queued tenants (e.g. TDM)
            for tid, demand in tenant_demands.items():
                adjusted_demands[tid] = max(0, demand)
        else:
            # Scale down proportionally, ensuring each tenant gets at least 1
            reserved = n_tenants  # 1 qubit minimum per tenant
            remaining = total_q - reserved
            for tid, demand in tenant_demands.items():
                share = max(0, int((demand / total_demand) * remaining))
                adjusted_demands[tid] = 1 + share
            
            # Correct any rounding overflow
            overflow = sum(adjusted_demands.values()) - total_q
            if overflow > 0:
                # Trim from the largest allocations
                sorted_tids = sorted(adjusted_demands, key=lambda t: adjusted_demands[t], reverse=True)
                for tid in sorted_tids:
                    if overflow <= 0:
                        break
                    trim = min(overflow, adjusted_demands[tid] - 1)
                    adjusted_demands[tid] -= trim
                    overflow -= trim
            
        algorithm_clean = algorithm.lower().replace("-", "").replace(" ", "").replace("_", "")
        
        if "spectral" in algorithm_clean or "level1" in algorithm_clean or "turtleshell" in algorithm_clean:
            return self._schedule_spectral_partitioning(adjusted_demands, defense_l1_active=defense_l1_active)
        elif "static" in algorithm_clean:
            return self._schedule_static_partitioning(adjusted_demands)
        elif "timedivision" in algorithm_clean or "tdm" in algorithm_clean:
            return self._schedule_tdm(adjusted_demands)
        else: # random
            return self._schedule_random(adjusted_demands)

    def _schedule_random(self, tenant_demands: Dict[int, int]) -> Dict[int, List[int]]:
        # Use a seeded local RNG so the "random" baseline allocation is
        # reproducible per run. Seed 0 is the documented baseline seed.
        _rng = random.Random(0)
        available_qubits = list(self.qpu.qubits.keys())
        _rng.shuffle(available_qubits)
        
        allocations = {}
        for tenant_id, num_qubits in tenant_demands.items():
            if len(available_qubits) == 0:
                allocations[tenant_id] = []
                continue
            # Assign as many as possible, up to demand or remaining pool
            take = min(num_qubits, len(available_qubits))
            assigned = [available_qubits.pop() for _ in range(take)]
            allocations[tenant_id] = assigned
            for q_id in assigned:
                self.qpu.qubits[q_id].active_tenant = tenant_id
        return allocations

    def _schedule_static_partitioning(self, tenant_demands: Dict[int, int]) -> Dict[int, List[int]]:
        """Pre-split qubits linearly by index. Each qubit goes to exactly one tenant."""
        all_qubits = list(self.qpu.qubits.keys())
        total_qubits = len(all_qubits)
        
        allocations = {}
        cursor = 0
        for tenant_id, num_qubits in tenant_demands.items():
            assigned = []
            for _ in range(num_qubits):
                if cursor >= total_qubits:
                    break  # No more qubits available
                assigned.append(all_qubits[cursor])
                cursor += 1
            allocations[tenant_id] = assigned
            for q_id in assigned:
                self.qpu.qubits[q_id].active_tenant = tenant_id
                
        return allocations

    def _schedule_tdm(self, tenant_demands: Dict[int, int]) -> Dict[int, List[int]]:
        # Time-Division Multiplexing runs only 1 tenant's job at a time.
        # In our simulation snapshot, we allocate to the primary/active tenant,
        # leaving other qubits idle, simulating zero co-location crosstalk.
        # Let's assign qubits to tenant 0 (active), other tenants are queued.
        allocations = {}
        available_qubits = list(self.qpu.qubits.keys())
        
        for tenant_id, num_qubits in tenant_demands.items():
            if tenant_id == 0:
                assigned = available_qubits[:num_qubits]
                allocations[tenant_id] = assigned
                for q_id in assigned:
                    self.qpu.qubits[q_id].active_tenant = tenant_id
            else:
                allocations[tenant_id] = [] # Queued
        return allocations

    def _fiedler_order(self, G: nx.Graph, nodes: List[int]) -> List[int]:
        """Return nodes ordered by the Fiedler vector v2 of the unnormalized Laplacian L = D - W."""
        if len(nodes) <= 2:
            return list(nodes)
        sub = G.subgraph(nodes)
        W = nx.to_numpy_array(sub, nodelist=nodes, weight="weight")
        if not np.any(W > 0):
            return list(nodes)
        D = np.diag(W.sum(axis=1))
        L = D - W
        try:
            _, eigvecs = np.linalg.eigh(L)
            v2 = eigvecs[:, 1]
            order = np.argsort(v2, kind="stable")
            return [nodes[int(i)] for i in order]
        except Exception:
            return list(nodes)

    def _spectral_bisect_demands(
        self,
        G: nx.Graph,
        node_pool: List[int],
        demands: List[Tuple[int, int]],
    ) -> Dict[int, List[int]]:
        """Recursively bisect nodes along the Fiedler eigenvector matching exact tenant demand sizes."""
        if not demands:
            return {}
        if len(demands) == 1:
            tid, cap = demands[0]
            return {tid: list(node_pool[:cap])}

        ordered = self._fiedler_order(G, node_pool)
        mid = len(demands) // 2
        left_demands = demands[:mid]
        right_demands = demands[mid:]
        left_count = min(len(ordered), sum(cap for _, cap in left_demands))

        left_nodes = ordered[:left_count]
        right_nodes = ordered[left_count:]

        result = self._spectral_bisect_demands(G, left_nodes, left_demands)
        result.update(self._spectral_bisect_demands(G, right_nodes, right_demands))
        return result

    def _schedule_spectral_partitioning(
        self,
        tenant_demands: Dict[int, int],
        defense_l1_active: bool = True,
    ) -> Dict[int, List[int]]:
        """
        TurtleShell Level 1 Scheduler.
        Builds weighted coupling graph (W_ij = |J_zz|), computes exact Fiedler eigenvector
        v2 of the Graph Laplacian L = D - W (SPECS §5.1.1) for recursive balanced bisection,
        maps tenants to isolated partitions, and detunes boundary couplers when L1 is active.
        """
        n_tenants = len(tenant_demands)
        if n_tenants == 0:
            return {}

        cache_key = (
            self.qpu.layout_type,
            n_tenants,
            tuple(sorted(tenant_demands.items())),
            len(self.qpu.qubits),
            defense_l1_active,
        )
        if self._cached_spectral_key == cache_key and self._cached_spectral_alloc is not None:
            allocations, disabled_pairs = self._cached_spectral_alloc
            for tenant_id, assigned in allocations.items():
                for q_id in assigned:
                    if q_id in self.qpu.qubits:
                        self.qpu.qubits[q_id].active_tenant = tenant_id
            for c in self.qpu.couplers:
                if defense_l1_active and (
                    (c.q1, c.q2) in disabled_pairs or (c.q2, c.q1) in disabled_pairs
                ):
                    c.active = False
                    c.detuned = True
                    c.zz_crosstalk = round(c.zz_base * self.qpu.residual_floor, 6)
            return {tid: list(qids) for tid, qids in allocations.items()}

        G = nx.Graph()
        G.add_nodes_from(self.qpu.qubits.keys())
        for c in self.qpu.couplers:
            if c.active:
                G.add_edge(c.q1, c.q2, weight=max(1e-3, abs(c.zz_base)))

        ordered_demands = sorted(tenant_demands.items(), key=lambda kv: (-kv[1], kv[0]))
        all_nodes = list(self.qpu.qubits.keys())
        allocations = self._spectral_bisect_demands(G, all_nodes, ordered_demands)

        for tenant_id, assigned in allocations.items():
            for q_id in assigned:
                if q_id in self.qpu.qubits:
                    self.qpu.qubits[q_id].active_tenant = tenant_id

        # Attenuate/detune boundary couplers only when Contour 1 (L1) is active
        # and hardware supports tunable coupler detuning (residual_floor < 1.0).
        disabled_pairs: Set[Tuple[int, int]] = set()
        if defense_l1_active and self.qpu.residual_floor < 1.0:
            for c in self.qpu.couplers:
                t1 = self.qpu.qubits[c.q1].active_tenant
                t2 = self.qpu.qubits[c.q2].active_tenant
                if t1 is not None and t2 is not None and t1 != t2:
                    c.active = False
                    c.detuned = True
                    c.zz_crosstalk = round(c.zz_base * self.qpu.residual_floor, 6)
                    disabled_pairs.add((c.q1, c.q2))

        self._cached_spectral_key = cache_key
        self._cached_spectral_alloc = ({tid: list(qids) for tid, qids in allocations.items()}, disabled_pairs)
        return {tid: list(qids) for tid, qids in allocations.items()}
