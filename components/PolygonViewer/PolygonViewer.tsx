'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export default function PolygonViewer() {
  const canvasRef = useRef(null);
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [highQuality, setHighQuality] = useState(false);
  
  // Define resetCamera at component level using useRef to store the function
  const resetCameraRef = useRef(() => {});
  
  // Define resetView at component level
  const resetView = useCallback(() => {
    resetCameraRef.current();
  }, []);
  
  // Store the resetCamera function on window for access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.resetCameraView = resetView;
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.resetCameraView = undefined;
      }
    };
  }, [resetView]);
  
  // Load saved polygons
  useEffect(() => {
    const loadPolygons = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/get-polygons');
        const data = await response.json();
        
        console.log('Loaded polygons:', data);
        
        if (data.polygons) {
          setPolygons(data.polygons);
        } else {
          // If no polygons, create a sample one for testing
          setPolygons([{
            id: 'sample',
            coordinates: [
              { lat: 0, lng: 0 },
              { lat: 0, lng: 1 },
              { lat: 1, lng: 1 },
              { lat: 1, lng: 0 }
            ]
          }]);
        }
      } catch (error) {
        console.error('Error loading polygons:', error);
        setError('Failed to load polygons');
        
        // Create a sample polygon for testing
        setPolygons([{
          id: 'sample',
          coordinates: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 1 },
            { lat: 1, lng: 1 },
            { lat: 1, lng: 0 }
          ]
        }]);
      } finally {
        setLoading(false);
      }
    };
    
    loadPolygons();
  }, []);

  // Set up Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;
    
    console.log('Setting up Three.js scene with polygons:', polygons);

    // Initialize Three.js
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1e5799'); // Brighter blue background
    
    // Create a fog effect for depth
    scene.fog = new THREE.FogExp2('#1e5799', 0.0005); // Further reduced fog density for performance
    
    // Create a camera with a better initial position
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    
    // Position camera above the scene looking down at an angle
    camera.position.set(0, 80, 80);
    camera.up.set(0, 1, 0); // Ensure "up" is the Y axis
    camera.lookAt(0, 0, 0);
    
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio > 1 ? 2 : 1); // Limit pixel ratio for performance
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Create textures
    const textureLoader = new THREE.TextureLoader();
    
    // Water textures
    const waterNormalMap = textureLoader.load('https://threejs.org/examples/textures/waternormals.jpg');
    waterNormalMap.wrapS = waterNormalMap.wrapT = THREE.RepeatWrapping;
    waterNormalMap.repeat.set(10, 10);
    
    // Sand textures
    const sandBaseColor = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
    const sandNormalMap = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big-nm.jpg');
    const sandRoughnessMap = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big-ao.jpg');
    
    sandBaseColor.wrapS = sandBaseColor.wrapT = THREE.RepeatWrapping;
    sandNormalMap.wrapS = sandNormalMap.wrapT = THREE.RepeatWrapping;
    sandRoughnessMap.wrapS = sandRoughnessMap.wrapT = THREE.RepeatWrapping;
    
    // Make the texture 4x bigger by reducing the repeat value to 1/4 of the original
    sandBaseColor.repeat.set(1.25, 1.25);  // 5 ÷ 4 = 1.25
    sandNormalMap.repeat.set(1.25, 1.25);
    sandRoughnessMap.repeat.set(1.25, 1.25);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Increased from 0.3 to 0.6
    scene.add(ambientLight);
    
    // Add a hemisphere light for better overall illumination
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x0044ff, 0.6);
    scene.add(hemisphereLight);
    
    // Main directional light (sun) - bigger and more yellow
    const sunLight = new THREE.DirectionalLight(0xffffcc, 1.8); // More yellow tint and higher intensity
    sunLight.position.set(50, 100, 50); // Changed from (-30, 100, -30) to (50, 100, 50)
    sunLight.castShadow = true;
    
    // Create a sun sphere for visual effect
    const sunGeometry = new THREE.SphereGeometry(5, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffaa, 
      transparent: true,
      opacity: 0.8
    });
    const sunSphere = new THREE.Mesh(sunGeometry, sunMaterial);
    sunSphere.position.copy(sunLight.position);
    scene.add(sunSphere);
    
    // Add a subtle glow effect to the sun
    const sunGlowGeometry = new THREE.SphereGeometry(7, 16, 16);
    const sunGlowMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffdd, 
      transparent: true,
      opacity: 0.4,
      side: THREE.BackSide
    });
    const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
    sunGlow.position.copy(sunLight.position);
    scene.add(sunGlow);
    
    // Reduced shadow map resolution for better performance
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.bias = -0.0001;
    
    scene.add(sunLight);
    
    // Add a secondary light for better illumination
    const fillLight = new THREE.DirectionalLight(0xadd8e6, 0.5);
    fillLight.position.set(-50, 50, -50);
    scene.add(fillLight);
    
    // Add water plane with animated normal map - reduced complexity
    const waterGeometry = new THREE.PlaneGeometry(200, 200, 20, 20);
    const waterMaterial = new THREE.MeshStandardMaterial({ 
      color: '#0066cc', // More blue, less green
      transparent: true,
      opacity: 0.7,
      metalness: 0.2,
      roughness: 0.1,
      normalMap: waterNormalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      envMapIntensity: 0.8
    });
    
    const waterPlane = new THREE.Mesh(waterGeometry, waterMaterial);
    waterPlane.rotation.x = Math.PI / 2;
    waterPlane.position.y = -0.2;
    waterPlane.receiveShadow = true;
    scene.add(waterPlane);
    
    // Add subtle waves to the water
    const waterVertices = waterGeometry.attributes.position;
    const waterVertexCount = waterVertices.count;
    const waterWaves = new Float32Array(waterVertexCount);
    
    for (let i = 0; i < waterVertexCount; i++) {
      waterWaves[i] = Math.random();
    }
    
    // Calculate bounds to normalize coordinates
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    
    // Find the bounds of all polygon coordinates
    polygons.forEach(polygon => {
      if (polygon.coordinates && polygon.coordinates.length > 0) {
        polygon.coordinates.forEach(coord => {
          minLat = Math.min(minLat, coord.lat);
          maxLat = Math.max(maxLat, coord.lat);
          minLng = Math.min(minLng, coord.lng);
          maxLng = Math.max(maxLng, coord.lng);
        });
      }
    });
    
    console.log('Coordinate bounds:', { minLat, maxLat, minLng, maxLng });
    
    // Calculate center and scale
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    // Calculate scale to fit polygons in a reasonable size
    // (normalize to roughly -50 to 50 units)
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;
    
    // Calculate the latitude correction factor
    // At Venice's latitude (~45 degrees), longitude degrees are about 70% the length of latitude degrees
    const latCorrectionFactor = Math.cos(centerLat * Math.PI / 180);
    
    // Adjust the longitude range with the correction factor
    const correctedLngRange = lngRange * latCorrectionFactor;
    
    // Use the larger of the two ranges for scaling
    const maxRange = Math.max(latRange, correctedLngRange);
    const scale = maxRange > 0 ? 100 / maxRange : 1;
    
    console.log('Center and scale:', { centerLat, centerLng, scale, latCorrectionFactor });
    
    // Add polygons
    if (polygons.length > 0) {
      polygons.forEach((polygon, index) => {
        console.log(`Processing polygon ${index}:`, polygon);
        
        if (polygon.coordinates && polygon.coordinates.length > 2) {
          try {
            const shape = new THREE.Shape();
            
            // Normalize coordinates relative to center and apply scale
            const normalizedCoords = polygon.coordinates.map(coord => ({
              // Apply latitude correction factor to longitude values
              x: (coord.lng - centerLng) * scale * latCorrectionFactor,
              y: (coord.lat - centerLat) * scale
            }));
            
            // Start the shape with the first point
            shape.moveTo(normalizedCoords[0].x, normalizedCoords[0].y);
            
            // Add the rest of the points
            for (let i = 1; i < normalizedCoords.length; i++) {
              shape.lineTo(normalizedCoords[i].x, normalizedCoords[i].y);
            }
            
            // Create extruded geometry for the island with a slight height - simplified for performance
            const extrudeSettings = {
              steps: 1,
              depth: 0.1 + Math.random() * 0.1, // 60% flatter than the previous setting
              bevelEnabled: false // Disable bevel completely to remove space between islands
            };
            
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            
            // Rotate to lay flat on the "ground" but facing upward
            geometry.rotateX(-Math.PI / 2);
            
            // Create a realistic sand material
            const sandMaterial = new THREE.MeshStandardMaterial({ 
              color: '#e6d2a8', // More yellow/tan color
              map: sandBaseColor,
              normalMap: sandNormalMap,
              roughnessMap: sandRoughnessMap,
              roughness: 0.7,
              metalness: 0.1,
              side: THREE.DoubleSide,
              flatShading: false,
              wireframe: false,
              // Remove polygon edges by setting these properties:
              polygonOffset: true,
              polygonOffsetFactor: 1,
              polygonOffsetUnits: 1
            });
            
            const mesh = new THREE.Mesh(geometry, sandMaterial);
            
            // Position at ground level
            mesh.position.y = 0;
            
            // Enable shadows
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            scene.add(mesh);
            console.log(`Added polygon ${index} to scene`);
          } catch (error) {
            console.error(`Error creating polygon ${index}:`, error);
          }
        } else {
          console.warn(`Polygon ${index} has invalid coordinates:`, polygon.coordinates);
        }
      });
    } else {
      console.warn('No polygons to display');
      
      // Add a sample polygon for testing
      const sampleShape = new THREE.Shape();
      // Make the sample polygon wider to account for latitude correction
      const sampleWidth = 10 / latCorrectionFactor;
      sampleShape.moveTo(-sampleWidth, -10);
      sampleShape.lineTo(-sampleWidth, 10);
      sampleShape.lineTo(sampleWidth, 10);
      sampleShape.lineTo(sampleWidth, -10);
      
      const extrudeSettings = {
        steps: 1,
        depth: 0.16, // 60% flatter than the previous setting
        bevelEnabled: false // Disable bevel completely to remove space between islands
      };
      
      const sampleGeometry = new THREE.ExtrudeGeometry(sampleShape, extrudeSettings);
      sampleGeometry.rotateX(-Math.PI / 2);
      
      const sampleMaterial = new THREE.MeshStandardMaterial({
        color: '#e6d2a8', // More yellow/tan color
        map: sandBaseColor,
        normalMap: sandNormalMap,
        roughnessMap: sandRoughnessMap,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide,
        flatShading: false,
        wireframe: false,
        // Remove polygon edges by setting these properties:
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });
      
      const sampleMesh = new THREE.Mesh(sampleGeometry, sampleMaterial);
      sampleMesh.castShadow = true;
      sampleMesh.receiveShadow = true;
      scene.add(sampleMesh);
      console.log('Added sample polygon to scene');
    }
    
    // Don't rotate the scene at all initially
    scene.rotation.x = 0;
    scene.rotation.y = 0;
    scene.rotation.z = 0;
    
    // Track mouse state
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    // Calculate initial spherical coordinates correctly
    let cameraRadius = Math.sqrt(camera.position.x**2 + camera.position.y**2 + camera.position.z**2);
    // Use correct calculation for theta - this was the main issue
    let cameraTheta = Math.atan2(camera.position.z, camera.position.x);
    // Use correct calculation for phi
    let cameraPhi = Math.acos(camera.position.y / cameraRadius);

    const handleMouseDown = (event) => {
      isDragging = true;
      previousMousePosition = {
        x: event.clientX,
        y: event.clientY
      };
    };

    const handleMouseMove = (event) => {
      if (!isDragging) return;
      
      const deltaMove = {
        x: event.clientX - previousMousePosition.x,
        y: event.clientY - previousMousePosition.y
      };
      
      // Update spherical coordinates based on mouse movement
      // Invert the x movement to make it more intuitive
      cameraTheta -= deltaMove.x * 0.01;
      
      // Invert the y movement to make it more intuitive
      // When mouse moves up, camera should look more downward (phi decreases)
      // When mouse moves down, camera should look more upward (phi increases)
      const newPhi = cameraPhi - deltaMove.y * 0.01;
      
      // Limit vertical rotation to prevent going upside down
      // Keep phi between 0.1 and 1.4 radians (about 5 to 80 degrees from vertical)
      cameraPhi = Math.max(0.1, Math.min(1.4, newPhi));
      
      // Convert spherical to cartesian coordinates
      camera.position.x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
      camera.position.y = cameraRadius * Math.cos(cameraPhi);
      camera.position.z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
      
      // Always look at the center
      camera.lookAt(0, 0, 0);
      
      previousMousePosition = {
        x: event.clientX,
        y: event.clientY
      };
    };
    
    const handleMouseUp = () => {
      isDragging = false;
    };
    
    // Add mouse wheel zoom
    const handleWheel = (event) => {
      event.preventDefault();
      
      // Adjust camera radius based on wheel direction
      const zoomSpeed = 5;
      const delta = event.deltaY > 0 ? 1 : -1;
      
      // Update radius (distance from center)
      cameraRadius = Math.max(20, Math.min(200, cameraRadius + delta * zoomSpeed));
      
      // Update camera position using current angles and new radius
      camera.position.x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
      camera.position.y = cameraRadius * Math.cos(cameraPhi);
      camera.position.z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
    };
    
    // Add event listeners
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    
    // Function to reset camera to a good viewing position
    const resetCamera = () => {
      // Reset camera position using spherical coordinates
      cameraRadius = 120; // Distance from center
      cameraTheta = Math.PI / 4; // Horizontal angle (45 degrees)
      cameraPhi = Math.PI / 4; // Vertical angle (45 degrees from vertical)
      
      // Convert to cartesian coordinates
      camera.position.x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
      camera.position.y = cameraRadius * Math.cos(cameraPhi);
      camera.position.z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
      
      // Look at center
      camera.lookAt(0, 0, 0);
      
      // Reset scene rotation
      scene.rotation.x = 0;
      scene.rotation.y = 0;
      scene.rotation.z = 0;
    };
    
    // Store the resetCamera function in our ref so it can be called from outside
    resetCameraRef.current = resetCamera;
    
    // Call this initially to set a good starting view
    resetCamera();
    
    // Add a frame counter for less frequent updates
    let frameCount = 0;
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Animate water normal map with less frequent updates
      const time = Date.now() * 0.0005; // Reduced animation speed
      waterMaterial.normalMap.offset.x = time * 0.05;
      waterMaterial.normalMap.offset.y = time * 0.05;
      
      // Animate water waves less frequently (every 3 frames)
      if (waterVertices && frameCount % 3 === 0) {
        for (let i = 0; i < waterVertexCount; i += 2) { // Process every other vertex
          const x = waterVertices.getX(i);
          const z = waterVertices.getZ(i);
          const waveHeight = 0.05; // Reduced wave height
          
          // Create gentle waves with simpler math
          const y = Math.sin(x * 0.3 + time) * Math.cos(z * 0.3 + time) * waveHeight;
          waterVertices.setY(i, y);
        }
        
        waterGeometry.attributes.position.needsUpdate = true;
      }
      
      frameCount++;
      
      
      renderer.render(scene, camera);
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      
      // Make resetCamera available to the component
      if (typeof window !== 'undefined') {
        window.resetCameraView = undefined;
      }
      
      // Dispose of Three.js resources
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      
      renderer.dispose();
    };
  }, [polygons, loading]);
  
  if (loading) {
    return <div className="w-full h-full flex items-center justify-center">Loading polygons...</div>;
  }
  
  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <p className="text-red-500 mb-4">{error}</p>
        <p>Displaying sample polygon instead</p>
      </div>
    );
  }
  
  
  return (
    <div className="w-screen h-screen">
      <div className="absolute top-4 left-4 z-10 bg-white p-2 rounded shadow">
        {polygons.length === 0 ? (
          <p>No polygons found. Draw some on the map first.</p>
        ) : (
          <p>Found {polygons.length} polygon(s)</p>
        )}
      </div>
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <button 
          onClick={resetView}
          className="bg-white px-4 py-2 rounded shadow"
        >
          Reset View
        </button>
        <button 
          onClick={() => setHighQuality(!highQuality)}
          className="bg-white px-4 py-2 rounded shadow"
        >
          {highQuality ? 'Performance Mode' : 'Quality Mode'}
        </button>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
