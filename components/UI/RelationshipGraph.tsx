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

  const getTrustScoreColor = (trustScore: number): string => {
    if (trustScore <= 33) return '#F5E7C1'; // Paper yellow
    if (trustScore <= 66) return '#F97316'; // Venice orange
    return '#8B5CF6'; // Purple
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
