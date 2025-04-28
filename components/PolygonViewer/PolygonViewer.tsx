'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function PolygonViewer() {
  const canvasRef = useRef(null);
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Load saved polygons
  useEffect(() => {
    const loadPolygons = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/get-polygons');
        const data = await response.json();
        
        if (data.polygons) {
          setPolygons(data.polygons);
        }
      } catch (error) {
        console.error('Error loading polygons:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadPolygons();
  }, []);

  // Set up Three.js scene
  useEffect(() => {
    if (!canvasRef.current || loading || polygons.length === 0) return;

    // Initialize Three.js
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1e3a8a'); // Blue background
    
    const camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    camera.position.z = 5;
    
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
    
    // Add polygons
    polygons.forEach(polygon => {
      if (polygon.coordinates && polygon.coordinates.length > 2) {
        const shape = new THREE.Shape();
        
        // Start the shape with the first point
        shape.moveTo(polygon.coordinates[0].lng, polygon.coordinates[0].lat);
        
        // Add the rest of the points
        for (let i = 1; i < polygon.coordinates.length; i++) {
          shape.lineTo(polygon.coordinates[i].lng, polygon.coordinates[i].lat);
        }
        
        // Create geometry from the shape
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.rotateX(Math.PI / 2);
        
        const material = new THREE.MeshStandardMaterial({ 
          color: '#e6c587', // Sand color
          side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
      }
    });
    
    // Calculate bounding box to position camera
    const bbox = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    const maxDim = Math.max(size.x, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Add padding
    
    camera.position.set(center.x, cameraZ, center.z);
    camera.lookAt(center);
    
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
    
    // Add event listeners
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
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
  
  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
