'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Dynamically import components to avoid SSR issues
const KnowledgeRepository = dynamic(() => import('@/components/Knowledge/KnowledgeRepository'), { ssr: false });
const ProjectPresentation = dynamic(() => import('@/components/Knowledge/ProjectPresentation'), { ssr: false });
const ResourceDetails = dynamic(() => import('@/components/Knowledge/ResourceDetails'), { ssr: false });
// Import other components as needed

// Add custom window interface to handle our custom properties
declare global {
  interface Window {
    __isClientNavigation?: boolean;
    __directNavigation?: boolean;
    __knowledgeDirectNavigation?: boolean;
  }
}

export default function KnowledgePage() {
  const router = useRouter();
  const [view, setView] = useState<'repository' | 'presentation' | 'techTree' | 'resourceTree' | 'article'>('repository');
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  
  // Handle redirect for direct navigation
  useEffect(() => {
    // If this is a direct page load (not client navigation)
    if (typeof window !== 'undefined' && window.location.pathname === '/knowledge' && !window.__isClientNavigation) {
      // Set a flag to indicate this was a direct navigation
      window.__directNavigation = true;
      // Set a specific flag for knowledge page
      window.__knowledgeDirectNavigation = true;
      // Remove the shallow option as it's not supported in Next.js App Router
      router.push('/');
    }
  }, [router]);
  
  // If we're redirecting, don't render anything
  if (typeof window !== 'undefined' && window.location.pathname === '/knowledge' && !window.__isClientNavigation) {
    return <div></div>;
  }
  
  const handleShowPresentation = () => {
    console.log("Showing presentation view");
    setView('presentation');
  };

  const handleShowTechTree = () => {
    setView('techTree');
    // This would be implemented to show the tech tree
    console.log('Show tech tree');
  };

  const handleShowResourceTree = () => {
    setView('resourceTree');
    // This would be implemented to show the resource tree
    console.log('Show resource tree');
  };

  const handleSelectArticle = (article: string) => {
    setSelectedArticle(article);
    setView('article');
    // This would be implemented to show the selected article
    console.log('Selected article:', article);
  };

  const handleClose = () => {
    router.push('/');
  };

  return (
    <div className="knowledge-page">
      {view === 'presentation' && (
        <ProjectPresentation onClose={() => setView('repository')} />
      )}
      
      {view === 'repository' && (
        <KnowledgeRepository
          onShowTechTree={handleShowTechTree}
          onShowPresentation={handleShowPresentation}
          onShowResourceTree={handleShowResourceTree}
          onSelectArticle={handleSelectArticle}
          onClose={handleClose}
          standalone={true}
        />
      )}

      {view === 'techTree' && (
        <div className="p-8 bg-amber-50 rounded-lg">
          <h2 className="text-2xl font-serif text-amber-800 mb-4">Tech Tree</h2>
          <p className="text-gray-600">Tech Tree content would go here.</p>
          <button
            onClick={() => setView('repository')}
            className="mt-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            Back to Repository
          </button>
        </div>
      )}

      {view === 'resourceTree' && (
        <div className="p-8 bg-amber-50 rounded-lg">
          <h2 className="text-2xl font-serif text-amber-800 mb-4">Resource Tree</h2>
          <p className="text-gray-600">Resource Tree content would go here.</p>
          <button
            onClick={() => setView('repository')}
            className="mt-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            Back to Repository
          </button>
        </div>
      )}

      {view === 'article' && selectedArticle && (
        <div className="p-8 bg-amber-50 rounded-lg">
          <h2 className="text-2xl font-serif text-amber-800 mb-4">{selectedArticle}</h2>
          <p className="text-gray-600">Article content would go here.</p>
          <button
            onClick={() => setView('repository')}
            className="mt-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            Back to Repository
          </button>
        </div>
      )}
    </div>
  );
}
