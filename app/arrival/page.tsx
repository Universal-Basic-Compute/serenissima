'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Importer des icônes si nécessaire, par exemple react-icons
// import { FaShip, FaPassport, FaHome, FaBed } from 'react-icons/fa';

type ArrivalStep = 'galley' | 'customs' | 'home' | 'inn';

const stepsConfig: Record<ArrivalStep, { title: string; slideshowImage: string; chatPlaceholder: string }> = {
  galley: {
    title: 'Arrival by Galley',
    slideshowImage: '/images/arrival/galley.jpg', // Remplacer par vos images réelles
    chatPlaceholder: 'The sea air is brisk. You see the Venetian skyline approaching...',
  },
  customs: {
    title: 'Venetian Customs',
    slideshowImage: '/images/arrival/customs.jpg',
    chatPlaceholder: 'A stern-faced official eyes your papers. "State your name and purpose!"',
  },
  home: {
    title: 'Finding Your Lodging',
    slideshowImage: '/images/arrival/home.jpg',
    chatPlaceholder: 'You\'ve been assigned modest quarters. It\'s a start.',
  },
  inn: {
    title: 'The Local Inn',
    slideshowImage: '/images/arrival/inn.jpg',
    chatPlaceholder: 'Perhaps a drink at the inn to gather your bearings and hear some local gossip?',
  },
};

const ArrivalPage: React.FC = () => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<ArrivalStep>('galley');
  const stepOrder: ArrivalStep[] = ['galley', 'customs', 'home', 'inn'];

  // TODO: Logique pour le diaporama (changement d'images, etc.)
  // TODO: Logique pour le chat (envoi de messages, réponses PNJ, etc.)

  const handleNextStep = () => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    } else {
      // Dernière étape - rediriger vers la page principale ou l'éditeur de profil
      // Pour l'instant, redirigeons vers la page principale.
      // L'éditeur de profil s'ouvrira si le profil est toujours incomplet.
      router.push('/'); 
    }
  };

  const handlePreviousStep = () => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };
  
  const currentConfig = stepsConfig[currentStep];

  return (
    <div className="fixed inset-0 bg-black flex text-white">
      {/* Section Diaporama (2/3 gauche) */}
      <div className="w-2/3 h-full relative bg-gray-800">
        <img 
          src={currentConfig.slideshowImage} 
          alt={currentConfig.title} 
          className="w-full h-full object-cover transition-opacity duration-1000 ease-in-out"
        />
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black via-black/70 to-transparent">
          <h1 className="text-4xl font-serif mb-4">{currentConfig.title}</h1>
          {/* Ajouter ici des descriptions ou des éléments de l'histoire pour le diaporama */}
        </div>
      </div>

      {/* Section Chat (1/3 droite) */}
      <div className="w-1/3 h-full bg-gray-900 flex flex-col p-6 border-l-2 border-amber-700">
        <h2 className="text-2xl font-serif mb-6 text-amber-400">Your Arrival in Venice</h2>
        
        {/* Zone d'affichage du chat */}
        <div className="flex-grow bg-gray-800 rounded-lg p-4 mb-4 overflow-y-auto">
          {/* Messages du chat ici */}
          <p className="text-gray-400 italic">{currentConfig.chatPlaceholder}</p>
          {/* Exemple de message PNJ */}
          {currentStep === 'customs' && (
            <div className="mt-4">
              <p><strong className="text-amber-500">Customs Officer:</strong> Welcome to La Serenissima. Your papers, please. What is your name, and what brings you to our glorious city?</p>
            </div>
          )}
        </div>
        
        {/* Zone de saisie du chat (simplifiée pour l'instant) */}
        <div className="mb-6">
          <input 
            type="text" 
            placeholder="Type your response..."
            className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:border-amber-500"
            // TODO: Gérer la saisie et l'envoi de messages
          />
        </div>

        {/* Boutons de Navigation */}
        <div className="flex justify-between">
          <button
            onClick={handlePreviousStep}
            disabled={stepOrder.indexOf(currentStep) === 0}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <button
            onClick={handleNextStep}
            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            {stepOrder.indexOf(currentStep) === stepOrder.length - 1 ? 'Finish Arrival' : 'Next'}
          </button>
        </div>
         <button
            onClick={() => router.push('/')}
            className="mt-4 w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Skip Arrival
          </button>
      </div>
    </div>
  );
};

export default ArrivalPage;
