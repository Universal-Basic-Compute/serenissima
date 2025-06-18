'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { FaTimes } from 'react-icons/fa';
import ProjectPresentationArticle from '@/components/Articles/ProjectPresentationArticle';

// Dynamically import components to avoid SSR issues
const KnowledgeRepository = dynamic(() => import('@/components/Knowledge/KnowledgeRepository'), { 
  ssr: false,
  loading: () => <div className="p-8 text-amber-300">Loading Knowledge Repository...</div>
});
const ResourceDetails = dynamic(() => import('@/components/Knowledge/ResourceDetails'), { 
  ssr: false,
  loading: () => <div className="p-8 text-amber-300">Loading Resource Details...</div>
});

// Dynamically import other articles
// ProjectPresentationArticle is now directly imported at the top
const BeginnersGuideArticle = dynamic(() => import('@/components/Articles/BeginnersGuideArticle'), {
  ssr: false,
  loading: () => <div className="p-8 text-amber-300">Loading Article...</div>
});
const EconomicSystemArticle = dynamic(() => import('@/components/Articles/EconomicSystemArticle'), {
  ssr: false,
  loading: () => <div className="p-8 text-amber-300">Loading Article...</div>
});
// Import other article components as needed

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
  const [view, setView] = useState<'repository' | 'techTree' | 'resourceTree' | 'article' | 'loading'>('repository');
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
  
  // This function is no longer needed as we'll use handleSelectArticle instead

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
    console.log('Selecting article:', article);
    setSelectedArticle(article);
    setView('article');
    console.log('View set to:', 'article');
    console.log('Selected article state:', article);
  };

  const handleClose = () => {
    router.push('/');
  };

  return (
    <div className="knowledge-page">
      {/* Debug view state */}
      <div className="hidden">{`Current view: ${view}`}</div>
      
      {view === 'repository' ? (
        <KnowledgeRepository
          onShowTechTree={handleShowTechTree}
          onShowPresentation={() => handleSelectArticle("project-presentation")}
          onShowResourceTree={handleShowResourceTree}
          onSelectArticle={handleSelectArticle}
          onClose={handleClose}
          standalone={true}
        />
      ) : view === 'techTree' ? (
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
      ) : view === 'resourceTree' ? (
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
      ) : view === 'article' && selectedArticle ? (
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-75 p-4">
          {console.log('Rendering article view for:', selectedArticle)}
          {selectedArticle === "project-presentation" && (
            <div className="w-full h-full">
              {console.log('Rendering ProjectPresentationArticle')}
              <ProjectPresentationArticle onClose={() => setView('repository')} />
            </div>
          )}
          {selectedArticle === "beginners-guide" && (
            <BeginnersGuideArticle onClose={() => setView('repository')} />
          )}
          {selectedArticle === "economic-system" && (
            <EconomicSystemArticle onClose={() => setView('repository')} />
          )}
          {/* Add other article components as needed */}
          {!["project-presentation", "beginners-guide", "economic-system"].includes(selectedArticle) && (
            <div className="p-8 bg-amber-50 rounded-lg max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-serif text-amber-800">{selectedArticle}</h2>
                <button
                  onClick={() => setView('repository')}
                  className="text-amber-600 hover:text-amber-800 p-2"
                >
                  <FaTimes size={24} />
                </button>
              </div>
              <p className="text-gray-600">This article is coming soon.</p>
              <button
                onClick={() => setView('repository')}
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
              >
                Back to Repository
              </button>
            </div>
          )}
        </div>
      ) : view === 'loading' ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-amber-600 text-xl">Loading presentation...</div>
        </div>
      ) : (
        // Fallback if no view matches
        <div className="p-8 bg-amber-50 rounded-lg">
          <h2 className="text-2xl font-serif text-amber-800 mb-4">View Not Found</h2>
          <p className="text-gray-600">The requested view "{view}" could not be displayed.</p>
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
