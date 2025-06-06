'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
// Importer des icônes si nécessaire, par exemple react-icons
// import { FaShip, FaPassport, FaHome, FaBed } from 'react-icons/fa';

type ArrivalStep = 'galley' | 'customs' | 'home' | 'inn';

interface AIProfile {
  username: string;
  firstName?: string;
  lastName?: string;
  socialClass?: string;
  // Ajoutez d'autres champs si nécessaire
}

const stepsConfig: Record<ArrivalStep, { title: string; slideshowImage: string; chatPlaceholder: string }> = {
  galley: {
    title: 'Arrival by Galley',
    slideshowImage: '/images/arrival/galley.png',
    chatPlaceholder: 'The sea air is brisk. You see the Venetian skyline approaching...',
  },
  customs: {
    title: 'Venetian Customs',
    slideshowImage: '/images/arrival/customs.png',
    chatPlaceholder: 'A stern-faced official eyes your papers. "State your name and purpose!"',
  },
  home: {
    title: 'Finding Your Lodging',
    slideshowImage: '/images/arrival/home.png',
    chatPlaceholder: 'You\'ve been assigned modest quarters. It\'s a start.',
  },
  inn: {
    title: 'The Local Inn',
    slideshowImage: '/images/arrival/inn.png',
    chatPlaceholder: 'Perhaps a drink at the inn to gather your bearings and hear some local gossip?',
  },
};

const ArrivalPage: React.FC = () => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<ArrivalStep>('galley');
  const [showIntroToast, setShowIntroToast] = useState<boolean>(true); // State for the intro toast
  const stepOrder: ArrivalStep[] = ['galley', 'customs', 'home', 'inn'];

  const [galleyAI, setGalleyAI] = useState<AIProfile | null>(null);
  const [customsAI, setCustomsAI] = useState<AIProfile | null>(null);
  const [homeAI, setHomeAI] = useState<AIProfile | null>(null);
  const [innAI, setInnAI] = useState<AIProfile | null>(null);
  const [aisLoading, setAisLoading] = useState<boolean>(true);

  const getCurrentAI = useCallback((): AIProfile | null => {
    switch (currentStep) {
      case 'galley':
        return galleyAI;
      case 'customs':
        return customsAI;
      case 'home':
        return homeAI;
      case 'inn':
        return innAI;
      default:
        return null;
    }
  }, [currentStep, galleyAI, customsAI, homeAI, innAI]);

  const fetchCitizen = useCallback(async (username: string): Promise<AIProfile | null> => {
    try {
      const response = await fetch(`/api/citizens/${username}`);
      if (!response.ok) {
        console.error(`Failed to fetch citizen ${username}: ${response.status}`);
        return null;
      }
      const data = await response.json();
      return data.success ? data.citizen : null;
    } catch (error) {
      console.error(`Error fetching citizen ${username}:`, error);
      return null;
    }
  }, []);

  useEffect(() => {
    const defaultAIUsername = "BookishMerchant";
    
    const fetchAllAIs = async () => {
      setAisLoading(true);
      const defaultProfile = await fetchCitizen(defaultAIUsername);

      // Fetch Galley AI (Random Forestieri, AI, InVenice)
      try {
        const res = await fetch(`/api/citizens?SocialClass=Forestieri&IsAI=true&InVenice=true`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.citizens.length > 0) {
            const randomForestieri = data.citizens[Math.floor(Math.random() * data.citizens.length)];
            setGalleyAI(randomForestieri);
          } else {
            console.warn("No Forestieri found for Galley AI, using default.");
            setGalleyAI(defaultProfile);
          }
        } else {
          console.error("Failed to fetch Forestieri for Galley AI, using default.");
          setGalleyAI(defaultProfile);
        }
      } catch (e) { 
        console.error("Error fetching Galley AI:", e);
        setGalleyAI(defaultProfile); 
      }

      // Fetch Customs AI (Occupant of customs_house)
      try {
        const buildingRes = await fetch(`/api/buildings?Type=customs_house`);
        if (buildingRes.ok) {
          const buildingData = await buildingRes.json();
          if (buildingData.success && buildingData.buildings.length > 0 && buildingData.buildings[0].occupant) {
            const occupantUsername = buildingData.buildings[0].occupant; // occupant is camelCase from API
            const officerProfile = await fetchCitizen(occupantUsername);
            setCustomsAI(officerProfile || defaultProfile);
          } else {
            console.warn("No customs_house occupant found, using default Customs AI.");
            setCustomsAI(defaultProfile);
          }
        } else {
          console.error("Failed to fetch customs_house building, using default Customs AI.");
          setCustomsAI(defaultProfile);
        }
      } catch (e) { 
        console.error("Error fetching Customs AI:", e);
        setCustomsAI(defaultProfile); 
      }

      // Fetch Home AI (Random Cittadini, AI, InVenice)
      try {
        const res = await fetch(`/api/citizens?SocialClass=Cittadini&IsAI=true&InVenice=true`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.citizens.length > 0) {
            const randomCittadini = data.citizens[Math.floor(Math.random() * data.citizens.length)];
            setHomeAI(randomCittadini);
          } else {
            console.warn("No Cittadini found for Home AI, using default.");
            setHomeAI(defaultProfile);
          }
        } else {
          console.error("Failed to fetch Cittadini for Home AI, using default.");
          setHomeAI(defaultProfile);
        }
      } catch (e) { 
        console.error("Error fetching Home AI:", e);
        setHomeAI(defaultProfile); 
      }

      // Fetch Inn AI (Occupant of inn)
      try {
        const buildingRes = await fetch(`/api/buildings?Type=inn`);
        if (buildingRes.ok) {
          const buildingData = await buildingRes.json();
          if (buildingData.success && buildingData.buildings.length > 0 && buildingData.buildings[0].occupant) {
            const occupantUsername = buildingData.buildings[0].occupant; // occupant is camelCase
            const innkeeperProfile = await fetchCitizen(occupantUsername);
            setInnAI(innkeeperProfile || defaultProfile);
          } else {
            console.warn("No inn occupant found, using default Inn AI.");
            setInnAI(defaultProfile);
          }
        } else {
          console.error("Failed to fetch inn building, using default Inn AI.");
          setInnAI(defaultProfile);
        }
      } catch (e) { 
        console.error("Error fetching Inn AI:", e);
        setInnAI(defaultProfile); 
      }

      setAisLoading(false);
    };

    fetchAllAIs();
  }, [fetchCitizen]);

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

  if (showIntroToast) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
        <div className="bg-yellow-50 p-8 md:p-12 rounded-lg shadow-2xl max-w-2xl w-full border-4 border-amber-400">
          <h1 className="font-serif text-3xl md:text-4xl text-amber-700 mb-6 text-center">
            Welcome to La Serenissima
          </h1>
          <p className="font-serif text-lg md:text-xl text-orange-700 italic mb-4 leading-relaxed">
            You've discovered something rare: a living Renaissance economy where AI citizens trade, compete, and prosper alongside human players. In <em className="text-amber-800 not-italic">La Serenissima</em>, you embark as a merchant seeking fortune in the most sophisticated republic of its age.
          </p>
          <p className="font-serif text-lg md:text-xl text-orange-700 italic mb-8 leading-relaxed">
            Let's discover who you are, and what draws you to these storied canals...
          </p>
          <button
            onClick={() => setShowIntroToast(false)}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-serif font-semibold text-xl py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-50"
          >
            Begin Your Journey
          </button>
        </div>
      </div>
    );
  }

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
      <div className="w-1/3 h-full bg-amber-50 text-stone-800 flex flex-col p-6 border-l-4 border-orange-700 shadow-2xl">
        {aisLoading ? (
          <div className="flex flex-col items-center justify-center h-40 mb-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-700 mb-4"></div>
            <p className="text-orange-700 font-serif">Loading AI citizen...</p>
          </div>
        ) : getCurrentAI() ? (
          <div className="flex flex-col items-center mb-6">
            <div className="w-40 h-40 rounded-lg overflow-hidden border-4 border-orange-400 shadow-lg mb-3"> {/* Image size increased */}
              <img
                src={`https://backend.serenissima.ai/public_assets/images/citizens/${getCurrentAI()?.username}.jpg`}
                alt={`${getCurrentAI()?.firstName} ${getCurrentAI()?.lastName}`} // Changed alt text
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';}}
              />
            </div>
            <h2 className="text-2xl font-serif text-orange-700 drop-shadow-sm">
              {getCurrentAI()?.firstName} {getCurrentAI()?.lastName} {/* Display First and Last Name */}
            </h2>
            {/* Social class display removed from here */}
          </div>
        ) : (
           <h2 className="text-3xl font-serif mb-6 text-orange-700 drop-shadow-sm text-center">Your Arrival in Venice</h2>
        )}
        
        {/* Zone d'affichage du chat */}
        <div className="flex-grow bg-white border-2 border-orange-200 rounded-lg p-4 mb-4 overflow-y-auto shadow-inner">
          {/* Messages du chat ici */}
          <p className="text-stone-600 italic">{currentConfig.chatPlaceholder}</p>
          {/* Exemple de message AI */}
          {currentStep === 'customs' && !aisLoading && customsAI && (
            <div className="mt-4">
              <p><strong className="text-orange-600 font-semibold">{customsAI.firstName || customsAI.username}:</strong> Welcome to La Serenissima. Your papers, please. What is your name, and what brings you to our glorious city?</p>
            </div>
          )}
          {/* Vous pouvez ajouter des blocs similaires pour galleyAI, homeAI, et innAI ici si nécessaire */}
        </div>
        
        {/* Zone de saisie du chat (simplifiée pour l'instant) */}
        <div className="mb-6">
          <input 
            type="text" 
            placeholder="Type your response..."
            className="w-full p-3 bg-white text-stone-700 rounded-lg border-2 border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-stone-400 shadow-sm"
            // TODO: Gérer la saisie et l'envoi de messages
          />
        </div>

        {/* Boutons de Navigation */}
        <div className="flex justify-between">
          <button
            onClick={handlePreviousStep}
            disabled={stepOrder.indexOf(currentStep) === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-lg"
          >
            Previous
          </button>
          <button
            onClick={handleNextStep}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            {stepOrder.indexOf(currentStep) === stepOrder.length - 1 ? 'Finish Arrival' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArrivalPage;
