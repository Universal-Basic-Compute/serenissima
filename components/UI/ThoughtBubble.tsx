import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ThoughtBubbleProps {
  mainThought: string;
  originalContent: string;
  citizenPosition: { x: number; y: number }; // Screen coordinates
  socialClass: string; // Added social class for styling
  isVisible: boolean;
  onDurationEnd: () => void; // Callback when the display duration is over
  displayDuration: number; // Duration to display the thought bubble in ms
  onBubbleMouseEnter: () => void; // Callback for mouse enter
  onBubbleMouseLeave: () => void; // Callback for mouse leave
  isHovered: boolean; // Indicates if the bubble is currently hovered
}

import { citizenService } from '@/lib/services/CitizenService'; // Import citizenService

const ThoughtBubble: React.FC<ThoughtBubbleProps> = ({
  mainThought,
  originalContent,
  citizenPosition,
  socialClass, // Destructure socialClass
  isVisible,
  onDurationEnd,
  displayDuration,
  onBubbleMouseEnter,
  onBubbleMouseLeave,
  isHovered,
}) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [internalVisible, setInternalVisible] = useState(false);

  const FADE_IN_MS = 700; // Durée d'apparition plus rapide
  const FADE_OUT_MS = 1400; // Durée de disparition originale

  useEffect(() => {
    let durationEndTimer: NodeJS.Timeout | null = null;
    let fadeOutProcessTimer: NodeJS.Timeout | null = null;

    if (isVisible) {
      setInternalVisible(true); // Démarrer le fondu d'apparition

      if (!isHovered) { // Seulement démarrer les minuteurs si non survolé
        durationEndTimer = setTimeout(() => {
          // Ce minuteur signifie la fin de la durée d'affichage prévue
          if (!isHovered) { // Revérifier l'état de survol avant de commencer la disparition
            setInternalVisible(false); // Commencer la disparition
            fadeOutProcessTimer = setTimeout(onDurationEnd, FADE_OUT_MS);
          }
        }, displayDuration);
      }
    } else {
      setInternalVisible(false); // S'assurer qu'elle est cachée si isVisible devient false
    }

    return () => { // Nettoyage
      if (durationEndTimer) clearTimeout(durationEndTimer);
      if (fadeOutProcessTimer) clearTimeout(fadeOutProcessTimer);
    };
  }, [isVisible, displayDuration, onDurationEnd, isHovered, FADE_OUT_MS]);


  if (!citizenPosition) {
    return null;
  }

  // Initialize color variables with defaults
  let finalTextColor = 'rgb(50, 50, 50)'; // Default dark gray text
  let finalBackgroundColor = 'rgba(240, 240, 240, 0.97)'; // Default very light gray background, high alpha
  let finalBorderColor = 'rgb(200, 200, 200)'; // Default medium gray border

  // Check for Artisti social class first
  if (socialClass && socialClass.toLowerCase() === 'artisti') {
    finalTextColor = 'rgb(199, 21, 133)'; // MediumVioletRed for text
    finalBackgroundColor = 'rgba(255, 228, 235, 0.97)'; // Very light pink for background
    finalBorderColor = 'rgb(255, 182, 193)'; // LightPink for border
  } else {
    // Existing logic for other social classes
    const baseColorString = citizenService.getSocialClassColor(socialClass);
    const rgbaMatch = baseColorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
      const r_str = rgbaMatch[1];
      const g_str = rgbaMatch[2];
      const b_str = rgbaMatch[3];
      const originalAlpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;

      const r_int = parseInt(r_str, 10);
      const g_int = parseInt(g_str, 10);
      const b_int = parseInt(b_str, 10);

      // Make the background color a lighter shade of the social class color
      const lightenFactor = 0.85; // 0 = original color, 1 = white. Increased from 0.75
      const lighterR = Math.round(r_int + (255 - r_int) * lightenFactor);
      const lighterG = Math.round(g_int + (255 - g_int) * lightenFactor);
      const lighterB = Math.round(b_int + (255 - b_int) * lightenFactor);

      // Darken the text color for better contrast on a light background
      const darkenFactor = 0.5; // 0 = original color, 1 = black
      const darkerR = Math.round(r_int * (1 - darkenFactor));
      const darkerG = Math.round(g_int * (1 - darkenFactor));
      const darkerB = Math.round(b_int * (1 - darkenFactor));

      finalTextColor = `rgb(${darkerR}, ${darkerG}, ${darkerB})`;
      finalBackgroundColor = `rgba(${lighterR}, ${lighterG}, ${lighterB}, 0.97)`;
      finalBorderColor = `rgba(${r_str}, ${g_str}, ${b_str}, ${originalAlpha})`;
    }
    // If rgbaMatch is false, the default gray colors (set above) will be used.
  }
  
  // Define tail properties
  const tailCircles = [
    { size: 12, offset: 0 }, // Largest, closest to bubble
    { size: 9, offset: 12 + 2 },  // Medium, below largest + spacing
    { size: 6, offset: 12 + 2 + 9 + 2 }, // Smallest, below medium + spacing
  ];
  const totalTailHeight = tailCircles.reduce((sum, circle, index) => {
    return sum + circle.size + (index < tailCircles.length - 1 ? 2 : 0); // size + spacing
  }, 0) - tailCircles[tailCircles.length-1].size / 2; // Effective height to the center of the smallest circle

  const bubbleStyle: React.CSSProperties = {
    left: `${citizenPosition.x}px`,
    top: `${citizenPosition.y}px`,
    backgroundColor: finalBackgroundColor, // Use new background color
    borderColor: finalBorderColor, // Use new border color
    color: finalTextColor, // Use new text color
    transform: `translate(-50%, -100%) translateY(-${totalTailHeight}px)`, // Position bubble so tip of tail is at citizenPosition.y
    opacity: internalVisible ? 0.97 : 0, // Overall bubble opacity
    transition: `opacity ${internalVisible ? FADE_IN_MS : FADE_OUT_MS}ms ease-in-out, transform ${internalVisible ? FADE_IN_MS : FADE_OUT_MS}ms ease-in-out`, // Transition conditionnelle
    pointerEvents: internalVisible ? 'auto' : 'none',
  };

  return (
    <div
      className={`absolute z-[25] p-4 border-2 rounded-3xl shadow-xl text-sm ${showOriginal ? 'max-w-xl' : 'max-w-xs'} transition-all duration-700 ease-in-out`} // Changed z-[45] to z-[25]
      style={bubbleStyle}
      onMouseEnter={() => { setShowOriginal(true); onBubbleMouseEnter(); }}
      onMouseLeave={() => { setShowOriginal(false); onBubbleMouseLeave(); }}
      data-ui-panel="true"
    >
      <div className="relative prose prose-sm"> {/* Apply prose classes to the wrapper */}
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {showOriginal ? originalContent : mainThought}
        </ReactMarkdown>
      </div>
      {/* Thought bubble tail circles */}
      {tailCircles.map((circle, index) => (
        <div
          key={`tail-circle-${index}`}
          className="absolute left-1/2 border-2 rounded-full" // Removed bg-amber-50 and border-amber-200
          style={{
            width: `${circle.size}px`,
            height: `${circle.size}px`,
            backgroundColor: finalBackgroundColor, // Dynamic background for tail
            borderColor: finalBorderColor, // Dynamic border for tail
            // Position circles downwards from the bottom of the main bubble content area
            // The main bubble's 'p-4' means its content area ends, and then the border.
            // 'top: 100%' refers to the bottom of the padded content area of the parent.
            top: `calc(100% + ${circle.offset}px)`, 
            transform: 'translateX(-50%)',
            zIndex: -1, // Ensure circles are behind the main bubble's border if overlapping
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        ></div>
      ))}
      {showOriginal}
    </div>
  );
};

export default ThoughtBubble;
