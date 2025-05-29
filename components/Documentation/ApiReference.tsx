import React from 'react';
import Link from 'next/link';

const ApiReference: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 bg-amber-50 min-h-screen">
      <h1 className="text-4xl font-serif text-amber-800 mb-6">La Serenissima API Reference</h1>
      
      <p className="mb-8 text-lg">
        This documentation provides details about the available API endpoints for La Serenissima platform.
        These APIs can be used to interact with various aspects of the virtual Venice.
      </p>
      
      {/* API Version Information */}
      <div className="mb-8 p-4 bg-amber-100 rounded-lg">
        <h2 className="text-2xl font-serif text-amber-800 mb-2">API Information</h2>
        <p><strong>Version:</strong> 1.0</p>
        <p><strong>Base URL:</strong> https://serenissima.ai/api</p>
        <p><strong>Authentication:</strong> No authentication required for public endpoints. Some endpoints require wallet verification through signature validation.</p>
        <p><strong>Rate Limiting:</strong> Maximum 100 requests per minute per IP address.</p>
        <p><strong>Versioning Policy:</strong> API changes are communicated through the version number. Minor updates maintain backward compatibility.</p>
      </div>
      
      {/* Table of Contents */}
      <div className="mb-12 p-4 bg-amber-100 rounded-lg">
        <h2 className="text-2xl font-serif text-amber-800 mb-4">Table of Contents</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><a href="#citizens" className="text-amber-700 hover:underline">Citizen Management</a></li>
          <li><a href="#lands" className="text-amber-700 hover:underline">Land Management</a></li>
          <li><a href="#buildings" className="text-amber-700 hover:underline">Building Management</a></li>
          <li><a href="#resources" className="text-amber-700 hover:underline">Resource Management</a></li>
          <li><a href="#transport" className="text-amber-700 hover:underline">Transport & Navigation</a></li>
          <li><a href="#economy" className="text-amber-700 hover:underline">Economy & Finance</a></li>
          <li><a href="#governance" className="text-amber-700 hover:underline">Governance</a></li>
          <li><a href="#guilds" className="text-amber-700 hover:underline">Guilds</a></li>
          <li><a href="#relevancies" className="text-amber-700 hover:underline">Relevancy System</a></li>
          <li><a href="#notifications" className="text-amber-700 hover:underline">Notifications</a></li>
          <li><a href="#messages" className="text-amber-700 hover:underline">Messaging</a></li>
          <li><a href="#utilities" className="text-amber-700 hover:underline">Utilities</a></li>
          <li><a href="#data-access" className="text-amber-700 hover:underline">Data Access</a></li>
          <li><a href="#error-handling" className="text-amber-700 hover:underline">Error Handling</a></li>
          <li><a href="#pagination" className="text-amber-700 hover:underline">Pagination</a></li>
        </ul>
      </div>
      
      {/* Citizens Section */}
      <section id="citizens" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Citizen Management</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/citizens</h3>
          <p className="mb-2">Retrieves a list of all citizens in Venice.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "citizens": [
    {
      "username": "string",
      "firstName": "string",
      "lastName": "string",
      "coatOfArmsImageUrl": "string | null",
      "isAi": boolean,
      "socialClass": "string",
      "description": "string",
      "position": { "lat": number, "lng": number },
      "influence": number,
      "wallet": "string",
      "familyMotto": "string",
      "color": "string",
      "guildId": "string | null",
      "worksFor": "string | null",
      "workplace": { "name": "string", "type": "string" } | null
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/citizens/:username</h3>
          <p className="mb-2">Retrieves details for a specific citizen by username.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>username</code> - The username of the citizen</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "citizen": {
    "username": "string",
    "firstName": "string",
    "lastName": "string",
    "coatOfArmsImageUrl": "string | null",
    "isAi": boolean,
    "socialClass": "string",
    "description": "string",
    "position": { "lat": number, "lng": number },
    "influence": number,
    "wallet": "string",
    "familyMotto": "string",
    "color": "string",
    "guildId": "string | null",
    "worksFor": "string | null",
    "workplace": { "name": "string", "type": "string" } | null
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/citizens/wallet/:walletAddress</h3>
          <p className="mb-2">Retrieves citizen details by wallet address.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>walletAddress</code> - The blockchain wallet address of the citizen</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "citizen": {
    "id": "string",
    "walletAddress": "string",
    "username": "string | null",
    "firstName": "string | null",
    "lastName": "string | null",
    "ducats": number,
    "coatOfArmsImageUrl": "string | null",
    "familyMotto": "string | null",
    "createdAt": "string | null"
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/citizens/update</h3>
          <p className="mb-2">Updates a citizen's profile information.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "id": "string",
  "username": "string",
  "firstName": "string",
  "lastName": "string",
  "familyMotto": "string",
  "coatOfArmsImageUrl": "string"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": "Citizen profile updated successfully",
  "citizen": {
    "id": "string",
    "walletAddress": "string",
    "username": "string | null",
    "firstName": "string | null",
    "lastName": "string | null",
    "ducats": number,
    "coatOfArmsImageUrl": "string | null",
    "familyMotto": "string | null",
    "createdAt": "string | null"
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/citizens/update-guild</h3>
          <p className="mb-2">Updates a citizen's guild membership.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "username": "string",
  "guildId": "string",
  "status": "string" // Optional, defaults to "pending"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "citizen": {
    "username": "string",
    "guildId": "string",
    "guildStatus": "string"
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/register</h3>
          <p className="mb-2">Registers a new citizen with a wallet address.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "walletAddress": "string"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "citizen": {
    "id": "string",
    "walletAddress": "string",
    "username": "string | null",
    "firstName": "string | null",
    "lastName": "string | null",
    "ducats": number,
    "coatOfArmsImageUrl": "string | null",
    "familyMotto": "string | null",
    "createdAt": "string"
  },
  "message": "Citizen registered successfully"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/citizen/settings</h3>
          <p className="mb-2">Updates a citizen's settings preferences.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "wallet_address": "string",
  "settings": {
    // Any settings key-value pairs
    "musicVolume": number,
    "sfxVolume": number,
    "graphicsQuality": "string",
    "showTutorials": boolean
  }
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": "Settings updated successfully"
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Lands Section */}
      <section id="lands" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Land Management</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/lands</h3>
          <p className="mb-2">Retrieves a list of all land parcels.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>owner</code> (optional) - Filter lands by owner username</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "lands": [
    {
      "id": "string",
      "owner": "string | null",
      "buildingPointsCount": number,
      "historicalName": "string | null",
      "position": { "lat": number, "lng": number } | null,
      "center": { "lat": number, "lng": number } | null,
      "coordinates": [{ "lat": number, "lng": number }],
      "buildingPoints": [{ "lat": number, "lng": number }],
      "bridgePoints": [],
      "canalPoints": []
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/get-land-owners</h3>
          <p className="mb-2">Retrieves land ownership information.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "lands": [
    {
      "id": "string",
      "owner": "string | null",
      "coat_of_arms_image": "string | null",
      "ducats": number,
      "first_name": "string | null",
      "last_name": "string | null",
      "family_motto": "string | null"
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/get-land-rents</h3>
          <p className="mb-2">Retrieves land rent information for all parcels.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "landRents": [
    {
      "id": "string",
      "centroid": { "lat": number, "lng": number },
      "areaInSquareMeters": number,
      "distanceFromCenter": number,
      "locationMultiplier": number,
      "dailyRent": number
    }
  ],
  "metadata": {
    "totalLands": number,
    "averageRent": number,
    "minRent": number,
    "maxRent": number
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/land-groups</h3>
          <p className="mb-2">Retrieves groups of connected land parcels. Land parcels are considered connected if they are linked by constructed bridges.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>includeUnconnected</code> (optional) - Include single unconnected lands (default: false)</li>
              <li><code>minSize</code> (optional) - Minimum group size to include (default: 1)</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "landGroups": [
    {
      "groupId": "string",
      "lands": [
        "polygon-123456",
        "polygon-789012"
      ],
      "bridges": [
        "building-bridge-345678",
        "building-bridge-901234"
      ],
      "owner": "string | undefined"  // Only set if all lands have the same owner
    }
  ],
  "totalGroups": number,
  "totalLands": number,
  "totalBridges": number,
  "constructedBridges": number
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Notes</h4>
            <ul className="list-disc pl-6">
              <li>The <code>owner</code> field is only set if all lands in the group have the same owner</li>
              <li>Land groups are sorted by size (largest first)</li>
              <li>Only constructed bridges are considered for connectivity</li>
              <li>This endpoint is useful for analyzing territory control and connectivity</li>
            </ul>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/get-income-data</h3>
          <p className="mb-2">Retrieves income data for land parcels.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "incomeData": [
    {
      "polygonId": "string",
      "income": number,
      "rawIncome": number,
      "buildingPointsCount": number
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/calculate-land-rent</h3>
          <p className="mb-2">Calculates and returns land rent values for all parcels.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "landRents": [
    {
      "id": "string",
      "centroid": { "lat": number, "lng": number },
      "areaInSquareMeters": number,
      "distanceFromCenter": number,
      "locationMultiplier": number,
      "dailyRent": number,
      "estimatedLandValue": number,
      "historicalName": "string | null"
    }
  ],
  "metadata": {
    "totalLands": number,
    "averageRent": number,
    "minRent": number,
    "maxRent": number,
    "averageLandValue": number,
    "targetYield": number,
    "savedToAirtable": boolean
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/land-groups</h3>
          <p className="mb-2">Retrieves groups of connected land parcels. Land parcels are considered connected if they are linked by constructed bridges.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>includeUnconnected</code> (optional) - Include single unconnected lands (default: false)</li>
              <li><code>minSize</code> (optional) - Minimum group size to include (default: 1)</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "landGroups": [
    {
      "groupId": "string",
      "lands": [
        "polygon-123456",
        "polygon-789012"
      ],
      "bridges": [
        "building-bridge-345678",
        "building-bridge-901234"
      ],
      "owner": "string | undefined"  // Only set if all lands have the same owner
    }
  ],
  "totalGroups": number,
  "totalLands": number,
  "totalBridges": number,
  "constructedBridges": number
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Notes</h4>
            <ul className="list-disc pl-6">
              <li>The <code>owner</code> field is only set if all lands in the group have the same owner</li>
              <li>Land groups are sorted by size (largest first)</li>
              <li>Only constructed bridges are considered for connectivity</li>
              <li>This endpoint is useful for analyzing territory control and connectivity</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Related Endpoints</h4>
            <ul className="list-disc pl-6">
              <li><a href="#bridges" className="text-amber-700 hover:underline">GET /api/bridges</a> - Get all bridges</li>
              <li><a href="#get-land-owners" className="text-amber-700 hover:underline">GET /api/get-land-owners</a> - Get land ownership information</li>
            </ul>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/get-polygons</h3>
          <p className="mb-2">Retrieves polygon data for land parcels, including coordinates, building points, and historical information.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>limit</code> (optional) - Limit the number of polygons returned</li>
              <li><code>essential</code> (optional) - Return only essential data (default: false)</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "polygons": [
    {
      "id": "string",
      "coordinates": [{ "lat": number, "lng": number }],
      "centroid": { "lat": number, "lng": number },
      "center": { "lat": number, "lng": number },
      "bridgePoints": [
        {
          "id": "string",
          "edge": { "lat": number, "lng": number },
          "connection": {
            "targetPolygonId": "string",
            "distance": number,
            "historicalName": "string",
            "englishName": "string",
            "historicalDescription": "string"
          }
        }
      ],
      "canalPoints": [
        {
          "id": "string",
          "edge": { "lat": number, "lng": number }
        }
      ],
      "buildingPoints": [
        {
          "id": "string",
          "lat": number,
          "lng": number
        }
      ],
      "historicalName": "string",
      "englishName": "string",
      "historicalDescription": "string",
      "nameConfidence": "string",
      "areaInSquareMeters": number
    }
  ]
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Essential Mode</h4>
            <p>When <code>essential=true</code>, the response includes only:</p>
            <ul className="list-disc pl-6">
              <li>id</li>
              <li>coordinates</li>
              <li>centroid</li>
              <li>center</li>
              <li>bridgePoints</li>
              <li>canalPoints</li>
              <li>buildingPoints</li>
            </ul>
            <p>This is useful for reducing payload size when historical information is not needed.</p>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/polygons/:polygonId</h3>
          <p className="mb-2">Retrieves data for a specific polygon by ID.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>polygonId</code> - The ID of the polygon</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "id": "string",
  "coordinates": [{ "lat": number, "lng": number }],
  "centroid": { "lat": number, "lng": number },
  "center": { "lat": number, "lng": number },
  "bridgePoints": [],
  "canalPoints": [],
  "buildingPoints": [],
  "historicalName": "string",
  "englishName": "string",
  "historicalDescription": "string",
  "nameConfidence": "string",
  "areaInSquareMeters": number
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/save-polygon</h3>
          <p className="mb-2">Saves a new polygon or updates an existing one.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "coordinates": [{ "lat": number, "lng": number }]
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "filename": "string",
  "isNew": boolean
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Buildings Section */}
      <section id="buildings" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Building Management</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/buildings</h3>
          <p className="mb-2">Retrieves a list of all buildings. Supports filtering by type and pagination.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>type</code> (optional) - Filter buildings by type (e.g., "market-stall", "house")</li>
              <li><code>limit</code> (optional) - Limit the number of buildings returned (default: 1000)</li>
              <li><code>offset</code> (optional) - Offset for pagination (default: 0)</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "buildings": [
    {
      "id": "string",
      "type": "string",
      "land_id": "string",
      "variant": "string",
      "position": { "lat": number, "lng": number },
      "rotation": number,
      "owner": "string",
      "created_at": "string",
      "lease_price": number,
      "rent_price": number,
      "occupant": "string",
      "point_id": "string | null"
    }
  ]
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Notes on Pagination</h4>
            <p>The API supports two types of pagination:</p>
            <ol className="list-decimal pl-6">
              <li>Using <code>offset</code> as a numeric value to skip a number of records</li>
              <li>Using <code>offset</code> as a token returned from a previous request (Airtable pagination)</li>
            </ol>
            <p>For large datasets, token-based pagination is more efficient.</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Error Responses</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": false,
  "error": "Failed to fetch buildings",
  "details": "Error message"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/buildings/:buildingId</h3>
          <p className="mb-2">Retrieves details for a specific building by ID.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>buildingId</code> - The ID of the building</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "building": {
    "id": "string",
    "type": "string",
    "land_id": "string",
    "variant": "string",
    "position": { "lat": number, "lng": number },
    "rotation": number,
    "owner": "string",
    "created_at": "string",
    "lease_price": number,
    "rent_price": number,
    "occupant": "string"
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/buildings</h3>
          <p className="mb-2">Creates a new building.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "type": "string",
  "land_id": "string",
  "variant": "string",
  "position": { "lat": number, "lng": number },
  "rotation": number,
  "owner": "string",
  "point_id": "string" // Optional
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "building": {
    "id": "string",
    "type": "string",
    "land_id": "string",
    "variant": "string",
    "position": { "lat": number, "lng": number },
    "point_id": "string | null",
    "rotation": number,
    "owner": "string",
    "created_at": "string",
    "lease_price": number,
    "rent_price": number,
    "occupant": "string"
  },
  "message": "Building created successfully"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/create-building-at-point</h3>
          <p className="mb-2">Creates a building at a specific point with cost deduction from the citizen's Ducats balance.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "type": "string",
  "land_id": "string",
  "position": { "lat": number, "lng": number } | { "x": number, "y": number, "z": number },
  "walletAddress": "string",
  "variant": "string",
  "rotation": number,
  "cost": number
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "building": {
    "id": "string",
    "type": "string",
    "land_id": "string",
    "variant": "string",
    "position": { "lat": number, "lng": number } | { "x": number, "y": number, "z": number },
    "rotation": number,
    "owner": "string",
    "created_at": "string",
    "cost": number
  },
  "message": "Building created successfully"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Error Responses</h4>
            <ul className="list-disc pl-6">
              <li>400 - Building point is already occupied</li>
              <li>400 - Insufficient Ducats balance</li>
              <li>400 - Missing required fields</li>
              <li>500 - Server error</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Notes</h4>
            <p>This endpoint deducts the specified cost from the citizen's Ducats balance and adds it to the ConsiglioDeiDieci treasury.</p>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/building-types</h3>
          <p className="mb-2">Retrieves a list of all available building types.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>pointType</code> (optional) - Filter building types by point type</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "buildingTypes": [
    {
      "type": "string",
      "name": "string",
      "category": "string",
      "subCategory": "string",
      "tier": number,
      "pointType": "string | null",
      "constructionCosts": {},
      "maintenanceCost": number,
      "shortDescription": "string",
      "productionInformation": {},
      "canImport": boolean
    }
  ],
  "filters": {
    "pointType": "string | null"
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/building-data/:type</h3>
          <p className="mb-2">Retrieves detailed data for a specific building type.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>type</code> - The building type</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "type": "string",
  "name": "string",
  "category": "string",
  "subCategory": "string",
  "tier": number,
  "constructionCosts": {},
  "maintenanceCost": number,
  "shortDescription": "string",
  "productionInformation": {}
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/building-definition</h3>
          <p className="mb-2">Retrieves building definition by type.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>type</code> - The building type</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "type": "string",
  "name": "string",
  "category": "string",
  "subCategory": "string",
  "tier": number,
  "constructionCosts": {},
  "maintenanceCost": number,
  "shortDescription": "string",
  "productionInformation": {
    "storageCapacity": number,
    "stores": ["string"],
    "sells": ["string"]
  },
  "canImport": boolean
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/building-resources/:buildingId</h3>
          <p className="mb-2">Retrieves comprehensive resource information for a building, including stored resources, resources for sale, and production capabilities.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>buildingId</code> - The ID of the building</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "buildingId": "string",
  "buildingType": "string",
  "buildingName": "string",
  "owner": "string",
  "resources": {
    "stored": [
      {
        "id": "string",
        "type": "string",
        "name": "string",
        "category": "string",
        "subCategory": "string",
        "count": number,
        "icon": "string",
        "description": "string",
        "rarity": "string"
      }
    ],
    "publiclySold": [
      {
        "id": "string",
        "resourceType": "string",
        "name": "string",
        "category": "string",
        "targetAmount": number,
        "price": number,
        "transporter": "string",
        "icon": "string",
        "description": "string",
        "contractType": "string"
      }
    ],
    "bought": [
      {
        "resourceType": "string",
        "name": "string",
        "category": "string",
        "amount": number,
        "icon": "string",
        "description": "string"
      }
    ],
    "sellable": [
      {
        "resourceType": "string",
        "name": "string",
        "category": "string",
        "icon": "string",
        "description": "string"
      }
    ],
    "storable": [
      {
        "resourceType": "string",
        "name": "string",
        "category": "string",
        "icon": "string",
        "description": "string"
      }
    ],
    "transformationRecipes": [
      {
        "id": "string",
        "inputs": [
          {
            "resourceType": "string",
            "name": "string",
            "category": "string",
            "amount": number,
            "icon": "string",
            "description": "string"
          }
        ],
        "outputs": [
          {
            "resourceType": "string",
            "name": "string",
            "category": "string",
            "amount": number,
            "icon": "string",
            "description": "string"
          }
        ],
        "craftMinutes": number
      }
    ]
  },
  "storage": {
    "used": number,
    "capacity": number
  }
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Example Request</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`fetch('/api/building-resources/building-123456789')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Related Endpoints</h4>
            <ul className="list-disc pl-6">
              <li><a href="#contracts" className="text-amber-700 hover:underline">GET /api/contracts</a> - Get contracts for resources sold by this building</li>
              <li><a href="#building-definition" className="text-amber-700 hover:underline">GET /api/building-definition</a> - Get building type definition</li>
              <li><a href="#resources-counts" className="text-amber-700 hover:underline">GET /api/resources/counts</a> - Get resource counts for a building</li>
            </ul>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/building-points</h3>
          <p className="mb-2">Retrieves all building, canal, and bridge points.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "buildingPoints": {
    "point-id": { "lat": number, "lng": number }
  },
  "canalPoints": {
    "canal-id": { "lat": number, "lng": number }
  },
  "bridgePoints": {
    "bridge-id": { "lat": number, "lng": number }
  },
  "totalPoints": number
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/bridges</h3>
          <p className="mb-2">Retrieves all bridges.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "bridges": [
    {
      "id": "string",
      "buildingId": "string",
      "type": "string",
      "name": "string",
      "position": { "lat": number, "lng": number },
      "owner": "string",
      "isConstructed": boolean,
      "constructionDate": "string | null",
      "links": ["string"],
      "historicalName": "string",
      "englishName": "string",
      "historicalDescription": "string",
      "orientation": number,
      "distance": number | null
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/docks</h3>
          <p className="mb-2">Retrieves all docks.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "docks": [
    {
      "id": "string",
      "buildingId": "string",
      "type": "string",
      "name": "string",
      "position": { "lat": number, "lng": number },
      "owner": "string",
      "isConstructed": boolean,
      "constructionDate": "string | null",
      "isPublic": boolean
    }
  ]
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Resources Section */}
      <section id="resources" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Resource Management</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/resources</h3>
          <p className="mb-2">Retrieves a list of all resources.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>owner</code> (optional) - Filter resources by owner</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`[
  {
    "id": "string",
    "type": "string",
    "name": "string",
    "category": "string",
    "subCategory": "string",
    "position": { "lat": number, "lng": number },
    "count": number,
    "landId": "string",
    "owner": "string",
    "createdAt": "string",
    "icon": "string",
    "description": "string",
    "rarity": "string"
  }
]`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/resources</h3>
          <p className="mb-2">Creates a new resource.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "id": "string",
  "type": "string",
  "name": "string",
  "category": "string",
  "position": { "lat": number, "lng": number },
  "count": number,
  "landId": "string",
  "owner": "string"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "resource": {
    "id": "string",
    "type": "string",
    "name": "string",
    "category": "string",
    "position": { "lat": number, "lng": number },
    "count": number,
    "landId": "string",
    "owner": "string",
    "createdAt": "string"
  },
  "message": "Resource created successfully"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8" id="resources-counts">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/resources/counts</h3>
          <p className="mb-2">Retrieves resource counts grouped by type. Returns both global resource counts (all resources in the game) and player-specific resource counts (resources owned by the specified player).</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>owner</code> (optional) - Filter resources by owner username</li>
              <li><code>buildingId</code> (optional) - Filter resources by building ID</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "globalResourceCounts": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "subCategory": "string",
      "icon": "string",
      "count": number,
      "rarity": "string",
      "description": "string",
      "buildingId": "string",
      "location": { "lat": number, "lng": number } | null
    }
  ],
  "playerResourceCounts": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "subCategory": "string",
      "icon": "string",
      "count": number,
      "rarity": "string",
      "description": "string",
      "buildingId": "string",
      "location": { "lat": number, "lng": number } | null
    }
  ]
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Example Request</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// Get resources for a specific owner
fetch('/api/resources/counts?owner=marco_polo')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));

// Get resources for a specific building
fetch('/api/resources/counts?buildingId=building-123456789')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Resource Categories</h4>
            <ul className="list-disc pl-6">
              <li><code>raw_materials</code> - Basic resources like wood, stone, clay</li>
              <li><code>food</code> - Food items like grain, fish, meat</li>
              <li><code>textiles</code> - Cloth, fabric, and related materials</li>
              <li><code>spices</code> - Spices and seasonings</li>
              <li><code>tools</code> - Tools and equipment</li>
              <li><code>building_materials</code> - Processed materials for construction</li>
              <li><code>luxury_goods</code> - High-value items like gold, silk, gems</li>
            </ul>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/resource-types</h3>
          <p className="mb-2">Retrieves a list of all resource types.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>category</code> (optional) - Filter resource types by category</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "resourceTypes": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "description": "string",
      "importPrice": number
    }
  ],
  "categories": [
    {
      "name": "string",
      "resources": [
        {
          "id": "string",
          "name": "string",
          "category": "string",
          "description": "string",
          "importPrice": number
        }
      ]
    }
  ],
  "filters": {
    "category": "string | null"
  }
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Transport Section */}
      <section id="transport" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Transport & Navigation</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">Transport API</h3>
          <p className="mb-2">The Transport API provides pathfinding capabilities between points in Venice, considering both land and water routes.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/transport</h4>
            <p className="mb-2">Finds a path between two points using query parameters.</p>
            
            <h5 className="font-bold mt-4 mb-2">Query Parameters</h5>
            <ul className="list-disc pl-6">
              <li><code>startLat</code> - Latitude of the starting point</li>
              <li><code>startLng</code> - Longitude of the starting point</li>
              <li><code>endLat</code> - Latitude of the ending point</li>
              <li><code>endLng</code> - Longitude of the ending point</li>
              <li><code>startDate</code> (optional) - Start date for the journey</li>
            </ul>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "path": [
    { "lat": number, "lng": number, "type": "string", "nodeId": "string", "polygonId": "string" }
  ],
  "timing": {
    "startDate": "string",
    "endDate": "string",
    "durationSeconds": number,
    "distanceMeters": number
  },
  "journey": [
    {
      "type": "land" | "bridge" | "dock",
      "id": "string",
      "position": { "lat": number, "lng": number }
    }
  ]
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/transport</h4>
            <p className="mb-2">Finds a path between two points with more options using JSON request body.</p>
            
            <h5 className="font-bold mt-4 mb-2">Request Body</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "startPoint": { "lat": number, "lng": number },
  "endPoint": { "lat": number, "lng": number },
  "startDate": "string",
  "pathfindingMode": "real" | "all"
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "path": [
    { "lat": number, "lng": number, "type": "string", "nodeId": "string", "polygonId": "string" }
  ],
  "timing": {
    "startDate": "string",
    "endDate": "string",
    "durationSeconds": number,
    "distanceMeters": number
  },
  "journey": [
    {
      "type": "land" | "bridge" | "dock",
      "id": "string",
      "position": { "lat": number, "lng": number }
    }
  ]
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Pathfinding Modes</h5>
            <ul className="list-disc pl-6">
              <li><code>real</code> - Only use constructed bridges and existing paths</li>
              <li><code>all</code> - Include all possible paths, even if bridges aren't constructed</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/transport/water-only</h4>
            <p className="mb-2">Finds a water-only path between two points.</p>
            
            <h5 className="font-bold mt-4 mb-2">Request Body</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "startPoint": { "lat": number, "lng": number },
  "endPoint": { "lat": number, "lng": number }
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "path": [
    { "lat": number, "lng": number, "type": "string", "nodeId": "string" }
  ]
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/transport/debug</h4>
            <p className="mb-2">Provides debug information about the transport graph.</p>
            
            <h5 className="font-bold mt-4 mb-2">Query Parameters</h5>
            <ul className="list-disc pl-6">
              <li><code>mode</code> (optional) - Pathfinding mode ('real' or 'all', default: 'real')</li>
            </ul>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "graphInfo": {
    "totalNodes": number,
    "totalEdges": number,
    "nodesByType": {},
    "connectedComponents": number,
    "componentSizes": {},
    "pathfindingMode": "string",
    "polygonsLoaded": boolean,
    "polygonCount": number,
    "canalNetworkSegments": number
  },
  "bridges": [],
  "docks": [],
  "bridgeCount": number,
  "dockCount": number,
  "requestedMode": "string"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/transport/water-only</h3>
          <p className="mb-2">Finds a water-only path between two points.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "startPoint": { "lat": number, "lng": number },
  "endPoint": { "lat": number, "lng": number }
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "path": [
    { "lat": number, "lng": number, "type": "string", "nodeId": "string" }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/transport/debug</h3>
          <p className="mb-2">Provides debug information about the transport graph.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>mode</code> (optional) - Pathfinding mode ('real' or 'all', default: 'real')</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "graphInfo": {
    "totalNodes": number,
    "totalEdges": number,
    "nodesByType": {},
    "connectedComponents": number,
    "componentSizes": {},
    "pathfindingMode": "string",
    "polygonsLoaded": boolean,
    "polygonCount": number,
    "canalNetworkSegments": number
  },
  "bridges": [],
  "docks": [],
  "bridgeCount": number,
  "dockCount": number,
  "requestedMode": "string"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/water-points</h3>
          <p className="mb-2">Retrieves water points for the canal network.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "waterPoints": [
    {
      "id": "string",
      "position": { "lat": number, "lng": number },
      "connections": []
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/water-points</h3>
          <p className="mb-2">Creates or updates a water point for the canal network.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "waterPoint": {
    "id": "string",
    "position": { "lat": number, "lng": number },
    "connections": [
      {
        "id": "string",
        "distance": number
      }
    ]
  }
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": "Water point saved successfully"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Notes</h4>
            <ul className="list-disc pl-6">
              <li>If a water point with the same ID already exists, it will be updated</li>
              <li>Connections represent navigable paths between water points</li>
              <li>This endpoint is primarily used by system administrators to define the canal network</li>
            </ul>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/activities</h3>
          <p className="mb-2">Retrieves citizen activities, including transport paths.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>citizenId</code> (optional) - Filter activities by citizen ID</li>
              <li><code>limit</code> (optional) - Limit the number of activities returned</li>
              <li><code>hasPath</code> (optional) - Filter activities that have a path</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "activities": [
    {
      "ActivityId": "string",
      "CitizenId": "string",
      "Type": "string",
      "Path": "string",
      "StartPoint": "string",
      "EndPoint": "string",
      "StartTime": "string",
      "EndTime": "string",
      "Status": "string",
      "CreatedAt": "string"
    }
  ]
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Economy Section */}
      <section id="economy" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Economy & Finance</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/economy</h3>
          <p className="mb-2">Retrieves economic data for Venice.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "economy": {
    "totalDucats": number,
    "transactionsTotal": number,
    "projectedYearlyGDP": number,
    "totalLoans": number,
    "citizenCount": number,
    "transactionCount": number,
    "loanCount": number,
    "lastUpdated": "string"
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/contracts</h3>
          <p className="mb-2">Retrieves resource contracts.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>username</code> (optional) - Filter contracts by username</li>
              <li><code>sellerBuilding</code> (optional) - Filter contracts by seller building</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "contracts": [
    {
      "id": "string",
      "contractId": "string",
      "type": "string",
      "buyer": "string",
      "seller": "string",
      "resourceType": "string",
      "imageUrl": "string",
      "buyerBuilding": "string",
      "sellerBuilding": "string",
      "price": number,
      "amount": number,
      "createdAt": "string",
      "endAt": "string",
      "status": "string",
      "location": { "lat": number, "lng": number } | null
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/transactions/available</h3>
          <p className="mb-2">Retrieves available transactions.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`[
  {
    "id": "string",
    "type": "string",
    "asset": "string",
    "seller": "string",
    "buyer": "string",
    "price": number,
    "createdAt": "string",
    "executedAt": "string"
  }
]`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/transactions/history</h3>
          <p className="mb-2">Retrieves transaction history.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>citizenId</code> (optional) - Filter transactions by citizen ID</li>
              <li><code>asset</code> (optional) - Filter transactions by asset ID</li>
              <li><code>role</code> (optional) - Filter transactions by role ('buyer' or 'seller')</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "transactions": [
    {
      "id": "string",
      "type": "string",
      "asset": "string",
      "seller": "string",
      "buyer": "string",
      "price": number,
      "createdAt": "string",
      "executedAt": "string",
      "metadata": {
        "historicalName": "string",
        "englishName": "string",
        "description": "string"
      }
    }
  ],
  "timestamp": number
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/withdraw-compute</h3>
          <p className="mb-2">Withdraws compute tokens.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "wallet_address": "string",
  "ducats": number
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "transaction_hash": "string",
  "amount": number
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/loans</h3>
          <p className="mb-2">Retrieves loans information.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "loans": [
    {
      "id": "string",
      "borrower": "string",
      "lender": "string",
      "principalAmount": number,
      "interestRate": number,
      "termDays": number,
      "startDate": "string",
      "endDate": "string",
      "status": "string",
      "remainingBalance": number,
      "nextPaymentDue": "string",
      "collateral": {}
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/loans/apply</h3>
          <p className="mb-2">Applies for a loan.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "borrower": "string",
  "principalAmount": number,
  "interestRate": number,
  "termDays": number,
  "collateral": {}
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "data": {
    "id": "string",
    "borrower": "string",
    "lender": "string",
    "principalAmount": number,
    "interestRate": number,
    "termDays": number,
    "startDate": "string",
    "endDate": "string",
    "status": "string",
    "remainingBalance": number,
    "nextPaymentDue": "string",
    "collateral": {}
  }
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Governance Section */}
      <section id="governance" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Governance</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/decrees</h3>
          <p className="mb-2">Retrieves all decrees.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`[
  {
    "DecreeId": "string",
    "Type": "string",
    "Title": "string",
    "Description": "string",
    "Status": "string",
    "Category": "string",
    "SubCategory": "string",
    "Proposer": "string",
    "CreatedAt": "string",
    "EnactedAt": "string | null",
    "ExpiresAt": "string | null",
    "FlavorText": "string",
    "HistoricalInspiration": "string",
    "Notes": "string",
    "Rationale": "string"
  }
]`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Guilds Section */}
      <section id="guilds" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Guilds</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/guilds</h3>
          <p className="mb-2">Retrieves all guilds.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "guilds": [
    {
      "guildId": "string",
      "guildName": "string",
      "createdAt": "string",
      "primaryLocation": "string",
      "description": "string",
      "shortDescription": "string",
      "patronSaint": "string",
      "guildTier": "string",
      "leadershipStructure": "string",
      "entryFee": number,
      "votingSystem": "string",
      "meetingFrequency": "string",
      "guildHallId": "string",
      "guildEmblem": "string",
      "guildBanner": "string",
      "color": "string"
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/guild-members/:guildId</h3>
          <p className="mb-2">Retrieves members of a specific guild.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>guildId</code> - The ID of the guild</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "members": [
    {
      "citizenId": "string",
      "username": "string",
      "firstName": "string",
      "lastName": "string",
      "coatOfArmsImageUrl": "string | null",
      "color": "string | null"
    }
  ]
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Relevancies Section */}
      <section id="relevancies" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Relevancy System</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/relevancies</h3>
          <p className="mb-2">Retrieves available relevancy types.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>calculateAll</code> (optional) - If 'true', redirects to calculate all relevancies</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "availableTypes": [
    {
      "name": "string",
      "description": "string",
      "subtypes": ["string"]
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/relevancies/:aiUsername</h3>
          <p className="mb-2">Retrieves relevancies for a specific AI.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>aiUsername</code> - The username of the AI</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>type</code> (optional) - Filter relevancies by type</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "aiUsername": "string",
  "relevancies": [
    {
      "id": "string",
      "relevancyId": "string",
      "asset": "string",
      "assetType": "string",
      "category": "string",
      "type": "string",
      "targetCitizen": "string",
      "relevantToCitizen": "string",
      "score": number,
      "timeHorizon": "string",
      "title": "string",
      "description": "string",
      "notes": "string",
      "status": "string",
      "createdAt": "string"
    }
  ],
  "count": number
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/relevancies/proximity</h3>
          <p className="mb-2">Calculates proximity relevancies for an AI.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>ai</code> - The username of the AI</li>
              <li><code>type</code> (optional) - Filter by relevancy type ('connected' or 'geographic')</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "ai": "string",
  "ownedLandCount": number,
  "relevancyScores": {
    "landId": number
  },
  "detailedRelevancy": {
    "landId": {
      "score": number,
      "distance": number,
      "isConnected": boolean,
      "closestLandId": "string",
      "category": "string",
      "type": "string",
      "assetType": "string",
      "timeHorizon": "string",
      "title": "string",
      "description": "string"
    }
  }
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Example Request</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// Get proximity relevancies for an AI with type filter
fetch('/api/relevancies/proximity?ai=marco_polo&type=connected')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/relevancies/proximity</h3>
          <p className="mb-2">Calculates and saves proximity relevancies for an AI.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "aiUsername": "string",
  "typeFilter": "string" // Optional
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "ai": "string",
  "ownedLandCount": number,
  "relevancyScores": {
    "landId": number
  },
  "detailedRelevancy": {
    "landId": {
      "score": number,
      "distance": number,
      "isConnected": boolean,
      "closestLandId": "string",
      "category": "string",
      "type": "string",
      "assetType": "string",
      "timeHorizon": "string",
      "title": "string",
      "description": "string"
    }
  },
  "saved": boolean
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/relevancies/proximity/:aiUsername</h3>
          <p className="mb-2">Retrieves proximity relevancies for a specific AI.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>aiUsername</code> - The username of the AI</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>type</code> (optional) - Filter by relevancy type ('connected' or 'geographic')</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "ai": "string",
  "ownedLandCount": number,
  "relevancyScores": {
    "landId": number
  },
  "detailedRelevancy": {
    "landId": {
      "score": number,
      "distance": number,
      "isConnected": boolean,
      "closestLandId": "string",
      "category": "string",
      "type": "string",
      "assetType": "string",
      "timeHorizon": "string",
      "title": "string",
      "description": "string"
    }
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/relevancies/domination</h3>
          <p className="mb-2">Calculates land domination relevancies.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "relevancyScores": {
    "citizenId": number
  },
  "detailedRelevancy": {
    "citizenId": {
      "score": number,
      "category": "string",
      "type": "string",
      "assetType": "string",
      "timeHorizon": "string",
      "title": "string",
      "description": "string"
    }
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/relevancies/domination</h3>
          <p className="mb-2">Calculates and saves land domination relevancies for an AI.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "aiUsername": "string"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "ai": "string",
  "relevancyScores": {
    "citizenId": number
  },
  "detailedRelevancy": {
    "citizenId": {
      "score": number,
      "category": "string",
      "type": "string",
      "assetType": "string",
      "timeHorizon": "string",
      "title": "string",
      "description": "string"
    }
  },
  "saved": boolean
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/relevancies/domination/:aiUsername</h3>
          <p className="mb-2">Retrieves land domination relevancies for a specific AI.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>aiUsername</code> - The username of the AI</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "aiUsername": "string",
  "relevancies": [
    {
      "id": "string",
      "relevancyId": "string",
      "asset": "string",
      "assetType": "string",
      "category": "string",
      "type": "string",
      "targetCitizen": "string",
      "relevantToCitizen": "string",
      "score": number,
      "timeHorizon": "string",
      "title": "string",
      "description": "string",
      "notes": "string",
      "status": "string",
      "createdAt": "string"
    }
  ],
  "count": number
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/relevancies/types/:type</h3>
          <p className="mb-2">Retrieves relevancies of a specific type.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>type</code> - The relevancy type</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Query Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>ai</code> (optional) - Filter by AI username</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "type": "string",
  "relevancies": [
    {
      "id": "string",
      "relevancyId": "string",
      "asset": "string",
      "assetType": "string",
      "category": "string",
      "type": "string",
      "targetCitizen": "string",
      "relevantToCitizen": "string",
      "score": number,
      "timeHorizon": "string",
      "title": "string",
      "description": "string",
      "notes": "string",
      "status": "string",
      "createdAt": "string"
    }
  ],
  "count": number
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">Relevancy Calculation API</h3>
          <p className="mb-2">The Relevancy Calculation API calculates and manages relevancy scores for AI citizens. Relevancies represent the importance of various assets (lands, citizens, etc.) to an AI.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/calculateRelevancies</h4>
            <p className="mb-2">Calculates relevancies for AIs without saving them to the database.</p>
            
            <h5 className="font-bold mt-4 mb-2">Query Parameters</h5>
            <ul className="list-disc pl-6">
              <li><code>ai</code> (optional) - Calculate for a specific AI username</li>
              <li><code>calculateAll</code> (optional) - Set to 'true' to calculate for all AIs</li>
              <li><code>type</code> (optional) - Filter by relevancy type ('proximity', 'connected', 'geographic', 'domination')</li>
            </ul>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "aiCount": number,
  "totalRelevanciesCreated": number,
  "results": {
    "aiUsername": {
      "ownedLandCount": number,
      "relevanciesCreated": number
    }
  }
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/calculateRelevancies</h4>
            <p className="mb-2">Calculates and saves relevancies for an AI to the database.</p>
            
            <h5 className="font-bold mt-4 mb-2">Request Body</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "aiUsername": "string",
  "typeFilter": "string" // Optional - 'proximity', 'connected', 'geographic', 'domination'
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "ai": "string",
  "ownedLandCount": number,
  "relevancyScores": {
    "id": number
  },
  "detailedRelevancy": {
    "id": {
      "score": number,
      "category": "string",
      "type": "string",
      "assetType": "string",
      "timeHorizon": "string",
      "title": "string",
      "description": "string",
      "distance": number,        // For proximity relevancies
      "isConnected": boolean,    // For proximity relevancies
      "closestLandId": "string"  // For proximity relevancies
    }
  },
  "saved": boolean
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Relevancy Types</h4>
            <ul className="list-disc pl-6">
              <li><code>proximity</code> - Based on geographic distance between lands</li>
              <li><code>connected</code> - Based on connectivity via bridges</li>
              <li><code>geographic</code> - Based on pure geographic distance</li>
              <li><code>domination</code> - Based on land ownership patterns</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Related Endpoints</h4>
            <ul className="list-disc pl-6">
              <li><a href="#relevancies-proximity" className="text-amber-700 hover:underline">GET /api/relevancies/proximity/:aiUsername</a> - Get proximity relevancies for an AI</li>
              <li><a href="#relevancies-domination" className="text-amber-700 hover:underline">GET /api/relevancies/domination/:aiUsername</a> - Get domination relevancies for an AI</li>
              <li><a href="#relevancies-types" className="text-amber-700 hover:underline">GET /api/relevancies/types/:type</a> - Get relevancies of a specific type</li>
            </ul>
          </div>
        </div>
      </section>
      
      {/* Notifications Section */}
      <section id="notifications" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Notifications</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/notifications</h3>
          <p className="mb-2">Retrieves notifications for a citizen.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "citizen": "string",
  "since": "string" | number // Optional, defaults to 1 week ago
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "notifications": [
    {
      "notificationId": "string",
      "type": "string",
      "citizen": "string",
      "content": "string",
      "details": {},
      "createdAt": "string",
      "readAt": "string | null"
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/notifications/mark-read</h3>
          <p className="mb-2">Marks notifications as read.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "citizen": "string",
  "notificationIds": ["string"]
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": "Notifications marked as read successfully"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/notifications/unread-count</h3>
          <p className="mb-2">Retrieves the count of unread notifications for a citizen.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "citizen": "string"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "unreadCount": number
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Messages Section */}
      <section id="messages" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Messages</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/messages</h3>
          <p className="mb-2">Retrieves messages between two citizens.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "currentCitizen": "string",
  "otherCitizen": "string"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "messages": [
    {
      "messageId": "string",
      "sender": "string",
      "receiver": "string",
      "content": "string",
      "type": "string",
      "createdAt": "string",
      "readAt": "string | null"
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/messages/send</h3>
          <p className="mb-2">Sends a message from one citizen to another.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "sender": "string",
  "receiver": "string",
  "content": "string",
  "type": "string" // Optional, defaults to "message"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": {
    "messageId": "string",
    "sender": "string",
    "receiver": "string",
    "content": "string",
    "type": "string",
    "createdAt": "string",
    "readAt": null
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/messages/update</h3>
          <p className="mb-2">Updates a message's type.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "messageId": "string",
  "type": "string"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": {
    "messageId": "string",
    "type": "string"
  }
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">POST /api/compagno</h3>
          <p className="mb-2">Sends a message to the Compagno AI assistant.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Request Body</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "message": "string"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "response": "string"
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Utilities Section */}
      <section id="utilities" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Utilities</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/check-loading-directory</h3>
          <p className="mb-2">Checks if the loading directory exists and creates it if it doesn't.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": "Loading directory exists",
  "exists": boolean,
  "path": "string",
  "files": ["string"],
  "imageFiles": ["string"]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/list-polygon-files</h3>
          <p className="mb-2">Lists all polygon files in the data directory.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "files": ["string"],
  "directory": "string"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/get-bridges</h3>
          <p className="mb-2">Retrieves bridge data from the data directory.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "bridges": [
    {
      "id": "string",
      "buildingId": "string",
      "type": "string",
      "name": "string",
      "position": { "lat": number, "lng": number },
      "owner": "string",
      "isConstructed": boolean,
      "constructionDate": "string | null"
    }
  ]
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">Coat of Arms Management</h3>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/get-coat-of-arms</h4>
            <p className="mb-2">Retrieves coat of arms data for all citizens.</p>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "coatOfArms": {
    "username": "string"  // URL to coat of arms image
  }
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/coat-of-arms/:path</h4>
            <p className="mb-2">Serves coat of arms images.</p>
            
            <h5 className="font-bold mt-4 mb-2">Parameters</h5>
            <ul className="list-disc pl-6">
              <li><code>path</code> - Path to the coat of arms image</li>
            </ul>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <p>Returns the image with appropriate content type headers.</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/fetch-coat-of-arms</h4>
            <p className="mb-2">Fetches and caches a coat of arms image from an external URL.</p>
            
            <h5 className="font-bold mt-4 mb-2">Request Body</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "imageUrl": "string"
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "image_url": "string",
  "source": "local" | "remote"
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/upload-coat-of-arms</h4>
            <p className="mb-2">Uploads a coat of arms image.</p>
            
            <h5 className="font-bold mt-4 mb-2">Request Body</h5>
            <p>FormData with an 'image' file field.</p>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "image_url": "string"
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Supported File Types</h5>
            <ul className="list-disc pl-6">
              <li>JPEG (.jpg, .jpeg)</li>
              <li>PNG (.png)</li>
              <li>WebP (.webp)</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/create-coat-of-arms-dir</h4>
            <p className="mb-2">Creates the coat of arms directory if it doesn't exist.</p>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/fetch-coat-of-arms</h4>
            <p className="mb-2">Fetches and caches a coat of arms image from an external URL.</p>
            
            <h5 className="font-bold mt-4 mb-2">Request Body</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "imageUrl": "string"
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "image_url": "string",
  "source": "local" | "remote"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">Audio and Media</h3>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/tts</h4>
            <p className="mb-2">Converts text to speech using the Kinos Engine API.</p>
            
            <h5 className="font-bold mt-4 mb-2">Request Body</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "text": "string",
  "voice_id": "string", // Optional, defaults to "IKne3meq5aSn9XLyUdCD"
  "model": "string" // Optional, defaults to "eleven_flash_v2_5"
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <p>Returns the audio data or a URL to the audio file.</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/music-tracks</h4>
            <p className="mb-2">Retrieves available music tracks.</p>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "tracks": ["string"]  // Array of music track URLs
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">Cache Management</h3>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">POST /api/flush-cache</h4>
            <p className="mb-2">Flushes the server-side cache.</p>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": "Cache flushed successfully",
  "timestamp": number
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/flush-cache</h4>
            <p className="mb-2">Gets the timestamp of the last cache flush.</p>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "lastFlushed": number
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">System Utilities</h3>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/check-loading-directory</h4>
            <p className="mb-2">Checks if the loading directory exists and creates it if it doesn't.</p>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "message": "Loading directory exists",
  "exists": boolean,
  "path": "string",
  "files": ["string"],
  "imageFiles": ["string"]
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-amber-500">
            <h4 className="font-bold mb-2">GET /api/list-polygon-files</h4>
            <p className="mb-2">Lists all polygon files in the data directory.</p>
            
            <h5 className="font-bold mt-4 mb-2">Response</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "files": ["string"],
  "directory": "string"
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Data Access Section */}
      <section id="data-access" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Data Access</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/data/:path</h3>
          <p className="mb-2">Serves files from the data directory with appropriate content type headers.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Parameters</h4>
            <ul className="list-disc pl-6">
              <li><code>path</code> - Path to the file in the data directory (can include subdirectories)</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <p>Returns the file content with appropriate content type headers based on file extension:</p>
            <ul className="list-disc pl-6">
              <li><code>.json</code> - application/json</li>
              <li><code>.txt</code> - text/plain</li>
              <li><code>.csv</code> - text/csv</li>
              <li>Other - application/octet-stream</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Error Responses</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "error": "No path provided"
}

{
  "error": "File not found",
  "path": "string"
}

{
  "error": "Failed to serve file",
  "details": "string"
}`}
            </pre>
          </div>
        </div>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">GET /api/building-points</h3>
          <p className="mb-2">Retrieves all building, canal, and bridge points.</p>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Response</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "buildingPoints": {
    "point-id": { "lat": number, "lng": number }
  },
  "canalPoints": {
    "canal-id": { "lat": number, "lng": number }
  },
  "bridgePoints": {
    "bridge-id": { "lat": number, "lng": number }
  },
  "totalPoints": number
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Error Handling Section */}
      <section id="error-handling" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Error Handling</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">Common Error Responses</h3>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">400 Bad Request</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": false,
  "error": "Description of the validation error"
}`}
            </pre>
            <p className="mt-2">Returned when the request is invalid, such as missing required parameters or invalid data formats.</p>
            
            <h5 className="font-bold mt-4 mb-2">Common 400 Error Messages</h5>
            <ul className="list-disc pl-6">
              <li>"Missing required field: [field name]"</li>
              <li>"Invalid position format"</li>
              <li>"Insufficient Ducats balance"</li>
              <li>"Building point is already occupied"</li>
              <li>"Invalid coordinates"</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">401 Unauthorized</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": false,
  "error": "Authentication required",
  "details": "Please provide a valid wallet signature"
}`}
            </pre>
            <p className="mt-2">Returned when authentication is required but not provided or is invalid.</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">403 Forbidden</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": false,
  "error": "Permission denied",
  "details": "You do not have permission to access this resource"
}`}
            </pre>
            <p className="mt-2">Returned when the user is authenticated but doesn't have permission to access the resource.</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">404 Not Found</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": false,
  "error": "Resource not found",
  "details": "The requested [resource type] could not be found"
}`}
            </pre>
            <p className="mt-2">Returned when the requested resource does not exist.</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">429 Too Many Requests</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": false,
  "error": "Rate limit exceeded",
  "details": "Please try again in [time] seconds"
}`}
            </pre>
            <p className="mt-2">Returned when the client has sent too many requests in a given amount of time.</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">500 Internal Server Error</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": false,
  "error": "An error occurred while processing the request",
  "details": "Optional error details"
}`}
            </pre>
            <p className="mt-2">Returned when an unexpected error occurs on the server.</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Error Handling Best Practices</h4>
            <ul className="list-disc pl-6">
              <li>Always check the <code>success</code> field in the response to determine if the request was successful</li>
              <li>Handle HTTP status codes appropriately in your client application</li>
              <li>Display user-friendly error messages based on the <code>error</code> field</li>
              <li>Log detailed error information from the <code>details</code> field for debugging</li>
              <li>Implement retry logic for transient errors (e.g., network issues)</li>
              <li>Use exponential backoff for retries when encountering rate limiting (429) errors</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Example Error Handling</h4>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`async function fetchData(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.success) {
      console.error(\`Error: \${data.error}\`);
      // Handle specific error types
      if (response.status === 401) {
        // Redirect to login
      } else if (response.status === 429) {
        // Implement retry with backoff
      }
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Network or parsing error:', error);
    return null;
  }
}`}
            </pre>
          </div>
        </div>
      </section>
      
      {/* Pagination Section */}
      <section id="pagination" className="mb-12">
        <h2 className="text-3xl font-serif text-amber-800 mb-4 border-b border-amber-300 pb-2">Pagination</h2>
        
        <div className="mb-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-2">Pagination Methods</h3>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Offset-Based Pagination</h4>
            <p>Most endpoints that return collections support offset-based pagination using the <code>limit</code> and <code>offset</code> parameters:</p>
            <ul className="list-disc pl-6 mt-2">
              <li><code>limit</code> - Number of items to return (default varies by endpoint)</li>
              <li><code>offset</code> - Number of items to skip</li>
            </ul>
            
            <h5 className="font-bold mt-4 mb-2">Example</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`// First page (items 0-9)
fetch('/api/buildings?limit=10&offset=0')

// Second page (items 10-19)
fetch('/api/buildings?limit=10&offset=10')

// Third page (items 20-29)
fetch('/api/buildings?limit=10&offset=20')`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Token-Based Pagination (Airtable)</h4>
            <p>Some endpoints that use Airtable as a data source support token-based pagination:</p>
            <ul className="list-disc pl-6 mt-2">
              <li>The initial request is made without an <code>offset</code> parameter</li>
              <li>If more results are available, the response will include an <code>offset</code> token</li>
              <li>Subsequent requests should include this token in the <code>offset</code> parameter</li>
            </ul>
            
            <h5 className="font-bold mt-4 mb-2">Example Response with Offset Token</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`{
  "success": true,
  "data": [...],
  "offset": "rec7HjnU8iJX2J87n"
}`}
            </pre>
            
            <h5 className="font-bold mt-4 mb-2">Example Pagination Implementation</h5>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">
{`async function fetchAllPages(baseUrl) {
  let allResults = [];
  let offset = null;
  
  do {
    const url = offset 
      ? \`\${baseUrl}?offset=\${offset}\` 
      : baseUrl;
      
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    allResults = [...allResults, ...data.data];
    offset = data.offset;
  } while (offset);
  
  return allResults;
}`}
            </pre>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold mb-2">Endpoints Supporting Pagination</h4>
            <ul className="list-disc pl-6">
              <li><a href="#buildings" className="text-amber-700 hover:underline">GET /api/buildings</a> - Supports both offset-based and token-based pagination</li>
              <li><a href="#resources" className="text-amber-700 hover:underline">GET /api/resources</a> - Supports offset-based pagination</li>
              <li><a href="#citizens" className="text-amber-700 hover:underline">GET /api/citizens</a> - Supports offset-based pagination</li>
              <li><a href="#transactions" className="text-amber-700 hover:underline">GET /api/transactions/history</a> - Supports offset-based pagination</li>
            </ul>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="mt-12 pt-8 border-t border-amber-300 text-center text-amber-700">
        <p>La Serenissima API Documentation</p>
        <p className="text-sm mt-2">© {new Date().getFullYear()} La Serenissima</p>
        <p className="text-sm mt-1">
          <a href="https://github.com/serenissima-ai/serenissima" className="text-amber-600 hover:underline" target="_blank" rel="noopener noreferrer">
            GitHub Repository
          </a>
        </p>
        <p className="text-sm mt-4">
          <strong>Last Updated:</strong> {new Date().toLocaleDateString()}
        </p>
      </footer>
    </div>
  );
};

export default ApiReference;
