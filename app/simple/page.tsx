'use client';

import dynamic from 'next/dynamic';

// Import SimpleViewer with no SSR to avoid hydration issues
const SimpleViewer = dynamic(() => import('../../components/PolygonViewer/SimpleViewer'), {
  ssr: false
});

export default function SimplePage() {
  return <SimpleViewer />;
}
