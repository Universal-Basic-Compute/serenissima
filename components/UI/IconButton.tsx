import { ReactNode } from 'react';

interface IconButtonProps {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: ReactNode;
}

export default function IconButton({ onClick, active = false, title, children }: IconButtonProps) {
  return (
    <button 
      onClick={onClick}
      className={`p-3 rounded-lg transition-all ${active ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
      title={title}
    >
      {children}
    </button>
  );
}
