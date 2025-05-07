┃ Dock System Architecture                                                         ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

The dock system in La Serenissima provides infrastructure for water-based
transportation and connections between land parcels. This document explains the
architecture and implementation of the dock system.


Overview

Docks are special buildings that:

 1 Must be placed along water edges (shorelines)
 2 Provide connection points for roads
 3 Are associated with specific land parcels
 4 Can only be created by administrators (ConsiglioDeiDieci)


System Components

1. Data Model


interface DockData {
  id: string;
  landId: string;
  position: { x: number; y: number; z: number };
  rotation: number; // Rotation in radians
  connectionPoints: { x: number; y: number; z: number }[];
  createdBy: string;
  createdAt: string;
}


2. Service Layer

The BuildingService handles dock creation and management:


class BuildingService {
  // Create a new dock at the specified position
  public async createDock(landId: string, position: Vector3, rotation: number):
Promise<DockData>

  // Get all docks
  public async getDocks(): Promise<DockData[]>

  // Get a specific dock by ID
  public async getDockById(id: string): Promise<DockData | null>
}


3. Water Edge Detection

The WaterEdgeDetector identifies valid placement locations:


class WaterEdgeDetector {
  // Find the nearest water edge to a given position
  public findNearestWaterEdge(position: Vector3): {
    position: Vector3 | null;
    landId: string | null;
    edge: { start: Vector3, end: Vector3 } | null;
  }
}


4. Creation UI

The DockCreator component provides the user interface for dock placement:


interface DockCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  polygons: any[];
  active: boolean;
  onComplete: (dockData: any) => void;
  onCancel: () => void;
}


5. Rendering

The DockRenderer component visualizes docks in the 3D world:


interface DockRendererProps {
  scene: THREE.Scene;
  active: boolean;
}



Dock Creation Process

 1 Initialization:
    • Admin clicks "Create Dock" in the BuildingsToolbar
    • DockCreator component is activated
    • Preview mesh is created in the scene
 2 Placement:
    • User moves cursor over the map
    • WaterEdgeDetector finds valid water edges
    • Preview mesh snaps to nearest water edge
    • Visual feedback indicates valid/invalid placement
 3 Rotation:
    • User adjusts dock rotation using slider or keyboard
    • Preview mesh updates in real-time
 4 Validation:
    • System verifies placement is on a valid water edge
    • Confirms adjacent land parcel exists
    • Checks user has admin permissions
 5 Submission:
    • User clicks "Place Dock" button
    • System sends dock data to server via API
    • BuildingService.createDock() handles persistence
    • Event is emitted: EventTypes.DOCK_PLACED
 6 Rendering:
    • DockRenderer listens for DOCK_PLACED events
    • Creates permanent dock mesh at specified location
    • Adds connection points for road system


Water Edge Detection Algorithm

The water edge detection algorithm:

 1 Examines all land polygons
 2 Identifies edges that border water (not shared with other polygons)
 3 For each edge:
    • Calculates the closest point to the cursor position
    • Determines distance to that point
 4 Returns the closest valid edge and its associated land parcel


// Simplified algorithm
function findNearestWaterEdge(position) {
  let closestEdge = null;
  let closestDistance = Infinity;
  let closestLandId = null;

  for (const polygon of polygons) {
    const waterEdges = getWaterEdges(polygon);

    for (const edge of waterEdges) {
      const closestPoint = getClosestPointOnEdge(edge, position);
      const distance = position.distanceTo(closestPoint);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestEdge = edge;
        closestLandId = polygon.id;
      }
    }
  }

  return { edge: closestEdge, landId: closestLandId };
}



Connection Points

Docks provide connection points for the road system:

 1 Each dock has predefined connection points
 2 Connection points are calculated based on dock position and rotation
 3 Road creation system can snap to these connection points
 4 This ensures roads properly connect to docks


// Generate connection points for a dock
function generateDockConnectionPoints(position, rotation) {
  const points = [];

  // Front connection point (for roads connecting to the dock)
  points.push(new Vector3(
    position.x + Math.sin(rotation) * 2.5,
    position.y + 0.2,
    position.z + Math.cos(rotation) * 2.5
  ));

  // Side connection points (for roads running alongside the dock)
  points.push(new Vector3(
    position.x + Math.sin(rotation + Math.PI/2) * 1,
    position.y + 0.2,
    position.z + Math.cos(rotation + Math.PI/2) * 1
  ));

  points.push(new Vector3(
    position.x + Math.sin(rotation - Math.PI/2) * 1,
    position.y + 0.2,
    position.z + Math.cos(rotation - Math.PI/2) * 1
  ));

  return points;
}



API Integration

The dock system integrates with the backend API:

 1 Creation: POST /api/docks

   {
     "landId": "polygon-123",
     "position": { "x": 10.5, "y": 0.1, "z": -15.2 },
     "rotation": 1.57,
     "connectionPoints": [
       { "x": 12.5, "y": 0.2, "z": -15.2 },
       { "x": 10.5, "y": 0.2, "z": -13.2 },
       { "x": 10.5, "y": 0.2, "z": -17.2 }
     ],
     "createdBy": "ConsiglioDeiDieci"
   }

 2 Retrieval: GET /api/docks
    • Returns all docks
    • Used by DockRenderer to visualize docks
 3 Single Dock: GET /api/docks/:id
    • Returns a specific dock by ID
    • Used when a new dock is created to get complete data


Event System Integration

The dock system uses the application's event system:

 1 Dock Placed: EventTypes.DOCK_PLACED
    • Emitted when a dock is successfully created
    • Contains dock ID, land ID, position, and rotation
    • Listeners: DockRenderer, RoadCreationManager
 2 Dock Deleted: EventTypes.DOCK_DELETED
    • Emitted when a dock is removed
    • Contains dock ID
    • Listeners: DockRenderer


Security Considerations

 1 Permission Checks:
    • Only administrators (ConsiglioDeiDieci) can create docks
    • Server-side validation ensures proper permissions
 2 Data Validation:
    • Position must be on a valid water edge
    • Land ID must exist and be adjacent to water
    • Rotation must be within valid range


Future Enhancements

 1 Dock Types:
    • Different dock types (small pier, large harbor, etc.)
    • Different visual models and connection point configurations
 2 Dock Upgrades:
    • Allow docks to be upgraded for increased capacity
    • Visual changes to reflect upgrades
 3 Water Traffic:
    • Boats and ships that navigate between docks
    • Automated water transportation system
 4 Economic Integration:
    • Docks generate income based on location and usage
    • Maintenance costs for dock upkeep
 5 Multiplayer Interaction:
    • Allow players to use docks for transportation
    • Trading posts at dock locations