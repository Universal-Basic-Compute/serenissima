'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// Interface pour les messages, similaire à Compagno
interface Message {
  id?: string; // ID Airtable
  messageId?: string; // ID Kinos ou ID temporaire
  role?: 'user' | 'assistant'; // Rôle dans la conversation Kinos
  sender?: string; // Username de l'expéditeur
  receiver?: string; // Username du destinataire
  content: string;
  type?: string; // ex: 'message', 'message_ai_augmented'
  timestamp?: string; // Timestamp Kinos
  createdAt?: string; // Timestamp Airtable
  readAt?: string | null;
}

const KINOS_API_CHANNEL_BASE_URL = 'https://api.kinos-engine.ai/v2';
const KINOS_CHANNEL_BLUEPRINT = 'serenissima-ai';
const DEFAULT_HUMAN_USERNAME = 'GuestUser'; // Fallback si le profil n'est pas chargé

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

  const [currentUserUsername, setCurrentUserUsername] = useState<string>(DEFAULT_HUMAN_USERNAME);
  const [currentUserProfile, setCurrentUserProfile] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Contexte pour Kinos, similaire à Compagno
  const [contextualDataForChat, setContextualDataForChat] = useState<{
    senderProfile: any | null; // Profil de l'utilisateur humain
    targetProfile: AIProfile | null; // Profil de base de l'IA avec qui on chatte
    aiDataPackage: any | null; // Paquet de données complet pour l'IA cible
  } | null>(null);
  const [isPreparingContext, setIsPreparingContext] = useState<boolean>(false);


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

  // Récupérer le nom d'utilisateur actuel et le profil au montage
  useEffect(() => {
    const storedProfile = localStorage.getItem('citizenProfile');
    if (storedProfile) {
      try {
        const profile = JSON.parse(storedProfile);
        if (profile.username) {
          setCurrentUserUsername(profile.username);
          setCurrentUserProfile(profile);
        }
      } catch (e) {
        console.error("Erreur lors de la lecture du profil citoyen depuis localStorage:", e);
      }
    }
  }, []);

  const getKinosModelForSocialClass = (username?: string, socialClass?: string): string => {
    if (username === 'NLR') return 'gemini-2.5-pro-preview-05-06';
    const lowerSocialClass = socialClass?.toLowerCase();
    switch (lowerSocialClass) {
      case 'nobili': return 'gemini-2.5-pro-preview-05-06';
      case 'cittadini': case 'forestieri': return 'gemini-2.5-flash-preview-05-20';
      case 'popolani': case 'facchini': return 'local';
      default: return 'gemini-2.5-flash-preview-05-20';
    }
  };

  // Fonction pour récupérer les informations contextuelles pour Kinos
  const fetchContextualInformation = useCallback(async (targetAI: AIProfile | null, humanUsername: string) => {
    if (!targetAI || !humanUsername || humanUsername === DEFAULT_HUMAN_USERNAME) {
      setContextualDataForChat(null);
      return;
    }
    setIsPreparingContext(true);
    try {
      const senderProfile = currentUserProfile; // Profil de l'utilisateur humain
      const aiDataPackageResponse = await fetch(`/api/get-data-package?citizenUsername=${targetAI.username}`);
      
      let aiDataPackage = null;
      if (aiDataPackageResponse.ok) {
        const packageData = await aiDataPackageResponse.json();
        if (packageData.success) {
          aiDataPackage = packageData.data;
        } else {
          console.error(`Échec de la récupération du data package pour ${targetAI.username}:`, packageData.error);
        }
      } else {
        console.error(`Erreur HTTP lors de la récupération du data package pour ${targetAI.username}: ${aiDataPackageResponse.status}`);
      }
      
      setContextualDataForChat({ 
        senderProfile, 
        targetProfile: targetAI, // Profil de base de l'IA
        aiDataPackage // Paquet de données complet
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des données contextuelles pour Kinos:", error);
      setContextualDataForChat(null);
    } finally {
      setIsPreparingContext(false);
    }
  }, [currentUserProfile]);


  // Fonction pour charger les messages du chat
  const fetchChatMessages = useCallback(async (humanUsername: string, aiUsername: string | undefined) => {
    if (!aiUsername || humanUsername === DEFAULT_HUMAN_USERNAME) {
      setChatMessages([]); // Pas de messages si l'IA n'est pas définie ou si l'utilisateur est un invité
      return;
    }
    const channelName = [humanUsername, aiUsername].sort().join('_');
    try {
      const response = await fetch(`/api/messages/channel/${encodeURIComponent(channelName)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.messages) {
          setChatMessages(data.messages);
        } else {
          setChatMessages([]);
        }
      } else {
        setChatMessages([]);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des messages du chat:", error);
      setChatMessages([]);
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
  }, [fetchCitizen]); // fetchCitizen est stable grâce à useCallback

  // Charger les messages et le contexte lorsque l'IA actuelle ou l'utilisateur change
  useEffect(() => {
    const currentAI = getCurrentAI();
    if (currentAI && currentUserUsername !== DEFAULT_HUMAN_USERNAME) {
      fetchChatMessages(currentUserUsername, currentAI.username);
      fetchContextualInformation(currentAI, currentUserUsername);
    } else if (currentAI) { // AI est là, mais utilisateur est GuestUser
        // Afficher le message placeholder de l'IA comme seul message
        setChatMessages([{
            messageId: `placeholder-${currentAI.username}`,
            sender: currentAI.username,
            receiver: DEFAULT_HUMAN_USERNAME,
            content: stepsConfig[currentStep].chatPlaceholder,
            type: 'message',
            createdAt: new Date().toISOString(),
        }]);
        setContextualDataForChat(null); // Pas de contexte pour GuestUser
    }
  }, [currentStep, currentUserUsername, fetchChatMessages, fetchContextualInformation, getCurrentAI]);


  // Scroll vers le bas lorsque de nouveaux messages sont ajoutés
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSendMessage = async () => {
    const messageContent = inputValue.trim();
    if (!messageContent || currentUserUsername === DEFAULT_HUMAN_USERNAME) return;

    const currentAI = getCurrentAI();
    if (!currentAI) return;

    setIsSendingMessage(true);

    const tempUserMessage: Message = {
      messageId: `temp-${Date.now()}`,
      sender: currentUserUsername,
      receiver: currentAI.username,
      content: messageContent,
      type: 'message',
      createdAt: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, tempUserMessage]);
    setInputValue('');

    try {
      // 1. Persist user message to Airtable
      const persistUserMsgResponse = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentUserUsername,
          receiver: currentAI.username,
          content: messageContent,
          type: 'message',
          channel: [currentUserUsername, currentAI.username].sort().join('_'),
        }),
      });
      if (!persistUserMsgResponse.ok) console.error("Échec de la persistance du message utilisateur");
      // Optionnel: mettre à jour le message temporaire avec l'ID réel si l'API le renvoie

      // 2. Call Kinos AI
      let kinosPromptContent = 
`You are ${currentAI.firstName || currentAI.username}, an AI citizen of Venice. You are responding to a message from ${currentUserProfile?.firstName || currentUserUsername}.
IMPORTANT: Your response should be human-like and conversational.
DO NOT use overly formal language or write excessively long paragraphs unless the context truly calls for it.
Aim for natural, pertinent, and engaging dialogue.

CRITICAL: Use the structured context provided in the 'addSystem' field (detailed below) to make your response RELEVANT to ${currentUserProfile?.firstName || currentUserUsername} and FOCUSED ON GAMEPLAY.
Reflect your understanding of your relationship, recent events, and potential gameplay interactions with ${currentUserProfile?.firstName || currentUserUsername}.

Guide to 'addSystem' content (use this to make your message relevant and gameplay-focused):
- 'sender_citizen_profile': The profile of the human user you are talking to (${currentUserProfile?.firstName || currentUserUsername}).
- 'ai_persona_profile': Your basic profile information (who you are: ${currentAI.firstName || currentAI.username}).
- 'ai_comprehensive_data': Your complete and detailed data package. 
  - Use 'ai_comprehensive_data.citizen' for your full, up-to-date profile (status, wealth, etc.).
  - Use other parts of 'ai_comprehensive_data' (like 'ownedLands', 'activeContracts', 'recentProblems', 'strongestRelationships', 'ownedBuildings', 'guildDetails', 'citizenLoans') to understand your current situation, involvements, and relationships. This is key for a relevant and gameplay-focused response!

--- USER'S MESSAGE TO YOU ---
${messageContent}
--- END OF USER'S MESSAGE ---

Remember: Your reply should be human-like, conversational, RELEVANT to ${currentUserProfile?.firstName || currentUserUsername} using the context from 'ai_comprehensive_data', and FOCUSED ON GAMEPLAY. NO FLUFF. Aim for a natural and pertinent response.
Your response:`;
      
      const kinosBody: any = {
        content: kinosPromptContent,
        model: getKinosModelForSocialClass(currentAI.username, currentAI.socialClass),
      };

      if (contextualDataForChat && contextualDataForChat.senderProfile && contextualDataForChat.targetProfile && contextualDataForChat.aiDataPackage) {
        kinosBody.addSystem = JSON.stringify({
            sender_citizen_profile: contextualDataForChat.senderProfile,
            ai_persona_profile: contextualDataForChat.targetProfile, // Basic profile of the AI
            ai_comprehensive_data: contextualDataForChat.aiDataPackage // Full data package for the AI
        });
      } else {
        console.warn("Données contextuelles incomplètes pour Kinos, envoi du prompt sans addSystem.", contextualDataForChat);
      }
      
      const kinosResponse = await fetch(
        `${KINOS_API_CHANNEL_BASE_URL}/blueprints/${KINOS_CHANNEL_BLUEPRINT}/kins/${currentAI.username}/channels/${[currentUserUsername, currentAI.username].sort().join('_')}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kinosBody),
        }
      );

      if (kinosResponse.ok) {
        const kinosData = await kinosResponse.json();
        if (kinosData.content) {
          const aiMessage: Message = {
            messageId: kinosData.message_id || kinosData.id || `kinos-msg-${Date.now()}`,
            sender: currentAI.username,
            receiver: currentUserUsername,
            content: kinosData.content,
            type: 'message_ai_augmented',
            createdAt: kinosData.timestamp || new Date().toISOString(),
            role: 'assistant',
          };
          setChatMessages(prev => [...prev, aiMessage]);

          // 3. Persist AI message to Airtable
          await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: currentAI.username,
              receiver: currentUserUsername,
              content: kinosData.content,
              type: 'message_ai_augmented',
              channel: [currentUserUsername, currentAI.username].sort().join('_'),
            }),
          });
        }
      } else {
        console.error("Erreur de l'API Kinos:", kinosResponse.status, await kinosResponse.text());
         const fallbackAiMessage: Message = {
            messageId: `fallback-ai-${Date.now()}`,
            sender: currentAI.username,
            receiver: currentUserUsername,
            content: "I'm currently unable to respond in detail. Please try again later.",
            type: 'message',
            createdAt: new Date().toISOString(),
          };
          setChatMessages(prev => [...prev, fallbackAiMessage]);
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
       const fallbackAiMessage: Message = {
            messageId: `error-ai-${Date.now()}`,
            sender: currentAI?.username || 'AI',
            receiver: currentUserUsername,
            content: "An unexpected error occurred. I cannot reply at this moment.",
            type: 'message',
            createdAt: new Date().toISOString(),
          };
      setChatMessages(prev => [...prev, fallbackAiMessage]);
    } finally {
      setIsSendingMessage(false);
    }
  };

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
        <div className="flex-grow bg-white border-2 border-orange-200 rounded-lg p-4 mb-4 overflow-y-auto shadow-inner flex flex-col space-y-2">
          {chatMessages.map((msg, index) => (
            <div
              key={msg.messageId || `msg-${index}`}
              className={`flex ${msg.sender === currentUserUsername ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  msg.sender === currentUserUsername
                    ? 'bg-orange-500 text-white rounded-br-none'
                    : 'bg-stone-200 text-stone-800 rounded-bl-none'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-xs mt-1 ${msg.sender === currentUserUsername ? 'text-orange-100' : 'text-stone-500'}`}>
                  {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {isSendingMessage && chatMessages[chatMessages.length-1]?.sender === currentUserUsername && (
             <div className="flex justify-start">
                <div className="max-w-[80%] p-3 rounded-lg bg-stone-200 text-stone-800 rounded-bl-none">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Zone de saisie du chat */}
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="mb-6 flex">
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={currentUserUsername === DEFAULT_HUMAN_USERNAME ? "Connect your wallet to chat" : "Type your response..."}
            className="flex-grow p-3 bg-white text-stone-700 rounded-l-lg border-2 border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-stone-400 shadow-sm"
            disabled={isSendingMessage || aisLoading || currentUserUsername === DEFAULT_HUMAN_USERNAME}
          />
          <button
            type="submit"
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-r-lg transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
            disabled={isSendingMessage || aisLoading || !inputValue.trim() || currentUserUsername === DEFAULT_HUMAN_USERNAME}
          >
            Send
          </button>
        </form>

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
