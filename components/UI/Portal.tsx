"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
}

export default function Portal({ children }: PortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Create a portal container if it doesn't exist
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const portalContainer = document.getElementById('portal-root');
      if (!portalContainer) {
        const div = document.createElement('div');
        div.id = 'portal-root';
        document.body.appendChild(div);
      }
    }
  }, []);

  return mounted && typeof document !== 'undefined'
    ? createPortal(
        children,
        document.getElementById('portal-root') || document.body
      )
    : null;
}
