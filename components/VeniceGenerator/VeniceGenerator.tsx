"use client";

import React, { useEffect, useState, useRef } from 'react';
import { generateCanals } from './canals';
import { generateIslands } from './islands';
import { placeBridges } from './bridges';
import { VeniceConfig } from './utils';

interface VeniceGeneratorProps {
  width: number;
  height: number;
  config?: Partial<VeniceConfig>;
}

const VeniceGenerator: React.FC<VeniceGeneratorProps> = ({ 
  width = 800, 
  height = 600,
  config = {} 
}) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [seed, setSeed] = useState<number>(Math.random());
  const configRef = useRef(config);
  
  // Store previous values to detect changes
  const prevWidth = useRef(width);
  const prevHeight = useRef(height);
  
  useEffect(() => {
    // Generate the Venice map when seed, width or height changes
    generateVeniceMap(width, height, configRef.current);
    
    prevWidth.current = width;
    prevHeight.current = height;
  }, [width, height, seed]);
  
  const regenerateMap = () => {
    setSeed(Math.random());
  };
  
  const generateVeniceMap = (width: number, height: number, config: Partial<VeniceConfig>) => {
    // Merge default config with provided config
    const fullConfig: VeniceConfig = {
      canalDensity: 0.6,
      merchantDistrictDensity: 0.8,
      residentialDistrictDensity: 0.4,
      bridgeDensity: 0.5,
      campoFrequency: 0.2,
      erosionFactor: 0.3,
      ...config
    };
    
    // Generate canals
    const canals = generateCanals(width, height, fullConfig);
    
    // Generate islands based on canals
    const islands = generateIslands(canals, fullConfig);
    
    // Place bridges
    const bridges = placeBridges(canals, islands, fullConfig);
    
    // Combine everything into SVG
    const svg = renderToSVG(width, height, canals, islands, bridges);
    setSvgContent(svg);
  };
  
  const renderToSVG = (
    width: number, 
    height: number, 
    canals: any[], 
    islands: any[], 
    bridges: any[]
  ): string => {
    // Create SVG content
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width: 100%; height: auto;">
        <defs>
          <pattern id="water" patternUnits="userSpaceOnUse" width="20" height="20">
            <rect width="20" height="20" fill="#a4cbe8"/>
            <path d="M0,10 Q5,5 10,10 T20,10" fill="none" stroke="#8bbad4" stroke-width="0.5"/>
            <path d="M0,15 Q5,10 10,15 T20,15" fill="none" stroke="#8bbad4" stroke-width="0.5"/>
          </pattern>
          
          <!-- Add a subtle texture for islands -->
          <pattern id="islandTexture" patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#d4cebf"/>
            <circle cx="5" cy="5" r="0.5" fill="#c4baa8" fill-opacity="0.3"/>
          </pattern>
          
          <!-- Add a subtle texture for campos -->
          <pattern id="campoTexture" patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#e9e5dc"/>
            <path d="M0,0 L10,10 M10,0 L0,10" stroke="#d8d4cb" stroke-width="0.3"/>
          </pattern>
        </defs>
        
        <!-- Background water -->
        <rect width="${width}" height="${height}" fill="url(#water)"/>
        
        <!-- Islands -->
        ${islands.map(island => island.svgPath).join('\n')}
        
        <!-- Canals -->
        ${canals.map(canal => canal.svgPath).join('\n')}
        
        <!-- Bridges -->
        ${bridges.map(bridge => bridge.svgPath).join('\n')}
        
        <!-- Add a title -->
        <text x="20" y="30" font-family="Arial" font-size="16" fill="#555">Venezia</text>
      </svg>
    `;
  };
  
  return (
    <div className="venice-generator">
      <div dangerouslySetInnerHTML={{ __html: svgContent }} />
      <button 
        onClick={regenerateMap}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        Generate New Map
      </button>
    </div>
  );
};

export default VeniceGenerator;
