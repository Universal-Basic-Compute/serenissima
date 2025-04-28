'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function PolygonViewer() {
  const canvasRef = useRef(null);
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
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
    scene.fog = new THREE.FogExp2('#1e5799', 0.001); // Reduced fog density
    
    const camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    camera.position.set(0, 5, 5); // Position camera above and back
    
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
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
    
    // Main directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5); // Changed from yellowish to white, increased intensity
    sunLight.position.set(30, 100, 30); // Adjusted position
    sunLight.castShadow = true;
    
    // Improve shadow quality
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
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
    
    // Add water plane with animated normal map
    const waterGeometry = new THREE.PlaneGeometry(200, 200, 50, 50);
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
    waterPlane.rotation.x = -Math.PI / 2;
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
    const maxRange = Math.max(latRange, lngRange);
    const scale = maxRange > 0 ? 100 / maxRange : 1;
    
    console.log('Center and scale:', { centerLat, centerLng, scale });
    
    // Add polygons
    if (polygons.length > 0) {
      polygons.forEach((polygon, index) => {
        console.log(`Processing polygon ${index}:`, polygon);
        
        if (polygon.coordinates && polygon.coordinates.length > 2) {
          try {
            const shape = new THREE.Shape();
            
            // Normalize coordinates relative to center and apply scale
            const normalizedCoords = polygon.coordinates.map(coord => ({
              x: (coord.lng - centerLng) * scale,
              y: (coord.lat - centerLat) * scale
            }));
            
            // Start the shape with the first point
            shape.moveTo(normalizedCoords[0].x, normalizedCoords[0].y);
            
            // Add the rest of the points
            for (let i = 1; i < normalizedCoords.length; i++) {
              shape.lineTo(normalizedCoords[i].x, normalizedCoords[i].y);
            }
            
            // Create extruded geometry for the island with a slight height
            const extrudeSettings = {
              steps: 1,
              depth: 0.5 + Math.random() * 0.5, // Random height variation
              bevelEnabled: true,
              bevelThickness: 0.2,
              bevelSize: 0.2,
              bevelOffset: 0,
              bevelSegments: 3
            };
            
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            
            // Rotate to lay flat on the "ground"
            geometry.rotateX(Math.PI / 2);
            
            // Create a realistic sand material
            const sandMaterial = new THREE.MeshStandardMaterial({ 
              color: '#e6d2a8', // More yellow/tan color
              map: sandBaseColor,
              normalMap: sandNormalMap,
              roughnessMap: sandRoughnessMap,
              roughness: 0.7,
              metalness: 0.1,
              side: THREE.DoubleSide
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
      sampleShape.moveTo(-10, -10);
      sampleShape.lineTo(-10, 10);
      sampleShape.lineTo(10, 10);
      sampleShape.lineTo(10, -10);
      
      const extrudeSettings = {
        steps: 1,
        depth: 0.8,
        bevelEnabled: true,
        bevelThickness: 0.2,
        bevelSize: 0.2,
        bevelOffset: 0,
        bevelSegments: 3
      };
      
      const sampleGeometry = new THREE.ExtrudeGeometry(sampleShape, extrudeSettings);
      sampleGeometry.rotateX(Math.PI / 2);
      
      const sampleMaterial = new THREE.MeshStandardMaterial({
        color: '#e6d2a8', // More yellow/tan color
        map: sandBaseColor,
        normalMap: sandNormalMap,
        roughnessMap: sandRoughnessMap,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
      
      const sampleMesh = new THREE.Mesh(sampleGeometry, sampleMaterial);
      sampleMesh.castShadow = true;
      sampleMesh.receiveShadow = true;
      scene.add(sampleMesh);
      console.log('Added sample polygon to scene');
    }
    
    // Position camera to view all polygons
    camera.position.set(0, 50, 50);
    camera.lookAt(0, 0, 0);
    
    // Simple controls for rotation
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
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
      
      // Rotate scene based on mouse movement
      scene.rotation.y += deltaMove.x * 0.01;
      
      // Calculate the new rotation angle
      const newRotationX = scene.rotation.x + deltaMove.y * 0.01;
      
      // Limit rotation to between 10° and 90° from the horizon
      // Convert to radians
      const minAngle = -Math.PI / 2 + Math.PI / 18; // -90° + 10° = -80°
      const maxAngle = -Math.PI / 2 + Math.PI / 2;  // -90° + 90° = 0° (horizon)
      
      // Apply rotation only if it's within the allowed range
      if (newRotationX >= minAngle && newRotationX <= maxAngle) {
        scene.rotation.x = newRotationX;
      }
      
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
      
      // Adjust camera position based on wheel direction
      const zoomSpeed = 0.1;
      const delta = event.deltaY > 0 ? 1 : -1;
      
      // Move camera closer or further
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      camera.position.addScaledVector(direction, delta * zoomSpeed * -10);
      
      // Ensure camera doesn't go below the ground
      if (camera.position.y < 1) {
        camera.position.y = 1;
      }
    };
    
    // Add event listeners
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Animate water normal map
      const time = Date.now() * 0.001;
      waterMaterial.normalMap.offset.x = time * 0.05;
      waterMaterial.normalMap.offset.y = time * 0.05;
      
      // Animate subtle water waves
      if (waterVertices) {
        for (let i = 0; i < waterVertexCount; i++) {
          const x = waterVertices.getX(i);
          const z = waterVertices.getZ(i);
          const waveHeight = 0.1;
          
          // Create gentle waves
          const y = Math.sin(x * 0.5 + time) * Math.cos(z * 0.5 + time) * waveHeight;
          waterVertices.setY(i, y);
        }
        
        waterGeometry.attributes.position.needsUpdate = true;
      }
      
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
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
