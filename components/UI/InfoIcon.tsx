import React, { useState } from 'react';

interface InfoIconProps {
  tooltipText: string;
  className?: string;
}

const InfoIcon: React.FC<InfoIconProps> = ({ tooltipText, className }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={`relative inline-block ml-2 ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 text-amber-600 hover:text-amber-800 cursor-help transform -translate-y-1"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-black/60 text-white text-sm rounded-lg p-2 shadow-lg z-[60] pointer-events-none" /* Adjusted y-translate, opacity, and text size */
        >
          {tooltipText}
        </div>
      )}
    </div>
  );
};

export default InfoIcon;
