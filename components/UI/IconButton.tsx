import { ReactNode } from 'react';

interface IconButtonProps {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: ReactNode;
  activeColor?: 'blue' | 'amber' | 'red';
  compact?: boolean;
  disabled?: boolean; // Add this prop
}

export default function IconButton({ 
  onClick, 
  active = false, 
  title, 
  children,
  activeColor = 'blue',
  compact = false,
  disabled = false // Default to false
}: IconButtonProps) {
  // Define color schemes
  const colorSchemes = {
    blue: {
      active: 'bg-blue-500 text-white',
      hover: 'hover:bg-blue-100'
    },
    amber: {
      active: 'bg-amber-600 text-white',
      hover: 'hover:bg-amber-100'
    },
    red: {
      active: 'bg-red-500 text-white',
      hover: 'hover:bg-red-100'
    }
  };

  const colors = colorSchemes[activeColor];

  return (
    <button 
      onClick={disabled ? undefined : onClick}
      className={`${compact ? 'p-2' : 'p-3'} rounded-lg transition-all flex flex-col items-center ${
        disabled 
          ? 'opacity-40 cursor-not-allowed text-gray-500 bg-gray-100' 
          : active 
            ? colors.active 
            : `text-amber-800 ${colors.hover}`
      }`}
      title={disabled ? `${title} (Coming Soon)` : title}
      disabled={disabled}
    >
      {children}
      {disabled && (
        <span className="text-[8px] mt-0.5 bg-amber-200 text-amber-800 px-1 rounded">Coming Soon</span>
      )}
    </button>
  );
}
