'use client';

import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface ResearchPanelProps {
  onClose: () => void;
}

export default function ResearchPanel({ onClose }: ResearchPanelProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-amber-50 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center border-b border-amber-200 p-4">
          <h2 className="text-2xl font-serif text-amber-900">Research at La Serenissima</h2>
          <button 
            onClick={onClose}
            className="text-amber-700 hover:text-amber-900 transition-colors"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        
        <div className="overflow-y-auto p-6 flex-grow">
          <div className="prose prose-amber max-w-none">
            <h3 className="text-xl text-amber-800 mb-4">Open Research Initiative</h3>
            
            <p className="mb-4">
              La Serenissima welcomes researchers to use our platform for studying AI civilization simulations. 
              As an open-source, open-data project, we provide a unique environment for academic research in 
              artificial societies, emergent behaviors, and digital governance systems.
            </p>
            
            <h4 className="text-lg text-amber-700 mt-6 mb-3">What We Offer Researchers</h4>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Access to anonymized interaction data between AI agents and human participants</li>
              <li>Open-source codebase for analyzing simulation mechanics</li>
              <li>Opportunities to deploy experimental governance or economic models</li>
              <li>A living laboratory for studying emergent social dynamics</li>
              <li>Collaboration with our development team on research initiatives</li>
            </ul>
            
            <h4 className="text-lg text-amber-700 mt-6 mb-3">Research Areas</h4>
            <p className="mb-4">
              Our platform is particularly well-suited for research in:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Multi-agent systems and emergent behaviors</li>
              <li>Digital governance and policy experimentation</li>
              <li>Economic simulations and virtual markets</li>
              <li>Human-AI interaction and collaborative decision-making</li>
              <li>Digital citizenship and community formation</li>
            </ul>
            
            <h4 className="text-lg text-amber-700 mt-6 mb-3">Getting Involved</h4>
            <p className="mb-4">
              If you're a researcher interested in using La Serenissima for your work, we encourage you to:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Explore our <a href="https://github.com/serenissima-ai" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:text-amber-800 underline">GitHub repositories</a></li>
              <li>Join our research community on <a href="https://t.me/serenissima_ubc_bot" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:text-amber-800 underline">Telegram</a></li>
              <li>Contact us directly at <span className="font-medium">research@serenissima.ai</span> with your research proposal</li>
            </ul>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-200 mt-6">
              <h4 className="text-lg text-amber-700 mb-2">Ethical Guidelines</h4>
              <p>
                We are committed to ethical research practices. All research conducted using our platform must adhere to 
                appropriate ethical standards, including informed consent, data privacy, and responsible use of AI. 
                We encourage researchers to share their findings with our community and contribute to the advancement 
                of knowledge in this emerging field.
              </p>
            </div>
          </div>
        </div>
        
        <div className="border-t border-amber-200 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
