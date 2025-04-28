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
    scene.background = new THREE.Color('#1e3a8a'); // Blue background
    
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
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);
    
    // Add water plane
    const waterGeometry = new THREE.PlaneGeometry(100, 100);
    const waterMaterial = new THREE.MeshStandardMaterial({ 
      color: '#1e3a8a',
      transparent: true,
      opacity: 0.8
    });
    const waterPlane = new THREE.Mesh(waterGeometry, waterMaterial);
    waterPlane.rotation.x = -Math.PI / 2;
    waterPlane.position.y = -0.1;
    scene.add(waterPlane);
    
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
            
            // Create geometry from the shape
            const geometry = new THREE.ShapeGeometry(shape);
            
            // Rotate to lay flat on the "ground"
            geometry.rotateX(Math.PI / 2);
            
            const material = new THREE.MeshStandardMaterial({ 
              color: '#e6c587', // Sand color
              side: THREE.DoubleSide
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            
            // Position at ground level
            mesh.position.y = 0;
            
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
      
      const sampleGeometry = new THREE.ShapeGeometry(sampleShape);
      sampleGeometry.rotateX(Math.PI / 2);
      
      const sampleMaterial = new THREE.MeshStandardMaterial({
        color: '#e6c587',
        side: THREE.DoubleSide
      });
      
      const sampleMesh = new THREE.Mesh(sampleGeometry, sampleMaterial);
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
      scene.rotation.x += deltaMove.y * 0.01;
      
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
