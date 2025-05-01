import { ReactNode } from 'react';

interface ActionButtonProps {
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  children: ReactNode;
}

export default function ActionButton({ onClick, variant = 'secondary', children }: ActionButtonProps) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded shadow ${
        variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-white'
      }`}
    >
      {children}
    </button>
  );
}
