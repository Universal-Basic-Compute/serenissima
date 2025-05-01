'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';

export default function PolygonViewer() {
  const canvasRef = useRef(null);
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [highQuality, setHighQuality] = useState(false);
  const [activeView, setActiveView] = useState('buildings'); // 'buildings', 'transport', or 'land'
  const [hoveredPolygonId, setHoveredPolygonId] = useState(null);
  const [selectedPolygonId, setSelectedPolygonId] = useState(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const polygonMeshesRef = useRef({});
  
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

  // Update info panel visibility when selectedPolygonId changes
  useEffect(() => {
    if (selectedPolygonId) {
      setInfoVisible(true);
    } else {
      // Delay hiding the info to allow for animation
      const timer = setTimeout(() => {
        setInfoVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedPolygonId]);

  // Set up Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;
    
    console.log(`Setting up Three.js scene with ${activeView} view`);
    console.log('Polygons:', polygons);

    // Initialize Three.js
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1e5799'); // Brighter blue background
    
    // Create a fog effect for depth
    scene.fog = new THREE.FogExp2('#1e5799', 0.0005); // Further reduced fog density for performance
    
    // Create a raycaster for mouse interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    // Create a camera with a better initial position
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    
    // Apply performance settings based on quality mode
    const performanceMode = !highQuality;
    
    // Initial camera position - higher up and further back for a good overview
    camera.position.set(0, 80, 80);
    
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true // Always enable antialiasing for better visual quality
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(performanceMode ? 1 : (window.devicePixelRatio > 1 ? 2 : 1)); // Lower pixel ratio in performance mode
    renderer.shadowMap.enabled = !performanceMode; // Disable shadows in performance mode
    renderer.shadowMap.type = performanceMode ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Set up EffectComposer for post-processing effects
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Set up OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    
    // Configure controls for this specific application
    controls.enableDamping = !performanceMode; // Disable damping in performance mode
    controls.dampingFactor = 0.1; // Amount of inertia
    
    // Limit vertical rotation to prevent going under the map
    controls.minPolarAngle = 0; // Can't go below the horizon
    controls.maxPolarAngle = Math.PI / 2 - 0.1; // Can't go below the horizon (with small margin)
    
    // Limit zoom range
    controls.minDistance = 10; // Can't zoom in too close
    controls.maxDistance = 300; // Can't zoom out too far
    
    // Enable panning with right mouse button
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    
    // Make panning parallel to the ground plane
    controls.screenSpacePanning = false;
    
    // Set initial target to center of scene
    controls.target.set(0, 0, 0);
    controls.update();
    
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
    sunLight.shadow.mapSize.width = performanceMode ? 512 : 1024;
    sunLight.shadow.mapSize.height = performanceMode ? 512 : 1024;
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
    const waterGeometry = new THREE.PlaneGeometry(200, 200, performanceMode ? 8 : 20, performanceMode ? 8 : 20);
    const waterMaterial = new THREE.MeshStandardMaterial({ 
      color: activeView === 'transport' ? '#00aaff' : 
             activeView === 'land' ? '#004488' : 
             '#0066cc', // Different blue for each view
      transparent: true,
      opacity: 0.7,
      metalness: 0.2,
      roughness: 0.1,
      normalMap: performanceMode ? null : waterNormalMap, // Disable normal map in performance mode
      normalScale: new THREE.Vector2(0.4, 0.4),
      envMapIntensity: 0.8,
      flatShading: performanceMode // Enable flat shading in performance mode
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
              steps: performanceMode ? 1 : 2,
              depth: 0.025 + Math.random() * 0.025, // 75% thinner than the previous setting
              bevelEnabled: false // Disable bevel completely to remove space between islands
            };
            
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            
            // Rotate to lay flat on the "ground" but facing upward
            geometry.rotateX(-Math.PI / 2);
            
            // Create a realistic sand material
            const sandMaterial = new THREE.MeshStandardMaterial({ 
              color: '#e6d2a8', // More yellow/tan color
              map: performanceMode ? null : sandBaseColor, // Disable texture in performance mode
              normalMap: performanceMode ? null : sandNormalMap, // Disable normal map in performance mode
              roughnessMap: performanceMode ? null : sandRoughnessMap, // Disable roughness map in performance mode
              roughness: 0.7,
              metalness: 0.1,
              side: performanceMode ? THREE.FrontSide : THREE.DoubleSide, // Use single-sided rendering in performance mode
              flatShading: performanceMode, // Enable flat shading in performance mode
              wireframe: false,
              // Remove polygon edges by setting these properties:
              polygonOffset: true,
              polygonOffsetFactor: 1,
              polygonOffsetUnits: 1
            });
            
            // Modify the material based on the active view
            if (activeView === 'land') {
              // For land view, use a more terrain-like material
              sandMaterial.color.set('#7cac6a'); // More green for land view
              sandMaterial.roughness = 0.9;
              sandMaterial.metalness = 0.0;
            }
            
            const mesh = new THREE.Mesh(geometry, sandMaterial);
            
            // Store reference to the mesh
            polygonMeshesRef.current[polygon.id] = mesh;
            
            // Store the original material properties explicitly on creation
            mesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
            mesh.userData.originalEmissiveIntensity = 0;
            
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
        depth: 0.04, // 75% thinner than the previous setting
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
      
      if (activeView === 'land') {
        // For land view, use a more terrain-like material
        sampleMaterial.color.set('#7cac6a'); // More green for land view
        sampleMaterial.roughness = 0.9;
        sampleMaterial.metalness = 0.0;
      }
      
      const sampleMesh = new THREE.Mesh(sampleGeometry, sampleMaterial);
      sampleMesh.castShadow = true;
      sampleMesh.receiveShadow = true;
      
      // Store the original material properties explicitly
      sampleMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
      sampleMesh.userData.originalEmissiveIntensity = 0;
      
      scene.add(sampleMesh);
      console.log('Added sample polygon to scene');
    }
    
    // Function to reset camera to a good viewing position
    const resetCamera = () => {
      // Smoothly animate to the default position
      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      const endPosition = new THREE.Vector3(0, 80, 80);
      const endTarget = new THREE.Vector3(0, 0, 0);
      
      // Animation duration in milliseconds
      const duration = 1000;
      const startTime = Date.now();
      
      function animateReset() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Use easeOutCubic easing function for smooth deceleration
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        // Interpolate position and target
        camera.position.lerpVectors(startPosition, endPosition, easeProgress);
        controls.target.lerpVectors(startTarget, endTarget, easeProgress);
        controls.update();
        
        if (progress < 1) {
          requestAnimationFrame(animateReset);
        }
      }
      
      animateReset();
    };
    
    // Store the resetCamera function in our ref so it can be called from outside
    resetCameraRef.current = resetCamera;
    
    // Call this initially to set a good starting view
    resetCamera();
    
    // Add a frame counter for less frequent updates
    let frameCount = 0;
    
    // Handle mouse move for hover effect
    const handleMouseMove = (event) => {
      // Only process hover in land view
      if (activeView !== 'land') return;
      
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      // Update the raycaster with the camera and mouse position
      raycaster.setFromCamera(mouse, camera);
      
      // Get objects intersecting the ray
      const intersects = raycaster.intersectObjects(scene.children, false);
      
      // Find the currently hovered polygon
      let currentHoveredId = null;
      
      if (intersects.length > 0) {
        const object = intersects[0].object;
        
        // Find the polygon ID from our ref
        const hoveredId = Object.keys(polygonMeshesRef.current).find(
          id => polygonMeshesRef.current[id] === object
        );
        
        if (hoveredId && hoveredId !== selectedPolygonId) {
          currentHoveredId = hoveredId;
        }
      }
      
      // If the hovered polygon has changed
      if (currentHoveredId !== hoveredPolygonId) {
        // Remove hover effect from previously hovered polygon
        if (hoveredPolygonId && hoveredPolygonId !== selectedPolygonId) {
          const previousHovered = polygonMeshesRef.current[hoveredPolygonId];
          if (previousHovered && previousHovered.material) {
            // Cancel any ongoing animations
            gsap.killTweensOf(previousHovered.material.emissive);
            gsap.killTweensOf(previousHovered.material);
            
            // Reset to original values immediately
            previousHovered.material.emissive.set(0, 0, 0);
            previousHovered.material.emissiveIntensity = 0;
          }
        }
        
        // Apply hover effect to newly hovered polygon
        if (currentHoveredId) {
          const newHovered = polygonMeshesRef.current[currentHoveredId];
          if (newHovered && newHovered.material) {
            // Cancel any ongoing animations
            gsap.killTweensOf(newHovered.material.emissive);
            gsap.killTweensOf(newHovered.material);
            
            // Apply hover effect
            gsap.to(newHovered.material.emissive, {
              r: 0.53,
              g: 1.0,
              b: 0.53,
              duration: 0.3
            });
            
            gsap.to(newHovered.material, {
              emissiveIntensity: 0.5,
              duration: 0.3
            });
          }
        }
        
        // Update the hovered polygon ID
        setHoveredPolygonId(currentHoveredId);
      }
    };

    // Handle mouse click for selection
    const handleMouseClick = (event) => {
      // Only process selection in land view
      if (activeView !== 'land') return;
      
      // Update the raycaster with the camera and mouse position
      raycaster.setFromCamera(mouse, camera);
      
      // Get objects intersecting the ray
      const intersects = raycaster.intersectObjects(scene.children, false);
      
      // Check if we're clicking on a polygon
      if (intersects.length > 0) {
        const object = intersects[0].object;
        
        // Find the polygon ID from our ref
        const clickedId = Object.keys(polygonMeshesRef.current).find(
          id => polygonMeshesRef.current[id] === object
        );
        
        if (clickedId) {
          // If clicking the same polygon, deselect it
          if (clickedId === selectedPolygonId) {
            setSelectedPolygonId(null);
            
            // Remove selection effect with animation
            if (object.material) {
              // Kill any existing tweens
              gsap.killTweensOf(object.material.emissive);
              gsap.killTweensOf(object.material);
              
              // Animate back to original material properties
              gsap.to(object.material.emissive, {
                r: object.userData.originalEmissive?.r || 0,
                g: object.userData.originalEmissive?.g || 0,
                b: object.userData.originalEmissive?.b || 0,
                duration: 0.5
              });
              
              gsap.to(object.material, {
                emissiveIntensity: object.userData.originalEmissiveIntensity || 0,
                duration: 0.5
              });
              
              // Fade out the outline mesh if it exists
              if (object.userData.outlineMesh) {
                gsap.to(object.userData.outlineMesh.material, {
                  opacity: 0,
                  duration: 0.3,
                  onComplete: () => {
                    // Remove the outline mesh from the scene
                    scene.remove(object.userData.outlineMesh);
                    // Clean up
                    object.userData.outlineMesh.geometry.dispose();
                    object.userData.outlineMesh.material.dispose();
                    object.userData.outlineMesh = null;
                  }
                });
              }
            }
          } else {
            // Deselect previous selection if any
            if (selectedPolygonId) {
              const previousSelected = polygonMeshesRef.current[selectedPolygonId];
              if (previousSelected && previousSelected.material) {
                // Animate back to original material properties
                gsap.to(previousSelected.material.emissive, {
                  r: previousSelected.userData.originalEmissive?.r || 0,
                  g: previousSelected.userData.originalEmissive?.g || 0,
                  b: previousSelected.userData.originalEmissive?.b || 0,
                  duration: 0.5
                });
                
                gsap.to(previousSelected.material, {
                  emissiveIntensity: previousSelected.userData.originalEmissiveIntensity || 0,
                  duration: 0.5
                });
                
                // Fade out the outline mesh if it exists
                if (previousSelected.userData.outlineMesh) {
                  gsap.to(previousSelected.userData.outlineMesh.material, {
                    opacity: 0,
                    duration: 0.3,
                    onComplete: () => {
                      // Remove the outline mesh from the scene
                      scene.remove(previousSelected.userData.outlineMesh);
                      // Clean up
                      previousSelected.userData.outlineMesh.geometry.dispose();
                      previousSelected.userData.outlineMesh.material.dispose();
                      previousSelected.userData.outlineMesh = null;
                    }
                  });
                }
              }
            }
            
            // Select the new polygon
            setSelectedPolygonId(clickedId);
            
            // Apply selection effect with animation
            if (object.material) {
              // Store original material properties if not already stored
              if (!object.userData.originalEmissive) {
                object.userData.originalEmissive = object.material.emissive.clone();
                object.userData.originalEmissiveIntensity = object.material.emissiveIntensity;
              }
              
              // Animate selection effect - stronger than hover
              gsap.to(object.material.emissive, {
                r: 0,    // 0x00/255
                g: 1.0,  // 0xff/255
                b: 0,    // 0x00/255
                duration: 0.5
              });
              
              gsap.to(object.material, {
                emissiveIntensity: 0.8,
                duration: 0.5
              });
              
              // Instead of using OutlinePass, let's create a simple outline effect
              // by duplicating the mesh and scaling it slightly larger
              if (!object.userData.outlineMesh) {
                // Clone the geometry
                const outlineGeometry = object.geometry.clone();
                
                // Create outline material
                const outlineMaterial = new THREE.MeshBasicMaterial({
                  color: 0x00ff00,
                  side: THREE.BackSide,
                  transparent: true,
                  opacity: 0,
                  depthTest: true
                });
                
                // Create outline mesh
                const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
                outlineMesh.scale.multiplyScalar(1.01); // Make it slightly larger
                outlineMesh.position.copy(object.position);
                outlineMesh.rotation.copy(object.rotation);
                scene.add(outlineMesh);
                
                // Store reference to outline mesh
                object.userData.outlineMesh = outlineMesh;
              }
              
              // Animate the outline opacity
              gsap.to(object.userData.outlineMesh.material, {
                opacity: 0.3,
                duration: 0.5
              });
            }
          }
        }
      } else {
        // Clicking on empty space, deselect current selection
        if (selectedPolygonId) {
          const previousSelected = polygonMeshesRef.current[selectedPolygonId];
          if (previousSelected && previousSelected.material) {
            // Animate back to original material properties
            gsap.to(previousSelected.material.emissive, {
              r: previousSelected.userData.originalEmissive?.r || 0,
              g: previousSelected.userData.originalEmissive?.g || 0,
              b: previousSelected.userData.originalEmissive?.b || 0,
              duration: 0.5
            });
              
            gsap.to(previousSelected.material, {
              emissiveIntensity: previousSelected.userData.originalEmissiveIntensity || 0,
              duration: 0.5
            });
              
            // Fade out the outline mesh if it exists
            if (previousSelected.userData.outlineMesh) {
              gsap.to(previousSelected.userData.outlineMesh.material, {
                opacity: 0,
                duration: 0.3,
                onComplete: () => {
                  // Remove the outline mesh from the scene
                  scene.remove(previousSelected.userData.outlineMesh);
                  // Clean up
                  previousSelected.userData.outlineMesh.geometry.dispose();
                  previousSelected.userData.outlineMesh.material.dispose();
                  previousSelected.userData.outlineMesh = null;
                }
              });
            }
          }
            
          setSelectedPolygonId(null);
        }
      }
    };

    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleMouseClick);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Update controls each frame for smooth damping effect
      controls.update();
      
      // Animate water normal map with less frequent updates
      const time = Date.now() * 0.0005; // Reduced animation speed
      
      // Only update normal map if it exists (not in performance mode)
      if (waterMaterial.normalMap) {
        waterMaterial.normalMap.offset.x = time * 0.05;
        waterMaterial.normalMap.offset.y = time * 0.05;
      }
      
      // Animate water waves much less frequently in performance mode
      const updateFrequency = performanceMode ? 10 : 3;
      if (waterVertices && frameCount % updateFrequency === 0) {
        // Process fewer vertices in performance mode
        const stride = performanceMode ? 6 : 2;
        for (let i = 0; i < waterVertexCount; i += stride) {
          const x = waterVertices.getX(i);
          const z = waterVertices.getZ(i);
          const waveHeight = 0.05; // Reduced wave height
          
          // Simpler wave calculation in performance mode
          const y = performanceMode 
            ? Math.sin(x * 0.2 + time) * waveHeight 
            : Math.sin(x * 0.3 + time) * Math.cos(z * 0.3 + time) * waveHeight;
            
          waterVertices.setY(i, y);
        }
        
        waterGeometry.attributes.position.needsUpdate = true;
      }
      
      frameCount++;
      
      // Use composer instead of renderer directly to include post-processing effects
      composer.render();
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
      // Dispose of controls
      controls.dispose();
      
      window.removeEventListener('resize', handleResize);
      
      // Make resetCamera available to the component
      if (typeof window !== 'undefined') {
        window.resetCameraView = undefined;
      }
      
      // Remove event listeners
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleMouseClick);
      
      // Clean up any outline meshes
      Object.values(polygonMeshesRef.current).forEach(mesh => {
        if (mesh.userData.outlineMesh) {
          scene.remove(mesh.userData.outlineMesh);
          mesh.userData.outlineMesh.geometry.dispose();
          mesh.userData.outlineMesh.material.dispose();
          mesh.userData.outlineMesh = null;
        }
      });
      
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
  }, [polygons, loading, activeView]);
  
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
      {/* Floating menu on the left side */}
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-white rounded-lg shadow-lg p-2 flex flex-col gap-3">
        <button 
          onClick={() => setActiveView('buildings')}
          className={`p-3 rounded-lg transition-all ${activeView === 'buildings' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
          title="Buildings View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </button>
        <button 
          onClick={() => setActiveView('transport')}
          className={`p-3 rounded-lg transition-all ${activeView === 'transport' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
          title="Transport View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
        <button 
          onClick={() => setActiveView('land')}
          className={`p-3 rounded-lg transition-all ${activeView === 'land' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
          title="Land View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </button>
      </div>

      {/* Existing info panel */}
      <div className="absolute top-4 left-4 z-10 bg-white p-2 rounded shadow">
        {polygons.length === 0 ? (
          <p>No polygons found. Draw some on the map first.</p>
        ) : (
          <p>Found {polygons.length} polygon(s)</p>
        )}
      </div>
      
      {selectedPolygonId && (
        <div 
          className={`absolute top-16 left-4 z-10 bg-white p-2 rounded shadow transition-all duration-300 ${
            infoVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform -translate-y-4'
          }`}
        >
          <p>Selected: {selectedPolygonId}</p>
        </div>
      )}

      {/* Existing buttons */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <button 
          onClick={resetView}
          className="bg-white px-4 py-2 rounded shadow"
        >
          Reset View
        </button>
        <button 
          onClick={() => setHighQuality(!highQuality)}
          className={`px-4 py-2 rounded shadow ${highQuality ? 'bg-white' : 'bg-blue-500 text-white'}`}
        >
          {highQuality ? 'Performance Mode' : 'Quality Mode'}
        </button>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
