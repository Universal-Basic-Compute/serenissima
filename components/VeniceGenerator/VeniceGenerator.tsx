"use client";

import React, { useEffect, useState } from 'react';
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
  
  useEffect(() => {
    // Generate the Venice map
    generateVeniceMap(width, height, config);
  }, [width, height, config]);
  
  const generateVeniceMap = async (width: number, height: number, config: Partial<VeniceConfig>) => {
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
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="water" patternUnits="userSpaceOnUse" width="20" height="20">
            <rect width="20" height="20" fill="#a4cbe8"/>
            <path d="M0,10 Q5,5 10,10 T20,10" fill="none" stroke="#8bbad4" stroke-width="0.5"/>
            <path d="M0,15 Q5,10 10,15 T20,15" fill="none" stroke="#8bbad4" stroke-width="0.5"/>
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
      </svg>
    `;
  };
  
  return (
    <div className="venice-generator">
      <div dangerouslySetInnerHTML={{ __html: svgContent }} />
    </div>
  );
};

export default VeniceGenerator;
