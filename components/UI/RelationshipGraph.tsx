import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D, { NodeObject, LinkObject } from 'react-force-graph-2d';

interface CitizenNode extends NodeObject {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  img?: HTMLImageElement;
  coatOfArmsImageUrl?: string | null;
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
}

const RelationshipGraph: React.FC<RelationshipGraphProps> = ({ nodes, links, width, height }) => {
  const fgRef = useRef<any>();
  const [processedNodes, setProcessedNodes] = useState<CitizenNode[]>([]);

  useEffect(() => {
    const loadImages = async () => {
      const imagePromises = nodes.map(node => {
        return new Promise<CitizenNode>(resolve => {
          if (node.coatOfArmsImageUrl) {
            const img = new Image();
            img.src = node.coatOfArmsImageUrl;
            img.onload = () => {
              resolve({ ...node, img });
            };
            img.onerror = () => {
              // Fallback image or handle error
              const fallbackImg = new Image();
              fallbackImg.src = '/coat-of-arms/default.png'; // Ensure you have a default image
              fallbackImg.onload = () => resolve({ ...node, img: fallbackImg });
              fallbackImg.onerror = () => resolve({ ...node, img: undefined }); // No image if fallback fails
            };
          } else {
            // Fallback if no specific image URL
            const fallbackImg = new Image();
            fallbackImg.src = `/images/citizens/${node.username || 'default'}.jpg`;
            fallbackImg.onload = () => resolve({ ...node, img: fallbackImg });
            fallbackImg.onerror = () => {
                const defaultImg = new Image();
                defaultImg.src = '/images/citizens/default.jpg';
                defaultImg.onload = () => resolve({ ...node, img: defaultImg });
                defaultImg.onerror = () => resolve({ ...node, img: undefined });
            };
          }
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
    if (fgRef.current) {
      // Zoom to fit all nodes
      fgRef.current.zoomToFit(400, 100); // Adjust padding as needed
    }
  }, [processedNodes, links, width, height]);


  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={{ nodes: processedNodes, links }}
      width={width}
      height={height}
      nodeLabel={getNodeLabel}
      nodeVal={node => 20} // Size of the node area for image
      nodeCanvasObject={(node, ctx, globalScale) => {
        const size = 24; // Increased size for better visibility
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
      linkWidth={(link: any) => Math.max(1, (link.strengthScore / 100) * 8)} // Scale thickness from 1 to 8px
      linkDirectionalParticles={1}
      linkDirectionalParticleWidth={(link: any) => Math.max(1, (link.strengthScore / 100) * 3)}
      linkDirectionalParticleSpeed={(link: any) => (link.strengthScore / 100) * 0.01}
      cooldownTicks={100}
      onEngineStop={() => fgRef.current.zoomToFit(400, 100)} // Zoom to fit after engine stops
      dagMode={null} // Disable DAG mode for a more organic layout
      dagLevelDistance={100}
      d3AlphaDecay={0.0228} // Default value
      d3VelocityDecay={0.4} // Default value
      linkCurvature={0.1} // Slight curvature for aesthetics
      enableZoomInteraction={true}
      enablePanInteraction={true}
      enablePointerInteraction={true}
      minZoom={0.5}
      maxZoom={5}
    />
  );
};

export default RelationshipGraph;
