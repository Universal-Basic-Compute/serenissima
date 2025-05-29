import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D, { NodeObject, LinkObject } from 'react-force-graph-2d';
import * as d3Force from 'd3-force'; // Import d3-force for collision detection

interface CitizenNode extends NodeObject {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  img?: HTMLImageElement;
  imageUrl?: string | null; // Changed from coatOfArmsImageUrl to imageUrl
}

interface RelationshipLink extends LinkObject {
  source: string; // username of source citizen
  target: string; // username of target citizen
  strengthScore: number;
  trustScore: number;
}

interface RelationshipGraphProps {
  nodes: CitizenNode[];
  links: RelationshipLink[];
  width: number;
  height: number;
  onNodeClick?: (node: CitizenNode) => void; // Add onNodeClick prop
}

const RelationshipGraph: React.FC<RelationshipGraphProps> = ({ nodes, links, width, height, onNodeClick }) => {
  const fgRef = useRef<any>();
  const [processedNodes, setProcessedNodes] = useState<CitizenNode[]>([]);
  const [minTrust, setMinTrust] = useState<number>(0);
  const [maxTrust, setMaxTrust] = useState<number>(100);

  useEffect(() => {
    if (links && links.length > 0) {
      let currentMin = Infinity;
      let currentMax = -Infinity;
      links.forEach(link => {
        if (link.trustScore < currentMin) currentMin = link.trustScore;
        if (link.trustScore > currentMax) currentMax = link.trustScore;
      });
      setMinTrust(currentMin);
      setMaxTrust(currentMax);
    } else {
      // Default values if no links or empty links
      setMinTrust(0);
      setMaxTrust(100);
    }
  }, [links]);

  useEffect(() => {
    const loadImages = async () => {
      const imagePromises = nodes.map(node => {
        return new Promise<CitizenNode>(resolve => {
          const img = new Image();
          // node.imageUrl should contain the primary URL or /images/citizens/username.jpg
          // Final fallback to /images/citizens/default.jpg if node.imageUrl is null or fails
          img.src = node.imageUrl || '/images/citizens/default.jpg';

          img.onload = () => {
            resolve({ ...node, img });
          };
          img.onerror = () => {
            // If the provided node.imageUrl failed, try the absolute default if not already tried
            if (img.src !== '/images/citizens/default.jpg') {
              const defaultImg = new Image();
              defaultImg.src = '/images/citizens/default.jpg';
              defaultImg.onload = () => resolve({ ...node, img: defaultImg });
              defaultImg.onerror = () => resolve({ ...node, img: undefined }); // Ultimate failure
            } else {
              resolve({ ...node, img: undefined }); // Default image itself failed
            }
          };
        });
      });

      const loadedNodes = await Promise.all(imagePromises);
      setProcessedNodes(loadedNodes);
    };

    if (nodes.length > 0) {
      loadImages();
    } else {
      setProcessedNodes([]);
    }
  }, [nodes]);

  // Helper to parse hex color to RGB
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  // Helper to convert RGB to hex color
  const rgbToHex = (r: number, g: number, b: number): string => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  };

  // Helper to interpolate between two numbers
  const lerp = (start: number, end: number, t: number): number => {
    return start * (1 - t) + end * t;
  };

  const interpolateColor = (color1Hex: string, color2Hex: string, factor: number): string => {
    const rgb1 = hexToRgb(color1Hex);
    const rgb2 = hexToRgb(color2Hex);

    if (!rgb1 || !rgb2) return color1Hex; // Fallback

    const r = Math.round(lerp(rgb1.r, rgb2.r, factor));
    const g = Math.round(lerp(rgb1.g, rgb2.g, factor));
    const b = Math.round(lerp(rgb1.b, rgb2.b, factor));

    return rgbToHex(r, g, b);
  };

  const getTrustScoreColor = (trustScore: number): string => {
    const COLOR_RED = '#DC2626';       // Crimson Red (Distrust)
    const COLOR_YELLOW = '#F5E7C1';    // Parchment Yellow (Neutral/Tenuous)
    const COLOR_PURPLE = '#8B5CF6';    // Purple (Steadfast Trust)

    // Handle edge case: no links or all links have the same score
    if (minTrust === maxTrust) {
      if (minTrust < 0) return COLOR_RED;
      if (minTrust === 0) return COLOR_YELLOW;
      return COLOR_PURPLE; // All positive and same
    }

    // Case 1: All scores are negative (or zero)
    if (maxTrust <= 0) {
      if (minTrust === maxTrust) return COLOR_RED; // All same negative value
      const t = (trustScore - minTrust) / (maxTrust - minTrust); // Normalize from 0 (minTrust) to 1 (maxTrust, which is <=0)
      return interpolateColor(COLOR_RED, COLOR_YELLOW, t); // Interpolate Red to Yellow
    }

    // Case 2: All scores are positive (or zero)
    if (minTrust >= 0) {
      if (minTrust === maxTrust) return COLOR_PURPLE; // All same positive value
      const t = (trustScore - minTrust) / (maxTrust - minTrust); // Normalize from 0 (minTrust) to 1 (maxTrust)
      return interpolateColor(COLOR_YELLOW, COLOR_PURPLE, t); // Interpolate Yellow to Purple
    }

    // Case 3: Scores span across zero (minTrust < 0 and maxTrust > 0)
    if (trustScore < 0) {
      // Normalize from 0 (minTrust) to 1 (zero score)
      const t = (trustScore - minTrust) / (0 - minTrust);
      return interpolateColor(COLOR_RED, COLOR_YELLOW, t);
    } else { // trustScore >= 0
      // Normalize from 0 (zero score) to 1 (maxTrust)
      const t = trustScore / maxTrust;
      return interpolateColor(COLOR_YELLOW, COLOR_PURPLE, t);
    }
  };

  const getNodeLabel = (node: CitizenNode) => {
    return `${node.firstName || ''} ${node.lastName || ''} (${node.username})`;
  };
  
  useEffect(() => {
    const fg = fgRef.current;
    if (fg) {
      // Configure forces once for layout
      fg.d3Force('charge').strength(-250); // Increased repulsion for more space
      fg.d3Force('link').distance(80);    // Reduced link distance for shorter links

      // Add collision detection to prevent node overlap
      const nodeSize = 24; // Visual size of the node
      const collisionRadius = nodeSize / 2 + 6; // Radius for collision = nodeRadius + buffer
      fg.d3Force('collide', d3Force.forceCollide(collisionRadius));
    }
  }, []); // Run once when component mounts and fgRef is available

  useEffect(() => {
    const fg = fgRef.current;
    if (fg && processedNodes.length > 0) {
      // Zoom to fit all nodes when data or dimensions change
      fg.zoomToFit(400, 150); // Increased padding
    }
  }, [processedNodes, links, width, height]);


  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={{ nodes: processedNodes, links }}
      width={width}
      height={height}
      nodeLabel={getNodeLabel}
      nodeVal={24} // Consistent with visual size for physics calculations
      nodeCanvasObject={(node, ctx, globalScale) => {
        const size = 24; // Visual size of the node
        const fontSize = 10 / globalScale; // Adjust font size based on zoom
        const label = node.username;

        // Draw image (circle clipped)
        if (node.img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, size / 2, 0, 2 * Math.PI, false);
          ctx.clip();
          try {
            ctx.drawImage(node.img, node.x! - size / 2, node.y! - size / 2, size, size);
          } catch (e) {
            // Fallback if image drawing fails (e.g., image not fully loaded or corrupt)
            ctx.fillStyle = '#CCCCCC'; // Gray circle as fallback
            ctx.fill();
          }
          ctx.restore();
        } else {
          // Fallback if no image: draw a circle
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, size / 2, 0, 2 * Math.PI, false);
          ctx.fillStyle = '#CCCCCC'; // Gray circle
          ctx.fill();
        }
        
        // Draw label below the image
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#333'; // Darker text for better readability
        ctx.font = `${fontSize}px Sans-Serif`;
        ctx.fillText(label, node.x!, node.y! + size / 2 + 2 / globalScale);
      }}
      nodePointerAreaPaint={(node, color, ctx) => {
        const size = 24;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, size / 2, 0, 2 * Math.PI, false);
        ctx.fill();
      }}
      linkColor={(link: any) => getTrustScoreColor(link.trustScore)}
      linkWidth={(link: any) => 1 + Math.log1p((link.strengthScore || 0) / 25) * 1.5} // Subtle log scale: 1 to ~3.4px
      linkDirectionalParticles={1}
      linkDirectionalParticleWidth={(link: any) => 0.5 + Math.log1p((link.strengthScore || 0) / 25) * 0.75} // Subtle particle width
      linkDirectionalParticleSpeed={(link: any) => ((link.strengthScore || 0) / 100) * 0.005 + 0.002} // Slower particle speed
      cooldownTicks={100}
      onEngineStop={() => fgRef.current && processedNodes.length > 0 && fgRef.current.zoomToFit(400, 150)} // Zoom to fit after engine stops
      dagMode={null} // Disable DAG mode for a more organic layout
      dagLevelDistance={150} // Increased distance if DAG mode were used
      d3AlphaDecay={0.0228} // Default value
      d3VelocityDecay={0.4} // Default value
      linkCurvature={0.1} // Slight curvature for aesthetics
      enableZoomInteraction={true}
      enablePanInteraction={true}
      enablePointerInteraction={true}
      minZoom={0.5}
      maxZoom={5}
      onNodeClick={(node, event) => {
        if (onNodeClick && node) {
          // The node object from react-force-graph might have extra properties (x, y, vx, vy, index).
          // We only care about the CitizenNode properties.
          const citizenNode: CitizenNode = {
            id: node.id as string, // id is typically string or number, ensure it's string
            username: (node as CitizenNode).username,
            firstName: (node as CitizenNode).firstName,
            lastName: (node as CitizenNode).lastName,
            imageUrl: (node as CitizenNode).imageUrl,
            // img is an HTMLImageElement, not needed for the click handler logic itself
          };
          onNodeClick(citizenNode);
        }
      }}
    />
  );
};

export default RelationshipGraph;
