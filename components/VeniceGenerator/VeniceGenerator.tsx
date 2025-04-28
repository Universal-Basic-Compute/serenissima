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
      canalDensity: 0.7, // Increased from 0.6
      merchantDistrictDensity: 0.8,
      residentialDistrictDensity: 0.4,
      bridgeDensity: 0.6, // Increased from 0.5
      campoFrequency: 0.15, // Reduced from 0.2
      erosionFactor: 0.4, // Increased from 0.3
      islandDensity: 0.6,
      buildingDensity: 0.7,
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
          <pattern id="water" patternUnits="userSpaceOnUse" width="30" height="20">
            <rect width="30" height="20" fill="#a4cbe8"/>
            <path d="M0,5 Q7.5,2 15,5 T30,5" fill="none" stroke="#8bbad4" stroke-width="0.5" opacity="0.6"/>
            <path d="M0,10 Q7.5,7 15,10 T30,10" fill="none" stroke="#8bbad4" stroke-width="0.5" opacity="0.6"/>
            <path d="M0,15 Q7.5,12 15,15 T30,15" fill="none" stroke="#8bbad4" stroke-width="0.5" opacity="0.6"/>
          </pattern>
          
          <!-- Canal pattern that matches water -->
          <pattern id="canalPattern" patternUnits="userSpaceOnUse" width="30" height="20">
            <rect width="30" height="20" fill="#a4cbe8"/>
            <path d="M0,5 Q7.5,2 15,5 T30,5" fill="none" stroke="#8bbad4" stroke-width="0.5" opacity="0.6"/>
            <path d="M0,10 Q7.5,7 15,10 T30,10" fill="none" stroke="#8bbad4" stroke-width="0.5" opacity="0.6"/>
            <path d="M0,15 Q7.5,12 15,15 T30,15" fill="none" stroke="#8bbad4" stroke-width="0.5" opacity="0.6"/>
          </pattern>
          
          <!-- Improved texture for islands -->
          <pattern id="islandTexture" patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#d4cebf"/>
            <circle cx="5" cy="5" r="0.5" fill="#c4baa8" fill-opacity="0.2"/>
          </pattern>
          
          <!-- Improved texture for campos -->
          <pattern id="campoTexture" patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#e9e5dc"/>
            <path d="M0,0 L10,10 M10,0 L0,10" stroke="#d8d4cb" stroke-width="0.3" opacity="0.3"/>
          </pattern>
          
          <!-- Add a subtle shadow effect -->
          <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
            <feOffset dx="1" dy="1" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.2" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        <!-- Background water -->
        <rect width="${width}" height="${height}" fill="url(#water)"/>
        
        <!-- Islands with shadow -->
        <g filter="url(#dropShadow)">
          ${islands.map(island => island.svgPath).join('\n')}
        </g>
        
        <!-- Canals - now using the same pattern as water -->
        ${canals.map(canal => {
          // Extract the path data and width from the svgPath
          const pathMatch = canal.svgPath.match(/d="([^"]+)"/);
          const widthMatch = canal.svgPath.match(/stroke-width="([^"]+)"/);
          
          if (pathMatch && widthMatch) {
            const pathData = pathMatch[1];
            const strokeWidth = widthMatch[1];
            
            // Return a path with the water pattern as stroke
            return `<path d="${pathData}" stroke="url(#canalPattern)" stroke-width="${strokeWidth}" fill="none" />`;
          }
          return canal.svgPath;
        }).join('\n')}
        
        <!-- Bridges -->
        ${bridges.map(bridge => bridge.svgPath).join('\n')}
        
        <!-- Add a title and compass -->
        <text x="20" y="30" font-family="Arial" font-size="16" fill="#555" font-weight="bold">Venezia</text>
        
        <!-- Simple compass rose -->
        <g transform="translate(${width - 50}, 50)">
          <circle cx="0" cy="0" r="15" fill="#f5f2e8" stroke="#8c7e6b" stroke-width="0.5" />
          <path d="M0,-12 L0,12 M-12,0 L12,0" stroke="#8c7e6b" stroke-width="1" />
          <text x="0" y="-16" font-family="Arial" font-size="8" fill="#555" text-anchor="middle">N</text>
          <text x="16" y="0" font-family="Arial" font-size="8" fill="#555" dominant-baseline="middle">E</text>
          <text x="0" y="20" font-family="Arial" font-size="8" fill="#555" text-anchor="middle">S</text>
          <text x="-16" y="0" font-family="Arial" font-size="8" fill="#555" dominant-baseline="middle">W</text>
        </g>
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
