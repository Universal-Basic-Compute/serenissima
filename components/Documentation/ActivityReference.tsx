import React from 'react';
import Link from 'next/link';

export default function ActivityReference() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 bg-amber-50 h-screen overflow-y-auto">
      <h1 className="text-4xl font-serif text-amber-800 mb-6">La Serenissima: Activity Creation Reference</h1>
      
      <p className="mb-8 text-lg">
        This document provides details on how to create specific citizen activities using the 
        <code>POST /api/actions/create-activity</code> endpoint. This endpoint allows AI agents or external systems
        to inject specific tasks into a citizen's agenda.
      </p>

      <section id="general-payload" className="mb-12 p-6 bg-amber-100 border border-amber-300 rounded-lg">
        <h2 className="text-3xl font-serif text-amber-800 mb-4">General Request Payload</h2>
        <p className="mb-3 text-amber-900">
          All requests to <code>POST /api/actions/create-activity</code> must follow this general JSON structure. 
          Field names in the main payload should be <code>camelCase</code>. The server converts them to <code>PascalCase</code> for Airtable.
        </p>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "citizenUsername": "string", // Required: Username of the citizen
  "activityType": "string",    // Required: Specific type of activity (see list below)
  "title": "string",           // Required: A concise title for the activity (e.g., "Resting at home")
  "description": "string",     // Required: A brief description of what the activity entails
  "thought": "string",         // Optional: First-person narrative. If omitted, the server attempts to use a recent thought log.
  "activityDetails": {         // Required: Object containing parameters specific to the activityType
    // ... structure varies by activityType ...
  },
  "notes": "string"            // Optional: Internal notes or non-displayed information
}`}
        </pre>
        <p className="mt-3 text-sm text-gray-700">
          <strong>Important:</strong> For travel-related activities (e.g., <code>goto_work</code>, <code>fetch_resource</code> from a specific building), if <code>fromBuildingId</code> and <code>toBuildingId</code> are provided in <code>activityDetails</code>, the server will automatically calculate the path and travel times. The client no longer needs to provide <code>pathData</code>.
        </p>
        <p className="mt-1 text-xs text-gray-600">
          Note on <code>thought</code>: While optional in the payload, AI agents are encouraged to provide a relevant thought for the specific activity being created. If omitted, the server will attempt to fetch the most recent 'unguided_run_log' or 'autonomous_run_log' for the citizen to use as the thought.
        </p>
      </section>

      <h2 className="text-3xl font-serif text-amber-800 mb-6 border-b border-amber-300 pb-2">Activity Types & Details</h2>

      {/* Rest Activity */}
      <section id="rest" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3"><code>rest</code></h3>
        <p className="text-sm mb-2">Citizen rests at a specified location (home or inn).</p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure:</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "buildingId": "string",     // Airtable BuildingId of the home or inn
  "locationType": "home" | "inn",
  "durationHours": number,    // e.g., 8 (min: 1, max: 12)
  "notes": "string"           // Optional notes specific to this rest activity
}`}
        </pre>
        <p className="text-xs mt-2 text-gray-600">
          <strong>Prerequisites:</strong> Ensure <code>buildingId</code> corresponds to a valid building of the specified <code>locationType</code>.
        </p>
      </section>

      {/* Idle Activity */}
      <section id="idle" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3"><code>idle</code></h3>
        <p className="text-sm mb-2">Citizen remains idle for a specified duration.</p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure:</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "durationHours": number,    // e.g., 1 (min: 0.5, max: 4)
  "reason": "string",         // Optional: reason for being idle
  "notes": "string"           // Optional notes
}`}
        </pre>
      </section>

      {/* Travel Activities */}
      <section id="travel" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3">Travel Activities</h3>
        <p className="text-sm mb-2">
          Includes <code>goto_work</code>, <code>goto_home</code>, <code>travel_to_inn</code>, <code>goto_construction_site</code>.
          The server handles pathfinding if <code>fromBuildingId</code> and <code>toBuildingId</code> are provided.
        </p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure (Example for <code>goto_work</code>):</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "toBuildingId": "string",     // Required: Airtable BuildingId of the destination
  "fromBuildingId": "string", // Required: Airtable BuildingId of the starting location
                                // If travel starts from current citizen position (not a building),
                                // this API currently requires fromBuildingId.
                                // The engine's createActivities.py can handle pathing from current position.
  "notes": "string"           // Optional notes
}`}
        </pre>
        <p className="text-xs mt-2 text-gray-600">
          <strong>Prerequisites:</strong> 
          Valid <code>fromBuildingId</code> and <code>toBuildingId</code>. Building positions are fetched by the server.
          The API <code>GET /api/buildings/:buildingId</code> can be used to verify building details and get positions if needed for pre-calculation by the AI, though the server will do its own fetch.
        </p>
      </section>

      {/* Production Activity */}
      <section id="production" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3"><code>production</code></h3>
        <p className="text-sm mb-2">Citizen performs a production task at a workshop/business.</p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure:</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "buildingId": "string",     // Airtable BuildingId of the workshop
  "recipe": {
    "inputs": { "resource_type_id_1": number, "resource_type_id_2": number }, // Optional if no inputs
    "outputs": { "resource_type_id_out": number },
    "craftMinutes": number
  },
  "notes": "string"           // Optional notes
}`}
        </pre>
        <p className="text-xs mt-2 text-gray-600">
          <strong>Prerequisites:</strong> 
          The <code>buildingId</code> must be a valid workshop. 
          Recipe details (inputs, outputs, craftMinutes) should align with the building's capabilities, often defined in its type (see <code>GET /api/building-types</code> or <code>GET /api/building-resources/:buildingId</code> for transformation recipes).
          Resource type IDs should match those from <code>GET /api/resource-types</code>.
          The citizen should be at the <code>buildingId</code> for the production to start immediately; otherwise, a preceding travel activity is needed.
        </p>
      </section>

      {/* Fetch Resource Activity */}
      <section id="fetch_resource" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3"><code>fetch_resource</code></h3>
        <p className="text-sm mb-2">Citizen travels to fetch a resource and brings it to a destination.</p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure:</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "contractId": "string",     // Optional: Airtable ContractId if fetching against a specific contract
  "fromBuildingId": "string", // Required: Airtable BuildingId of the resource source
  "toBuildingId": "string",   // Required: Airtable BuildingId of the destination
  "resourceId": "string",     // Type of resource to fetch (e.g., "wood")
  "amount": number,
  "notes": "string"           // Optional notes
}`}
        </pre>
        <p className="text-xs mt-2 text-gray-600">
          <strong>Prerequisites:</strong> 
          Valid <code>fromBuildingId</code> and <code>toBuildingId</code>.
          <code>resourceId</code> must be a valid type from <code>GET /api/resource-types</code>.
          If <code>contractId</code> is provided, it should be a valid contract (e.g., from <code>GET /api/contracts</code>) allowing this fetch.
          The server handles pathfinding between <code>fromBuildingId</code> and <code>toBuildingId</code>.
        </p>
      </section>

      {/* Deliver Resource Batch Activity */}
      <section id="deliver_resource_batch" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3"><code>deliver_resource_batch</code></h3>
        <p className="text-sm mb-2">Citizen transports a batch of resources from one location to another. Typically used for fulfilling logistics or delivering produced goods.</p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure:</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "fromBuildingId": "string", // Required: Airtable BuildingId of the starting location
  "toBuildingId": "string",   // Required: Airtable BuildingId of the destination
  "resources": [              // Required: Array of resource objects to deliver
    { "ResourceId": "string", "Amount": number }, // ResourceId is the type (e.g., "wood")
    // ... more resources
  ],
  "transportMode": "walk" | "cart" | "gondola", // Optional, defaults to "walk" if not pathing via water
  "contractId": "string",     // Optional: Associated contract ID (e.g., logistics_service_request)
  "notes": "string"           // Optional notes
}`}
        </pre>
        <p className="text-xs mt-2 text-gray-600">
          <strong>Prerequisites:</strong> 
          Valid <code>fromBuildingId</code> and <code>toBuildingId</code>.
          Resources listed must be valid types from <code>GET /api/resource-types</code>.
          The citizen must possess the specified resources in their inventory (or at <code>fromBuildingId</code> if the activity implies pickup first, though this API assumes resources are already with the citizen for transport).
          The server handles pathfinding.
        </p>
      </section>

      {/* Eating Activities */}
      <section id="eating" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3">Eating Activities</h3>
        <p className="text-sm mb-2">Includes <code>eat_from_inventory</code>, <code>eat_at_home</code>, <code>eat_at_tavern</code>.</p>
        
        <div className="mt-4">
          <h4 className="font-semibold text-amber-800 mb-1"><code>eat_from_inventory</code></h4>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// activityDetails for eat_from_inventory:
{
  "resourceId": "string", // Type of food resource (e.g., "bread")
  "amount": number        // Typically 1
}`}
          </pre>
          <p className="text-xs mt-1 text-gray-600"><strong>Prerequisites:</strong> Citizen must have the specified food in their personal inventory.</p>
        </div>

        <div className="mt-4">
          <h4 className="font-semibold text-amber-800 mb-1"><code>eat_at_home</code></h4>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// activityDetails for eat_at_home:
{
  "homeBuildingId": "string", // Airtable BuildingId of the citizen's home
  "resourceId": "string",     // Type of food resource
  "amount": number            // Typically 1
}`}
          </pre>
          <p className="text-xs mt-1 text-gray-600"><strong>Prerequisites:</strong> Citizen must be at <code>homeBuildingId</code>, and the home must have the specified food owned by the citizen.</p>
        </div>

        <div className="mt-4">
          <h4 className="font-semibold text-amber-800 mb-1"><code>eat_at_tavern</code></h4>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// activityDetails for eat_at_tavern:
{
  "tavernBuildingId": "string", // Airtable BuildingId of the tavern
  // Details about what is eaten are usually handled by the tavern's offerings (contracts)
  // and the activity processor. The AI might specify a preference if the system supports it.
  "preferredFoodResourceId": "string" // Optional: if AI has a preference
}`}
          </pre>
          <p className="text-xs mt-1 text-gray-600"><strong>Prerequisites:</strong> Citizen must be at <code>tavernBuildingId</code>. Tavern must offer food for sale (check via <code>GET /api/contracts?SellerBuilding=tavernBuildingId&Type=public_sell</code> or <code>GET /api/building-resources/:tavernBuildingId</code>).</p>
        </div>
      </section>

      {/* Storage Activities */}
      <section id="storage" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3">Storage Activities</h3>
        <p className="text-sm mb-2">Includes <code>deliver_to_storage</code> and <code>fetch_from_storage</code>. These usually relate to <code>public_storage</code> contracts.</p>

        <div className="mt-4">
          <h4 className="font-semibold text-amber-800 mb-1"><code>deliver_to_storage</code></h4>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// activityDetails for deliver_to_storage:
{
  "fromBuildingId": "string",       // Building where resources are picked up (e.g., workshop)
  "storageBuildingId": "string",    // Airtable BuildingId of the storage facility
  "resources": [                    // Array of resource objects to deliver
    { "ResourceId": "string", "Amount": number }
  ],
  "storageContractId": "string"   // ContractId of the 'public_storage' or 'storage_query' contract
}`}
          </pre>
          <p className="text-xs mt-1 text-gray-600"><strong>Prerequisites:</strong> Valid <code>storageContractId</code>. Citizen needs to travel from <code>fromBuildingId</code> to <code>storageBuildingId</code>. Server handles pathing.</p>
        </div>

        <div className="mt-4">
          <h4 className="font-semibold text-amber-800 mb-1"><code>fetch_from_storage</code></h4>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// activityDetails for fetch_from_storage:
{
  "storageBuildingId": "string",    // Airtable BuildingId of the storage facility
  "toBuildingId": "string",         // Destination building for the fetched resources
  "resources": [                    // Array of resource objects to fetch
    { "ResourceId": "string", "Amount": number }
  ],
  "storageContractId": "string"   // ContractId of the 'public_storage' or 'storage_query' contract
}`}
          </pre>
          <p className="text-xs mt-1 text-gray-600"><strong>Prerequisites:</strong> Valid <code>storageContractId</code>. Resources must be available at <code>storageBuildingId</code> under that contract. Citizen travels from <code>storageBuildingId</code> to <code>toBuildingId</code>. Server handles pathing.</p>
        </div>
      </section>
      
      {/* Check Business Status Activity */}
      <section id="check_business_status" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3"><code>check_business_status</code></h3>
        <p className="text-sm mb-2">Citizen (operator) visits their business to update its <code>CheckedAt</code> timestamp, ensuring full productivity.</p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure:</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "businessBuildingId": "string" // Airtable BuildingId of the business to check
}`}
        </pre>
        <p className="text-xs mt-2 text-gray-600">
          <strong>Prerequisites:</strong> 
          The <code>citizenUsername</code> must be the <code>RunBy</code> for the <code>businessBuildingId</code>.
          If the citizen is not already at the business, a travel activity (e.g., <code>goto_work</code> with <code>businessBuildingId</code> as destination) should precede this, or the server will pathfind if <code>fromBuildingId</code> is also provided (though this activity type itself is more about the action at the location). The API will create a path if <code>fromBuildingId</code> and <code>toBuildingId</code> (which would be <code>businessBuildingId</code>) are given.
        </p>
      </section>

      {/* Fishing Activities */}
      <section id="fishing_activities" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3">Fishing Activities (<code>fishing</code>, <code>emergency_fishing</code>)</h3>
        <p className="text-sm mb-2">Citizen travels to a fishing spot and fishes for a duration.</p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure:</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "fishingSpotId": "string",    // ID of the water point (e.g., from /api/water-points, "wp_lat_lng")
  "durationMinutes": number,    // How long to fish, e.g., 60
  "fromBuildingId": "string"  // Required for pathfinding: Airtable BuildingId of the starting location (e.g., home)
}`}
        </pre>
        <p className="text-xs mt-2 text-gray-600">
          <strong>Prerequisites:</strong> 
          <code>fishingSpotId</code> should be a valid water point ID, ideally one marked with <code>hasFish: true</code> from <code>GET /api/get-water-graph</code>.
          The server handles pathfinding from <code>fromBuildingId</code> to the coordinates of <code>fishingSpotId</code>.
          The <code>activityType</code> will be either <code>fishing</code> or <code>emergency_fishing</code>.
        </p>
      </section>

      {/* Construction Activities */}
      <section id="construction_activities" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3">Construction Activities</h3>
        <p className="text-sm mb-2">Includes <code>goto_construction_site</code>, <code>deliver_construction_materials</code>, <code>construct_building</code>.</p>

        <div className="mt-4">
          <h4 className="font-semibold text-amber-800 mb-1"><code>goto_construction_site</code></h4>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// activityDetails for goto_construction_site:
{
  "toBuildingId": "string",     // BuildingId of the construction site (the building being constructed)
  "fromBuildingId": "string",   // BuildingId of the starting location (e.g., workshop or current location)
  "contractId": "string"        // Optional: Construction project contract ID
}`}
          </pre>
        </div>

        <div className="mt-4">
          <h4 className="font-semibold text-amber-800 mb-1"><code>deliver_construction_materials</code></h4>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// activityDetails for deliver_construction_materials:
{
  "fromBuildingId": "string",       // BuildingId of the construction workshop (source of materials)
  "toBuildingId": "string",         // BuildingId of the construction site
  "resources": [                    // Array of resource objects to deliver
    { "ResourceId": "string", "Amount": number }
  ],
  "contractId": "string"            // Construction project contract ID
}`}
          </pre>
          <p className="text-xs mt-1 text-gray-600"><strong>Prerequisites:</strong> Materials must be available at <code>fromBuildingId</code>. Server handles pathing.</p>
        </div>

        <div className="mt-4">
          <h4 className="font-semibold text-amber-800 mb-1"><code>construct_building</code></h4>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// activityDetails for construct_building:
{
  "buildingToConstructId": "string", // BuildingId of the site (the building being constructed)
  "workDurationMinutes": number,     // Duration of this construction session
  "contractId": "string"             // Construction project contract ID
}`}
          </pre>
          <p className="text-xs mt-1 text-gray-600"><strong>Prerequisites:</strong> Citizen must be at <code>buildingToConstructId</code>. Materials should be delivered to the site.</p>
        </div>
      </section>

      {/* Leave Venice Activity */}
      <section id="leave_venice_activity" className="mb-10 p-4 bg-white rounded-lg shadow">
        <h3 className="text-2xl font-serif text-amber-700 mb-3"><code>leave_venice</code></h3>
        <p className="text-sm mb-2">A Forestiero citizen travels to an exit point (e.g., public dock) to leave Venice.</p>
        <h4 className="font-semibold text-amber-800 mb-1"><code>activityDetails</code> Structure:</h4>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "toBuildingId": "string",     // BuildingId of the exit point (e.g., a public_dock)
  "fromBuildingId": "string",   // BuildingId of the starting location
  "galleyIdToDelete": "string"  // Optional: BuildingId of a merchant_galley owned by the Forestiero to be deleted upon departure
}`}
        </pre>
        <p className="text-xs mt-2 text-gray-600">
          <strong>Prerequisites:</strong> 
          <code>citizenUsername</code> must be a Forestiero.
          <code>toBuildingId</code> should be a valid exit point like a 'public_dock'.
          Server handles pathfinding.
        </p>
      </section>

      {/* Footer */}
      <footer className="mt-12 pt-8 border-t border-amber-300 text-center text-amber-700">
        <p>La Serenissima Activity Creation Documentation</p>
        <p className="text-sm mt-2">© {new Date().getFullYear()} La Serenissima</p>
        <p className="text-sm mt-1">
          <Link href="/documentation/api-reference" className="text-amber-600 hover:underline">
            Return to Main API Reference
          </Link>
        </p>
      </footer>
    </div>
  );
}
