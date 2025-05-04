'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SimpleCamera from './SimpleCamera';
import SimplePolygonRenderer from './SimplePolygonRenderer';
import SimpleWater from './SimpleWater';
import { calculateBounds } from './utils';

export default function SimpleViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // References to our scene components
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraControllerRef = useRef<SimpleCamera | null>(null);
  const polygonRendererRef = useRef<SimplePolygonRenderer | null>(null);
  const waterRef = useRef<SimpleWater | null>(null);
  
  // Load polygons
  useEffect(() => {
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        if (data.polygons) {
          setPolygons(data.polygons);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
        setLoading(false);
      });
  }, []);
  
  // Set up Three.js scene
  useEffect(() => {
    if (!canvasRef.current || loading || polygons.length === 0) return;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87CEEB'); // Light sky blue
    sceneRef.current = scene;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    
    // Calculate bounds for all polygons
    const bounds = calculateBounds(polygons);
    
    // Create camera controller
    const cameraController = new SimpleCamera(renderer.domElement);
    cameraControllerRef.current = cameraController;
    
    // Create polygon renderer
    const polygonRenderer = new SimplePolygonRenderer({
      scene,
      polygons,
      bounds
    });
    polygonRendererRef.current = polygonRenderer;
    
    // Create water
    const waterSize = Math.max(bounds.scale * 1000, 2000); // Doubled from 500 to 1000, and min size from 1000 to 2000
    const water = new SimpleWater({
      scene,
      size: waterSize
    });
    waterRef.current = water;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (cameraController) {
        cameraController.update();
      }
      
      if (waterRef.current) {
        waterRef.current.update();
      }
      
      renderer.render(scene, cameraController.camera);
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      if (!cameraController || !renderer) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      cameraController.camera.aspect = width / height;
      cameraController.camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (waterRef.current) waterRef.current.cleanup();
      if (polygonRenderer) polygonRenderer.cleanup();
      if (cameraController) cameraController.cleanup();
      if (renderer) renderer.dispose();
      
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
    };
  }, [polygons, loading]);
  
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-lg">Loading map data...</div>
      </div>
    );
  }
  
  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
