'use client';

import { useState, useEffect, useCallback } from 'react';
import { throttle } from '@/lib/utils/performanceUtils';
import { hoverStateService } from '@/lib/services/HoverStateService';

interface Problem {
  id: string;
  problemId: string;
  citizen: string;
  assetType: string;
  asset: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'pending';
  position: { lat: number; lng: number };
  location: string;
  title: string;
  description: string;
  solutions: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

interface ProblemMarkersProps {
  isVisible: boolean;
  scale: number;
  offset: { x: number; y: number };
  canvasWidth: number;
  canvasHeight: number;
  activeView: string;
}

export default function ProblemMarkers({
  isVisible,
  scale,
  offset,
  canvasWidth,
  canvasHeight,
  activeView
}: ProblemMarkersProps) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  // Get current username from localStorage
  useEffect(() => {
    try {
      const profileStr = localStorage.getItem('citizenProfile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        if (profile && profile.username) {
          setCurrentUsername(profile.username);
        }
      }
    } catch (error) {
      console.error('Error getting current username:', error);
    }
  }, []);

  // Function to fetch problems
  const fetchProblems = useCallback(async () => {
    if (!currentUsername) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/problems?citizen=${currentUsername}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.problems)) {
          // Parse position data if it's a string
          const parsedProblems = data.problems.map(problem => ({
            ...problem,
            position: typeof problem.position === 'string' 
              ? JSON.parse(problem.position) 
              : problem.position
          }));
          
          setProblems(parsedProblems);
          console.log(`Loaded ${parsedProblems.length} problems for ${currentUsername}`);
        }
      }
    } catch (error) {
      console.error('Error fetching problems:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUsername]);

  // Fetch problems initially and every 2 minutes
  useEffect(() => {
    if (!isVisible || !currentUsername) return;
    
    fetchProblems();
    
    // Set up interval for refreshing
    const intervalId = setInterval(fetchProblems, 120000); // 2 minutes
    
    return () => {
      clearInterval(intervalId);
    };
  }, [isVisible, currentUsername, fetchProblems]);

  // Helper function to convert lat/lng to screen coordinates
  const latLngToScreen = useCallback((lat: number, lng: number): { x: number; y: number } => {
    // Convert lat/lng to isometric coordinates
    const x = (lng - 12.3326) * 20000;
    const y = (lat - 45.4371) * 20000;
    
    // Apply scale and offset
    const screenX = x * scale + canvasWidth / 2 + offset.x;
    const screenY = (-y) * scale * 1.4 + canvasHeight / 2 + offset.y;
    
    return { x: screenX, y: screenY };
  }, [scale, offset, canvasWidth, canvasHeight]);

  // Handle problem marker click
  const handleProblemClick = useCallback((problem: Problem) => {
    // Dispatch event to show problem details panel
    window.dispatchEvent(new CustomEvent('showProblemDetailsPanel', {
      detail: { problemId: problem.problemId }
    }));
  }, []);

  // Handle problem marker hover
  const handleProblemHover = useCallback((problem: Problem) => {
    hoverStateService.setHoverState('problem', problem.problemId, problem);
  }, []);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    hoverStateService.clearHoverState();
  }, []);

  if (!isVisible || problems.length === 0) return null;

  // Get severity color
  const getSeverityColor = (severity: string): string => {
    switch (severity.toLowerCase()) {
      case 'critical': return '#FF0000'; // Red
      case 'high': return '#FF6600'; // Orange
      case 'medium': return '#FFCC00'; // Yellow
      case 'low': return '#66CC00'; // Green
      default: return '#FFCC00'; // Default yellow
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {problems.map(problem => {
        // Skip problems without position data
        if (!problem.position || !problem.position.lat || !problem.position.lng) return null;
        
        const { x, y } = latLngToScreen(problem.position.lat, problem.position.lng);
        
        // Skip if outside viewport
        if (x < -50 || x > canvasWidth + 50 || y < -50 || y > canvasHeight + 50) return null;
        
        return (
          <div
            key={problem.problemId}
            className="absolute pointer-events-auto cursor-pointer"
            style={{
              left: x,
              top: y,
              transform: 'translate(30%, -130%)' // Décalé encore plus vers le haut et la droite (4x l'offset initial)
            }}
            onClick={() => handleProblemClick(problem)}
            onMouseEnter={() => handleProblemHover(problem)}
            onMouseLeave={handleMouseLeave}
          >
            {/* Problem marker with pulsing effect */}
            <div className="relative">
              {/* Base marker */}
              <div 
                className="w-3 h-3 rounded-full flex items-center justify-center z-10 relative" // Taille réduite
                style={{ backgroundColor: getSeverityColor(problem.severity) }}
              >
                <span className="text-white text-[7px] font-bold">!</span> {/* Taille de texte réduite */}
              </div>
              
              {/* Pulsing effect removed */}
            </div>
          </div>
        );
      })}
    </div>
  );
}
