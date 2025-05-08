'use client';

import { useRouter } from 'next/navigation';
import KnowledgeRepository from '@/components/Knowledge/KnowledgeRepository';
import { useState } from 'react';
import TechTree from '@/components/Knowledge/TechTree';
import ProjectPresentation from '@/components/Knowledge/ProjectPresentation';
import ResourceTree from '@/components/Knowledge/ResourceTree';
import { StrategiesArticle, BeginnersGuideArticle, EconomicSystemArticle, LandOwnerGuideArticle, DecreesGovernanceArticle, BuildingOwnersGuideArticle } from '@/components/Articles';

export default function KnowledgePage() {
  const router = useRouter();
  const [showTechTree, setShowTechTree] = useState<boolean>(false);
  const [showPresentation, setShowPresentation] = useState<boolean>(false);
  const [showResourceTree, setShowResourceTree] = useState<boolean>(false);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  
  return (
    <>
      <KnowledgeRepository
        onShowTechTree={() => setShowTechTree(true)}
        onShowPresentation={() => setShowPresentation(true)}
        onShowResourceTree={() => setShowResourceTree(true)}
        onSelectArticle={setSelectedArticle}
        onClose={() => router.push('/')}
        standalone={true}
      />
      
      {/* Tech Tree Modal */}
      {showTechTree && (
        <TechTree onClose={() => setShowTechTree(false)} />
      )}
      
      {/* Project Presentation Modal */}
      {showPresentation && (
        <ProjectPresentation onClose={() => setShowPresentation(false)} />
      )}
      
      {/* Resource Tree Modal */}
      {showResourceTree && (
        <ResourceTree onClose={() => setShowResourceTree(false)} />
      )}
      
      {/* Article Modals */}
      {selectedArticle === "strategies" && (
        <StrategiesArticle onClose={() => setSelectedArticle(null)} />
      )}
      {selectedArticle === "beginners-guide" && (
        <BeginnersGuideArticle onClose={() => setSelectedArticle(null)} />
      )}
      {selectedArticle === "economic-system" && (
        <EconomicSystemArticle onClose={() => setSelectedArticle(null)} />
      )}
      {selectedArticle === "landowner-guide" && (
        <LandOwnerGuideArticle onClose={() => setSelectedArticle(null)} />
      )}
      {selectedArticle === "decrees-governance" && (
        <DecreesGovernanceArticle onClose={() => setSelectedArticle(null)} />
      )}
      {selectedArticle === "building-owners-guide" && (
        <BuildingOwnersGuideArticle onClose={() => setSelectedArticle(null)} />
      )}
    </>
  );
}
