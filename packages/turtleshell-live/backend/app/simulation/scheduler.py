import random
import networkx as nx
from typing import List, Dict, Tuple, Set, Any
from .qpu import VirtualQPU

class MultiTenantScheduler:
    """Manages allocation of qubits to multiple tenants on a shared QPU."""
    
    def __init__(self, qpu: VirtualQPU):
        self.qpu = qpu
        self._cached_spectral_key: Any = None
        self._cached_spectral_alloc: Any = None

    def execute_allocation(self, algorithm: str, tenant_demands: Dict[int, int]) -> Dict[int, List[int]]:
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
            
        # Proportionally scale demands to fit inside QPU capacity.
        # This guarantees every tenant gets at least 1 qubit and the
        # total never exceeds the number of physical qubits.
        total_q = len(self.qpu.qubits)
        n_tenants = len(tenant_demands)
        
        if n_tenants == 0:
            return {}
        
        total_demand = sum(tenant_demands.values())
        adjusted_demands = {}
        
        if total_demand <= total_q:
            # Demands fit — use as-is
            for tid, demand in tenant_demands.items():
                adjusted_demands[tid] = max(1, demand)
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
            return self._schedule_spectral_partitioning(adjusted_demands)
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

    def _schedule_spectral_partitioning(self, tenant_demands: Dict[int, int]) -> Dict[int, List[int]]:
        """
        TurtleShell Level 1 Scheduler.
        Builds coupling graph, runs Louvain/spectral modularity clustering to find
        strongly-connected, low-crosstalk zones, maps tenants to isolated clusters,
        and disables boundary couplers.
        
        Each qubit is assigned to exactly one tenant — no overwrites.
        """
        n_tenants = len(tenant_demands)
        if n_tenants == 0:
            return {}
            
        cache_key = (self.qpu.layout_type, n_tenants, tuple(sorted(tenant_demands.items())), len(self.qpu.qubits))
        if self._cached_spectral_key == cache_key and self._cached_spectral_alloc is not None:
            allocations, disabled_pairs = self._cached_spectral_alloc
            for tenant_id, assigned in allocations.items():
                for q_id in assigned:
                    if q_id in self.qpu.qubits:
                        self.qpu.qubits[q_id].active_tenant = tenant_id
            for c in self.qpu.couplers:
                if (c.q1, c.q2) in disabled_pairs or (c.q2, c.q1) in disabled_pairs:
                    c.active = False
                    c.zz_crosstalk = 0.0
            return allocations
        
        # Create networkx graph of couplers
        G = nx.Graph()
        G.add_nodes_from(self.qpu.qubits.keys())
        for c in self.qpu.couplers:
            weight = max(0.1, 10.0 - c.zz_base)
            G.add_edge(c.q1, c.q2, weight=weight)
            
        # Run modularity partitioning, requesting at least n_tenants communities
        # by adjusting resolution parameter upward when needed
        # Spectral Clustering on Graph Laplacian (SPECS §5.1.1)
        try:
            from sklearn.cluster import SpectralClustering
            adj_matrix = nx.to_numpy_array(G, weight='weight')
            sc = SpectralClustering(
                n_clusters=min(n_tenants, len(G.nodes())),
                affinity='precomputed',
                assign_labels='kmeans',
                random_state=42
            )
            labels = sc.fit_predict(adj_matrix)
            
            nodes = list(G.nodes())
            comm_dict: Dict[int, Set[int]] = {}
            for idx, label in enumerate(labels):
                comm_dict.setdefault(label, set()).add(nodes[idx])
            communities = list(comm_dict.values())
            
            # Ensure we have enough community sets for all tenants
            while len(communities) < n_tenants:
                communities = sorted(communities, key=len, reverse=True)
                largest = list(communities[0])
                mid = len(largest) // 2
                if mid == 0:
                    break
                communities = [set(largest[:mid]), set(largest[mid:])] + communities[1:]
        except Exception:
            from networkx.algorithms.community import louvain_communities
            communities = list(louvain_communities(G, seed=42, resolution=1.2))
                
        # Sort communities by size, descending
        communities = sorted(communities, key=len, reverse=True)
        
        # Build a global pool of unassigned qubits from all communities
        # Track which qubits have already been assigned
        assigned_global = set()
        
        # Create ordered list of community membership for each qubit
        qubit_community = {}
        for comm_idx, comm in enumerate(communities):
            for q_id in comm:
                qubit_community[q_id] = comm_idx
        
        allocations = {}
        tenant_list = list(tenant_demands.items())
        
        for idx, (tenant_id, num_qubits) in enumerate(tenant_list):
            assigned = []
            
            # Primary community for this tenant
            comm_idx = idx % len(communities)
            comm_nodes = [n for n in communities[comm_idx] if n not in assigned_global]
            
            # Take up to demand from primary community
            take = min(num_qubits, len(comm_nodes))
            assigned = comm_nodes[:take]
            
            # If primary community didn't have enough, grab from other communities
            if len(assigned) < num_qubits:
                needed = num_qubits - len(assigned)
                for other_idx in range(len(communities)):
                    if other_idx == comm_idx:
                        continue
                    available = [n for n in communities[other_idx] if n not in assigned_global and n not in assigned]
                    take_extra = min(needed, len(available))
                    assigned.extend(available[:take_extra])
                    needed -= take_extra
                    if needed <= 0:
                        break
                        
            allocations[tenant_id] = assigned
            assigned_global.update(assigned)
            for q_id in assigned:
                self.qpu.qubits[q_id].active_tenant = tenant_id
                
        # DISABLE couplers connecting different active tenants (L1 coupler de-tuning)
        disabled_pairs = set()
        for c in self.qpu.couplers:
            t1 = self.qpu.qubits[c.q1].active_tenant
            t2 = self.qpu.qubits[c.q2].active_tenant
            if t1 is not None and t2 is not None and t1 != t2:
                # Disable the boundary coupler
                c.active = False
                c.zz_crosstalk = 0.0
                disabled_pairs.add((c.q1, c.q2))
                
        self._cached_spectral_key = cache_key
        self._cached_spectral_alloc = (allocations, disabled_pairs)
        return allocations
