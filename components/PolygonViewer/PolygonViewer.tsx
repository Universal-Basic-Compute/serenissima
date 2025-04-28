'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Component to render a single polygon
const Polygon = ({ coordinates, color = '#e6c587' }) => {
  const shape = new THREE.Shape();
  
  // Start the shape with the first point
  if (coordinates.length > 0) {
    shape.moveTo(coordinates[0].lng, coordinates[0].lat);
    
    // Add the rest of the points
    for (let i = 1; i < coordinates.length; i++) {
      shape.lineTo(coordinates[i].lng, coordinates[i].lat);
    }
    
    // Close the shape
    shape.lineTo(coordinates[0].lng, coordinates[0].lat);
  }

  // Create geometry from the shape
  const geometry = new THREE.ShapeGeometry(shape);
  
  // Rotate to lay flat on the "ground"
  geometry.rotateX(Math.PI / 2);
  
  return (
    <mesh geometry={geometry} position={[0, 0, 0]}>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} />
    </mesh>
  );
};

// Camera setup component
const CameraSetup = ({ polygons }) => {
  const { camera } = useThree();
  
  useEffect(() => {
    if (polygons.length > 0) {
      // Calculate bounding box of all polygons
      const bbox = new THREE.Box3();
      
      polygons.forEach(polygon => {
        polygon.coordinates.forEach(point => {
          bbox.expandByPoint(new THREE.Vector3(point.lng, 0, point.lat));
        });
      });
      
      // Position camera to view all polygons
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      
      const size = new THREE.Vector3();
      bbox.getSize(size);
      
      const maxDim = Math.max(size.x, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      
      // Add some padding
      cameraZ *= 1.5;
      
      camera.position.set(center.x, cameraZ, center.z);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    }
  }, [camera, polygons]);
  
  return null;
};

// Main component
export default function PolygonViewer() {
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
  
  if (loading) {
    return <div className="w-full h-full flex items-center justify-center">Loading polygons...</div>;
  }
  
  return (
    <div className="w-screen h-screen">
      <Canvas>
        <CameraSetup polygons={polygons} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
        <gridHelper args={[10, 10]} />
        
        {/* Water plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#1e3a8a" transparent opacity={0.8} />
        </mesh>
        
        {/* Render polygons */}
        {polygons.map((polygon, index) => (
          <Polygon key={index} coordinates={polygon.coordinates} />
        ))}
      </Canvas>
    </div>
  );
}
