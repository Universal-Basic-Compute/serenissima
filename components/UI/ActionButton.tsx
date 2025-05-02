import { ReactNode } from 'react';

interface ActionButtonProps {
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
  disabled?: boolean;
  className?: string; // Add this line
}

export default function ActionButton({ 
  onClick, 
  variant = 'secondary', 
  children,
  disabled = false,
  className = '' // Add default value
}: ActionButtonProps) {
  const getButtonClasses = () => {
    const baseClasses = 'px-4 py-2 rounded shadow transition-colors';
    
    if (disabled) {
      return `${baseClasses} bg-gray-300 text-gray-500 cursor-not-allowed ${className}`;
    }
    
    switch (variant) {
      case 'primary':
        return `${baseClasses} bg-blue-500 text-white hover:bg-blue-600 ${className}`;
      case 'danger':
        return `${baseClasses} bg-red-500 text-white hover:bg-red-600 ${className}`;
      default:
        return `${baseClasses} bg-white hover:bg-gray-100 ${className}`;
    }
  };
  
  return (
    <button 
      onClick={onClick}
      className={getButtonClasses()}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
