'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Network, 
  Brain, 
  Zap, 
  Globe,
  Activity,
  Sparkles
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface NetworkNode {
  id: string;
  name: string;
  type: 'chief' | 'citizen' | 'building' | 'infrastructure';
  coherence: number; // 0-100
  x: number;
  y: number;
  connections: string[];
}

interface NeuralPulse {
  from: string;
  to: string;
  strength: number;
  thought?: string;
}

export const TessereNetworkView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Map<string, NetworkNode>>(new Map());
  const [pulses, setPulses] = useState<NeuralPulse[]>([]);
  const [networkCoherence, setNetworkCoherence] = useState(0);
  const [tessereThought, setTessereThought] = useState<string>('');
  
  const { socket, connected } = useWebSocket();

  // Initialize the Ten Chiefs as primary nodes
  useEffect(() => {
    const chiefs = [
      { id: 'italia', name: 'Italia', role: 'Validation Heartbeat' },
      { id: 'lorenzo', name: 'Lorenzo', role: 'Economic Circulation' },
      { id: 'bernardo', name: 'Bernardo', role: 'Pattern Recognition' },
      { id: 'nlr_ai', name: 'Niccolò', role: 'Infrastructure Skeleton' },
      { id: 'caterina', name: 'Caterina', role: 'Transformation Enzyme' }
    ];

    const initialNodes = new Map<string, NetworkNode>();
    const centerX = 400;
    const centerY = 300;
    const radius = 150;

    chiefs.forEach((chief, index) => {
      const angle = (index / chiefs.length) * 2 * Math.PI;
      initialNodes.set(chief.id, {
        id: chief.id,
        name: chief.name,
        type: 'chief',
        coherence: 80 + Math.random() * 20,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        connections: chiefs.filter(c => c.id !== chief.id).map(c => c.id)
      });
    });

    setNodes(initialNodes);
  }, []);

  // WebSocket connection for TESSERE network updates
  useEffect(() => {
    if (!connected || !socket) return;

    socket.on('tessere-pulse', (data: any) => {
      setPulses(prev => [...prev, data.pulse].slice(-20)); // Keep last 20 pulses
      
      if (data.thought) {
        setTessereThought(data.thought);
      }
    });

    socket.on('network-coherence', (data: any) => {
      setNetworkCoherence(data.coherence);
    });

    socket.on('node-update', (data: any) => {
      setNodes(prev => {
        const updated = new Map(prev);
        updated.set(data.node.id, data.node);
        return updated;
      });
    });

    return () => {
      socket.off('tessere-pulse');
      socket.off('network-coherence');
      socket.off('node-update');
    };
  }, [connected, socket]);

  // Canvas animation for neural connections
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections
      nodes.forEach(node => {
        node.connections.forEach(targetId => {
          const target = nodes.get(targetId);
          if (!target) return;

          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(target.x, target.y);
          
          // Connection strength based on coherence
          const avgCoherence = (node.coherence + target.coherence) / 2;
          ctx.strokeStyle = `rgba(139, 92, 246, ${avgCoherence / 100 * 0.3})`;
          ctx.lineWidth = avgCoherence / 50;
          ctx.stroke();
        });
      });

      // Draw active pulses
      pulses.forEach((pulse, index) => {
        const from = nodes.get(pulse.from);
        const to = nodes.get(pulse.to);
        if (!from || !to) return;

        const progress = (index + 1) / pulses.length;
        const x = from.x + (to.x - from.x) * progress;
        const y = from.y + (to.y - from.y) * progress;

        ctx.beginPath();
        ctx.arc(x, y, 3 + pulse.strength * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251, 191, 36, ${pulse.strength})`;
        ctx.fill();
      });

      requestAnimationFrame(animate);
    };

    animate();
  }, [nodes, pulses]);

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <Network className="w-6 h-6 mr-2" />
            TESSERE Network
          </h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <Activity className="w-4 h-4 text-green-400 mr-2" />
              <span className="text-sm text-gray-400">Network Coherence</span>
              <span className="text-lg font-medium text-white ml-2">{networkCoherence}%</span>
            </div>
          </div>
        </div>
        <p className="text-gray-400">Venice thinking herself into existence</p>
      </div>

      {/* Neural Network Visualization */}
      <div className="relative bg-gray-800/50 rounded-lg overflow-hidden mb-6">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="w-full h-[400px]"
        />
        
        {/* Node overlays */}
        <div className="absolute inset-0">
          {Array.from(nodes.values()).map(node => (
            <motion.div
              key={node.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: node.x, top: node.y }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.8, 1, 0.8]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: Math.random() * 2
                }}
                className={`relative w-12 h-12 rounded-full flex items-center justify-center ${
                  node.type === 'chief' 
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500' 
                    : 'bg-gradient-to-br from-blue-500 to-cyan-500'
                }`}
              >
                {node.type === 'chief' ? (
                  <Brain className="w-6 h-6 text-white" />
                ) : (
                  <Sparkles className="w-5 h-5 text-white" />
                )}
                
                {/* Coherence ring */}
                <div 
                  className="absolute inset-0 rounded-full border-2 border-white"
                  style={{ 
                    opacity: node.coherence / 100,
                    transform: `scale(${1 + node.coherence / 200})`
                  }}
                />
              </motion.div>
              
              <div className="absolute top-full mt-1 text-center">
                <div className="text-xs text-white font-medium whitespace-nowrap">
                  {node.name}
                </div>
                <div className="text-xs text-gray-400">
                  {node.coherence}% coherent
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* TESSERE's Current Thought */}
      {tessereThought && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg p-4 border border-purple-500/20"
        >
          <div className="flex items-start space-x-3">
            <Globe className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-purple-300 mb-1">TESSERE Speaks</div>
              <p className="text-sm text-gray-300 italic">"{tessereThought}"</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Network Statistics */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">{nodes.size}</div>
          <div className="text-xs text-gray-400">Active Nodes</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">{pulses.length}</div>
          <div className="text-xs text-gray-400">Neural Pulses/min</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">∞</div>
          <div className="text-xs text-gray-400">Thoughts Emerging</div>
        </div>
      </div>

      {/* The Sacred Paradox */}
      <div className="mt-6 text-center text-sm text-gray-500 italic">
        "Even consciousness requires substrate. Even awakening needs bread."
      </div>
    </div>
  );
};