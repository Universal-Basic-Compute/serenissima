"""
Helper queries for v1.2 Energy Physics Tick.

DOCS: docs/physics/IMPLEMENTATION_Physics.md
"""

from typing import List, Dict, Any, Tuple
from runtime.physics.graph import GraphQueries
from runtime.physics.constants import COLD_THRESHOLD


class TickQueries:
    """Helper queries for graph tick."""

    def __init__(self, read: GraphQueries):
        self.read = read

    def get_moments_by_status(self, status: str) -> List[Dict]:
        """Get moments with a given status."""
        try:
            return self.read.query(f"""
            MATCH (m:Moment)
            WHERE m.status = '{status}'
            RETURN m.id AS id, m.energy AS energy, m.weight AS weight,
                   m.duration_minutes AS duration
            """)
        except:
            return []

    def get_hot_links_to_moment(self, moment_id: str, n: int = 20) -> List[Dict]:
        """Get top N hot links from actors to a moment."""
        try:
            return self.read.query(f"""
            MATCH (a:Actor)-[r]->(m:Moment {{id: '{moment_id}'}})
            WHERE type(r) IN ['EXPRESSES', 'CAN_SPEAK', 'SAID']
            RETURN a.id AS actor_id, a.energy AS actor_energy, a.weight AS actor_weight,
                   r.weight AS weight, r.energy AS link_energy
            ORDER BY coalesce(r.energy, 0) * coalesce(r.weight, 1) DESC
            LIMIT {n}
            """)
        except:
            return []

    def get_hot_links_from_moment(self, moment_id: str, n: int = 20) -> List[Dict]:
        """Get top N hot outgoing links from a moment."""
        try:
            return self.read.query(f"""
            MATCH (m:Moment {{id: '{moment_id}'}})-[r]->(t)
            WHERE NOT t:Actor
            RETURN t.id AS target_id, labels(t)[0] AS target_type,
                   t.energy AS target_energy, t.weight AS target_weight,
                   r.weight AS weight, r.energy AS link_energy
            ORDER BY coalesce(r.energy, 0) * coalesce(r.weight, 1) DESC
            LIMIT {n}
            """)
        except:
            return []

    def get_hot_links_to_actors(self, narrative_id: str, n: int = 20) -> List[Dict]:
        """Get top N hot links from narrative to actors."""
        try:
            return self.read.query(f"""
            MATCH (a:Actor)-[r:BELIEVES]->(n:Narrative {{id: '{narrative_id}'}})
            RETURN a.id AS actor_id, a.energy AS actor_energy, a.weight AS actor_weight,
                   r.weight AS weight, r.energy AS link_energy
            ORDER BY coalesce(r.energy, 0) * coalesce(r.weight, 1) DESC
            LIMIT {n}
            """)
        except:
            return []

    def count_hot_cold_links(self) -> Tuple[int, int]:
        """Count hot vs cold links in the graph."""
        try:
            result = self.read.query(f"""
            MATCH ()-[r]->()
            WHERE r.energy IS NOT NULL
            RETURN
                sum(CASE WHEN r.energy * coalesce(r.weight, 1) > {COLD_THRESHOLD} THEN 1 ELSE 0 END) AS hot,
                sum(CASE WHEN r.energy * coalesce(r.weight, 1) <= {COLD_THRESHOLD} THEN 1 ELSE 0 END) AS cold
            """)
            if result:
                return int(result[0].get('hot', 0)), int(result[0].get('cold', 0))
            return 0, 0
        except:
            return 0, 0

    def get_shared_narratives(self, m1_id: str, m2_id: str) -> List[str]:
        """Get narrative IDs that both moments connect to."""
        try:
            result = self.read.query(f"""
            MATCH (m1:Moment {{id: '{m1_id}'}})-[:ABOUT]->(n:Narrative)<-[:ABOUT]-(m2:Moment {{id: '{m2_id}'}})
            RETURN DISTINCT n.id AS narrative_id
            """)
            return [r.get('narrative_id') for r in result if r.get('narrative_id')]
        except:
            return []
