"""
engine/graph_builder.py
─────────────────────────
League-agnostic base class for the holonic RDF Dataset builders. The
four-layer holonic model (interior/boundary/projection/context named
graphs) is architecture, not NFL-specific — what's NFL-specific is which
predicates/graphs each league's builder writes.

This base class owns the parts every league's builder does identically:
Dataset construction + namespace binding, loading .ttl ontology files into
the default (boundary) graph, serializing the dataset or a single named
graph to disk, and caching one interior graph per entity (e.g. per team) so
repeated writes to the same holon reuse the same rdflib Graph object.

leagues/<league>/builders/rdf_builder.py subclasses this and adds the
league's own namespaces, predicates, and triple-writing methods.
"""

from __future__ import annotations

import logging
from pathlib import Path

from rdflib import Dataset, Graph, Namespace, URIRef

logger = logging.getLogger(__name__)


class HolonicDatasetBuilder:
    """
    Common Dataset/graph plumbing for a holonic RDF builder.

    Parameters
    ----------
    namespaces : prefix → Namespace, bound onto every graph this builder
                 creates (the dataset itself and any graph passed through
                 `_bind_namespaces`).
    """

    def __init__(self, namespaces: dict[str, Namespace]) -> None:
        self._namespaces = namespaces
        self.dataset = Dataset()
        self._bind_namespaces(self.dataset)

    def _bind_namespaces(self, g: Graph | Dataset) -> None:
        for prefix, ns in self._namespaces.items():
            g.bind(prefix, ns)

    def load_ontologies(self, ontology_dir: str | Path) -> None:
        """Parse all .ttl files from the ontology directory into the default graph."""
        path = Path(ontology_dir)
        default_g = self.dataset.default_context
        for ttl in sorted(path.glob("*.ttl")):
            logger.info("Loading ontology: %s", ttl)
            default_g.parse(str(ttl), format="turtle")

    def serialize(self, path: str | Path, fmt: str = "trig") -> None:
        """Write the full dataset to disk."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.dataset.serialize(destination=str(path), format=fmt)
        logger.info("Dataset serialised → %s", path)

    def serialize_graph(self, graph_iri: str, path: str | Path,
                        fmt: str = "turtle") -> None:
        """Serialize a single named graph."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        g = self.dataset.graph(URIRef(graph_iri))
        g.serialize(destination=str(path), format=fmt)
        logger.info("Graph %s → %s", graph_iri, path)

    def _cached_graph(self, cache: dict[str, Graph], iri: URIRef) -> Graph:
        """
        Return the (creating-and-binding-namespaces-on-first-use) graph for
        `iri`, memoized in `cache` — the per-entity interior-graph pattern
        used for e.g. one graph per team, keyed by whatever dict the caller
        maintains for that entity kind.
        """
        cached = cache.get(str(iri))
        if cached is not None:
            return cached
        g = self.dataset.graph(iri)
        self._bind_namespaces(g)
        cache[str(iri)] = g
        return g
