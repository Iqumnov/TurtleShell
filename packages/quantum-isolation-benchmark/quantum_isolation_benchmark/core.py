from abc import ABC, abstractmethod
from typing import Dict, List, Any, Tuple, Optional

class QuantumProvider(ABC):
    """
    Abstract Base Class representing a Quantum Cloud Provider interface
    for isolation benchmarking audits.
    """
    
    def __init__(self, api_key: Optional[str] = None, endpoint: Optional[str] = None, mock: bool = True):
        self.api_key = api_key
        self.endpoint = endpoint
        self.mock = mock
        self.connected = False
        
    @abstractmethod
    def connect(self) -> bool:
        """Establishes authenticated connection with the provider."""
        pass
        
    @abstractmethod
    def get_topology(self, backend: str) -> Dict[str, Any]:
        """
        Returns chip layout topology including:
        - qubits: list of qubit IDs
        - edges: list of coupling pairs (q1, q2)
        - coordinates: dictionary mapping qubit ID to (x, y) grid coordinates
        """
        pass
        
    @abstractmethod
    def get_calibration(self, backend: str) -> Dict[str, Any]:
        """
        Returns current calibration snap of:
        - T1: dict mapping qubit ID -> T1 time in microseconds
        - T2: dict mapping qubit ID -> T2 time in microseconds
        - gate_errors: dict mapping gate/qubit -> error rate
        - crosstalk: dict mapping coupler/edge -> ZZ strength (kHz)
        """
        pass
        
    @abstractmethod
    def execute_circuits(self, backend: str, circuits: List[Any], shots: int = 1000) -> List[Dict[str, int]]:
        """
        Executes a batch of circuits on the designated backend.
        Returns a list of frequency count dictionaries (e.g. {'00': 450, '11': 550})
        """
        pass
        
    @abstractmethod
    def execute_parallel(self, backend: str, circuits_with_qubits: List[Tuple[Any, List[int]]], shots: int = 1000) -> List[Dict[str, int]]:
        """
        Submits multiple circuits to execute concurrently on disjoint sets of qubits.
        Used to measure physical multi-tenant crosstalk.
        """
        pass
