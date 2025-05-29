'use client';

import { useEffect } from "react";

export default function ContextMenuPreventer() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    
    // Add the event listener to the document
    document.addEventListener('contextmenu', handleContextMenu);
    
    // Clean up the event listener when the component unmounts
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);
  
  return null;
}
