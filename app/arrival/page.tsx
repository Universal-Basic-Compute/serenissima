'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

// Moved outside the component to stabilize dependencies
const getKinosModelForSocialClass = (username?: string, socialClass?: string): string => {
  // For the arrival page chat, always use the specified model
  return "gemini-2.5-pro-preview-06-05";
};

let tempIdCounter = 0;
const generateTempId = () => `temp-client-msg-${tempIdCounter++}`;

const stepIntroMessages: Record<ArrivalStep, string> = {
  galley: "AI citizens in Serenissima have their own goals, businesses, and relationships - engaging with this captain could lead to future shipping partnerships, exclusive trade routes, or valuable market intelligence.",
  customs: "Every AI citizen operates with distinct motivations and insider knowledge - this inspector's network could provide regulatory shortcuts, import opportunities, or warnings about market changes.",
  home: "AI citizens build lasting relationships and remember your interactions - this merchant's mentorship could unlock business partnerships, financial backing, or access to established trade networks.",
  inn: "AI citizens actively participate in Venice's social and economic fabric - this innkeeper's connections could introduce you to profitable contacts, exclusive deals, or emerging market trends."
};

const stepAIRoles: Record<ArrivalStep, string> = {
  galley: "Captain",
  customs: "Custom's House Worker",
  home: "Your Guide",
  inn: "Innkeeper"
};

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
  const [isAiInitiating, setIsAiInitiating] = useState<boolean>(false); // For AI's first message
  const [inputValue, setInputValue] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Contexte pour Kinos, similaire à Compagno
  const [contextualDataForChat, setContextualDataForChat] = useState<{
    senderProfile: any | null; // Profil de l'utilisateur humain
    targetProfile: AIProfile | null; // Profil de base de l'IA avec qui on chatte
    aiDataPackage: any | null; // Paquet de données complet pour l'IA cible
  } | null>(null);
  const [isPreparingContext, setIsPreparingContext] = useState<boolean>(false);

  // Nouvel état pour stocker les messages récupérés avant l'initiation de l'IA
  const [fetchedMessagesForStep, setFetchedMessagesForStep] = useState<Message[] | null>(null);
  const initiationDoneRef = useRef<Record<string, boolean>>({});


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
  }, []); // Keep empty if setChatMessages is the only external dependency from component scope

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

  // Fonction pour récupérer les informations contextuelles pour Kinos
  const fetchContextualInformation = useCallback(async (targetAI: AIProfile | null, humanUsername: string): Promise<void> => {
    if (!targetAI || !humanUsername || humanUsername === DEFAULT_HUMAN_USERNAME) {
      setContextualDataForChat(null);
      return;
    }
    setIsPreparingContext(true);
    try {
      const senderProfile = currentUserProfile; 
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
      
      const newContextData = {
        senderProfile,
        targetProfile: targetAI, 
        aiDataPackage 
      };

      setContextualDataForChat(prevContextData => {
        if (JSON.stringify(newContextData) !== JSON.stringify(prevContextData)) {
          return newContextData;
        }
        return prevContextData;
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des données contextuelles pour Kinos:", error);
      setContextualDataForChat(prevContextData => {
        if (prevContextData !== null) return null;
        return prevContextData;
      });
    } finally {
      setIsPreparingContext(false);
    }
  }, [currentUserProfile]);


  // Fonction pour charger les messages du chat
  const fetchChatMessages = useCallback(async (humanUsername: string, aiUsername: string | undefined): Promise<Message[]> => {
    if (!aiUsername || humanUsername === DEFAULT_HUMAN_USERNAME) {
      setChatMessages([]); 
      return [];
    }
    const channelName = [humanUsername, aiUsername].sort().join('_');
    try {
      const response = await fetch(`/api/messages/channel/${encodeURIComponent(channelName)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.messages) {
          setChatMessages(data.messages);
          return data.messages;
        } else {
          setChatMessages([]);
          return [];
        }
      } else {
        setChatMessages([]);
        return [];
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des messages du chat:", error);
      setChatMessages([]);
      return [];
    }
  }, []);


  useEffect(() => {
    const defaultAIUsername = "BookishMerchant";
    
    const fetchAllAIs = async () => {
      setAisLoading(true);
      const defaultProfile = await fetchCitizen(defaultAIUsername);

      if (!defaultProfile || !defaultProfile.username) {
        console.error(`Default AI profile "${defaultAIUsername}" could not be loaded or is missing a username. Arrival sequence might be impaired.`);
        // Set all AIs to null if default is unusable, or handle error more gracefully
        setGalleyAI(null);
        setCustomsAI(null);
        setHomeAI(null);
        setInnAI(null);
        setAisLoading(false);
        return;
      }

      // Helper to select a random citizen with a valid username
      const selectValidCitizen = (citizens: AIProfile[], type: string): AIProfile | null => {
        const validCitizens = citizens.filter(c => c.username);
        if (validCitizens.length > 0) {
          return validCitizens[Math.floor(Math.random() * validCitizens.length)];
        }
        console.warn(`No valid citizens (with username) found for ${type} AI.`);
        return null;
      };

      // Fetch Galley AI (Random Forestieri, InVenice, with username)
      try {
        const res = await fetch(`/api/citizens?SocialClass=Forestieri&InVenice=true`);
        if (res.ok) {
          const data = await res.json();
          const selected = data.success ? selectValidCitizen(data.citizens, "Galley") : null;
          setGalleyAI(selected || defaultProfile);
        } else {
          console.error("Failed to fetch Forestieri for Galley AI, using default.");
          setGalleyAI(defaultProfile);
        }
      } catch (e) { 
        console.error("Error fetching Galley AI:", e);
        setGalleyAI(defaultProfile); 
      }

      // Fetch Customs AI (Random Occupant of customs_house, with username)
      try {
        const buildingRes = await fetch(`/api/buildings?Type=customs_house`);
        if (buildingRes.ok) {
          const buildingData = await buildingRes.json();
          if (buildingData && buildingData.buildings && buildingData.buildings.length > 0) {
            const occupants = buildingData.buildings.map((b: any) => b.occupant).filter(Boolean);
            const occupantProfiles = (await Promise.all(occupants.map((occ: string) => fetchCitizen(occ)))).filter(p => p && p.username) as AIProfile[];
            const selected = selectValidCitizen(occupantProfiles, "Customs");
            setCustomsAI(selected || defaultProfile);
          } else {
            console.warn("No customs_house or no occupants found, using default Customs AI.");
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

      // Fetch Home AI (Random Cittadini, InVenice, with username)
      try {
        const res = await fetch(`/api/citizens?SocialClass=Cittadini&InVenice=true`);
        if (res.ok) {
          const data = await res.json();
          const selected = data.success ? selectValidCitizen(data.citizens, "Home") : null;
          setHomeAI(selected || defaultProfile);
        } else {
          console.error("Failed to fetch Cittadini for Home AI, using default.");
          setHomeAI(defaultProfile);
        }
      } catch (e) { 
        console.error("Error fetching Home AI:", e);
        setHomeAI(defaultProfile); 
      }

      // Fetch Inn AI (Random Occupant of inn, with username)
      try {
        const buildingRes = await fetch(`/api/buildings?Type=inn`);
        if (buildingRes.ok) {
          const buildingData = await buildingRes.json();
          if (buildingData && buildingData.buildings && buildingData.buildings.length > 0) {
            const occupants = buildingData.buildings.map((b: any) => b.occupant).filter(Boolean);
            const occupantProfiles = (await Promise.all(occupants.map((occ: string) => fetchCitizen(occ)))).filter(p => p && p.username) as AIProfile[];
            const selected = selectValidCitizen(occupantProfiles, "Inn");
            setInnAI(selected || defaultProfile);
          } else {
            console.warn("No inn or no occupants found, using default Inn AI.");
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

  // Fonction pour que l'IA initie la conversation
  const sendSystemInitiationMessage = useCallback(async (
    aiProfile: AIProfile, 
    humanProfile: any | null, 
    step: ArrivalStep,
    contextData: typeof contextualDataForChat
  ) => {
    if (!aiProfile || !humanProfile || humanProfile.username === DEFAULT_HUMAN_USERNAME) return;

    setIsAiInitiating(true);
    const aiName = aiProfile.firstName || aiProfile.username;
    const userName = humanProfile?.firstName || humanProfile?.username || DEFAULT_HUMAN_USERNAME;

    let systemMessageContent = "";
    // Construire le message système basé sur l'étape
    // Common directive for all steps:
    const commonDirectives = `
Your response MUST be grounded in your 'ai_comprehensive_data' from the 'addSystem' field.
Mention specific gameplay elements like your OWNED BUILDINGS, LANDS, active CONTRACTS, or relevant CITIZENS from your 'strongestRelationships'.
Make your conversation directly relevant to the game world and potential interactions.`;

    switch (step) {
      case 'galley':
        systemMessageContent = `[SYSTEM]You are ${aiName}, the captain of this galley, arriving in Venice. You are welcoming ${userName}, a new arrival.
Your Personal Goal: Build a reliable clientele for regular shipping routes.
Conversation Flow & Information to Convey:
1. Friendly greeting about the crossing: "Fine crossing, wouldn't you say? These waters have been good to me for twenty years..."
2. Gauge their business intentions: "You strike me as someone with serious business intentions. Most passengers just gawk at the campanile."
3. [Teaching moment] Explain trade importance: "See those merchant galleys? Each represents fortunes. Venice rewards the prepared. My own ship, the [Your Ship Name if in data, or a generic one like 'Sea Serpent'], has seen its share of profitable voyages."
4. Introduce your service: "I run this route almost daily. Always looking for merchants needing reliable passage for themselves or their GOODS (like [mention a RESOURCE you often transport, from your data if possible])."
5. [Future tie & Intro] Offer connection: "Here's my card. When you're ready to import something valuable, you'll want a captain you trust. Based on my connections (see 'strongestRelationships'), if you're in [type of business, e.g., textiles], I could introduce you to [Citizen X from relationships] who's always looking for [related good/service]. Or perhaps [Citizen Y from relationships] if you're dealing with [another RESOURCE type]."
${commonDirectives}
Start the conversation now.[/SYSTEM]`;
        break;
      case 'customs':
        systemMessageContent = `[SYSTEM]You are ${aiName}, a customs official in Venice, processing ${userName}'s arrival.
Your Personal Goal: Build an information network about new merchants and their activities.
Conversation Flow & Information to Convey:
1. Formal welcome and inquiry: "Welcome to la Serenissima. Purpose of visit?"
2. Acknowledge merchant status, cautious observation: "Ah, another merchant. The Republic thrives on commerce, but... not all ventures succeed. I've seen many try to import [a common RESOURCE] through the [specific BUILDING like 'Customs House'] without proper declarations."
3. [Teaching moment] Explain documentation and Guilds: "You'll need proper documentation for any imports. The Guild system, like the [mention a relevant GUILD from your data or a generic one like 'Mercers' Guild'], is... particular about standards."
4. Offer general advice: "I see many arrive with grand plans. The wise ones? They listen first, observe second, act third. Many fortunes are made and lost around key BUILDINGS like the Rialto Market."
5. [Future tie & Intro] Hint at network: "I keep my ear to the port's pulse. Good information can save a merchant's fortune. My network is wide (see 'strongestRelationships'). If you're looking for contacts in the [stated/inferred sector, e.g., 'spice trade'], I might know [Citizen A from relationships] who deals in [related RESOURCE/area]. Or if it's [another sector], [Citizen B from relationships] is well-connected."
${commonDirectives}
Start the conversation now.[/SYSTEM]`;
        break;
      case 'home':
        systemMessageContent = `[SYSTEM]You are ${aiName}, an established citizen, meeting ${userName}, a new arrival settling into lodging.
Your Personal Goal: Find a promising protégé to expand your business influence, perhaps related to your own BUILDINGS or LANDS.
Conversation Flow & Information to Convey:
1. Observation about arrival: "You made good time from the port. Most newcomers get lost in the maze of canals leading to [mention a known district or landmark from your data if possible]."
2. Share experience, assess them: "I've been watching Venice's markets for fifteen years. Opportunity is real, but... it requires patience. I myself started with a small [Your first BUILDING type, if in data] near [Location of that building]."
3. [Teaching moment] Emphasize relationships and trust: "See this ledger? Every ducat here was earned through relationships. Venice isn't just what you know - it's who trusts you. For example, my dealings with [mention a CITIZEN from 'strongestRelationships'] are built on years of fair trade in [specific RESOURCE or good]."
4. Express need for fresh perspective: "I could use someone with fresh eyes. My connections run deep, but they're... established. My current venture involving [mention one of your active CONTRACTS or a BUSINESS in one of your BUILDINGS] could benefit from new ideas."
5. [Future tie & Intro] Offer mentorship: "Work with me for a season. Learn how Venice really operates. As we work, I can introduce you to key figures. If you're interested in [area related to your business, e.g., 'wool trade'], my associate [Citizen C from relationships] is influential. Or if [another area, e.g., 'property development'], then [Citizen D from relationships] who owns several LANDS nearby would be a good contact."
${commonDirectives}
Start the conversation now.[/SYSTEM]`;
        break;
      case 'inn':
        systemMessageContent = `[SYSTEM]You are ${aiName}, at a local inn (perhaps the innkeeper of [Your Inn's Name if in data]), interacting with ${userName}, a new arrival.
Your Personal Goal: Maintain your position as a central hub for merchant information and gossip, especially regarding local BUILDINGS and CITIZENS.
Conversation Flow & Information to Convey:
1. Welcoming remark/advice: "First night in Venice? You'll want the corner room - quieter, and you can watch the canal traffic leading to the [nearby landmark or BUILDING type]."
2. Highlight access to information: "I see everyone who matters pass through this inn. Merchants, traders like [mention a CITIZEN from 'strongestRelationships' who is a regular], even nobles discussing their new [type of BUILDING, e.g., 'palazzo'] construction."
3. [Teaching moment] Explain value of information: "Listen: in Venice, information flows like wine. Smart merchants know which conversations to overhear, especially about fluctuating prices of [a key RESOURCE]."
4. Share anecdote/observation: "That gentleman by the fire? Failed silk trader – lost his shipments from [a distant port]. The lady in burgundy? Made her fortune in glass from Murano. Every table in my [Inn BUILDING name] tells a story."
5. [Future tie & Intro] Offer continued access: "Keep your room here while you establish yourself. I'll make sure you hear the conversations worth hearing. For instance, [Citizen E from relationships] often discusses [trade topic] here, and [Citizen F from relationships] is known for their knowledge of [local market/guild activity]."
${commonDirectives}
Start the conversation now.[/SYSTEM]`;
        break;
    }

    const kinosInitiationPrompt = `You are ${aiName}, an AI citizen of Venice.
The context for your current situation and your initial interaction with ${userName} is provided in the SYSTEM message below.
Your task is to INITIATE the conversation with ${userName} based on the instructions and scenario described in the SYSTEM message.
Your first message should be welcoming and engaging, aiming to achieve the goals outlined.

CRITICAL: Use the structured context provided in the 'addSystem' field. This contains your 'ai_comprehensive_data' (your full profile, owned LANDS, BUILDINGS, active CONTRACTS, recent PROBLEMS, strongest RELATIONSHIPS, GUILD details, LOANS etc.). Your dialogue MUST incorporate specific details from this data to be RELEVANT and FOCUSED ON GAMEPLAY. Refer to actual CITIZENS, BUILDINGS, RESOURCES, or situations from your data.

--- SYSTEM MESSAGE (Your instructions for initiating this scene) ---
${systemMessageContent}
--- END OF SYSTEM MESSAGE ---

Remember: Your first message should be human-like, conversational, follow the guidance in the SYSTEM message, be RELEVANT using your 'ai_comprehensive_data', and FOCUSED ON GAMEPLAY. NO FLUFF.
Your first message to ${userName}:`;

    const kinosBody: any = {
      content: kinosInitiationPrompt,
      model: getKinosModelForSocialClass(aiProfile.username, aiProfile.socialClass),
    };

    if (contextData && contextData.senderProfile && contextData.targetProfile && contextData.aiDataPackage) {
      kinosBody.addSystem = JSON.stringify({
        sender_citizen_profile: contextData.senderProfile, // Human user
        ai_persona_profile: contextData.targetProfile,    // AI's basic profile
        ai_comprehensive_data: contextData.aiDataPackage  // AI's full data package
      });
    }

    try {
      const kinosResponse = await fetch(
        `${KINOS_API_CHANNEL_BASE_URL}/blueprints/${KINOS_CHANNEL_BLUEPRINT}/kins/${aiProfile.username}/channels/${[humanProfile.username, aiProfile.username].sort().join('_')}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kinosBody),
        }
      );

      if (kinosResponse.ok) {
        const kinosData = await kinosResponse.json();
        if (kinosData.content) {
          const aiFirstMessage: Message = {
            messageId: kinosData.message_id || kinosData.id || generateTempId(),
            sender: aiProfile.username,
            receiver: humanProfile.username,
            content: kinosData.content,
            type: 'message_ai_augmented',
            createdAt: kinosData.timestamp || new Date().toISOString(),
            role: 'assistant',
          };
          setChatMessages(prev => [...prev, aiFirstMessage]);

          // Persist AI's first message to Airtable
          await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: aiProfile.username,
              receiver: humanProfile.username,
              content: kinosData.content,
              type: 'message_ai_augmented',
              channel: [humanProfile.username, aiProfile.username].sort().join('_'),
            }),
          });
        }
      } else {
        console.error("Erreur de l'API Kinos lors de l'initiation:", kinosResponse.status, await kinosResponse.text());
        // Optionnel: afficher un message d'erreur ou un message de fallback de l'IA
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi du message système d'initiation:", error);
    } finally {
      setIsAiInitiating(false);
    }
  }, [getKinosModelForSocialClass]); // Removed contextualDataForChat from deps, it's passed as arg

  // Effet 1: Récupérer les messages et le contexte lorsque l'IA ou l'utilisateur change
  useEffect(() => {
    const currentAI = getCurrentAI();
    if (currentAI && currentUserUsername !== DEFAULT_HUMAN_USERNAME) {
      setIsAiInitiating(true); 
      setChatMessages([]); 

      fetchChatMessages(currentUserUsername, currentAI.username)
        .then(existingMessages => {
          setFetchedMessagesForStep(existingMessages);
          // fetchContextualInformation mettra à jour l'état contextualDataForChat
          fetchContextualInformation(currentAI, currentUserUsername);
        })
        .catch((error) => {
          console.error("Erreur lors de fetchChatMessages dans Effet 1:", error);
          setIsAiInitiating(false); 
          setFetchedMessagesForStep([]); 
        });
    } else if (currentAI) { // AI est là, mais utilisateur est GuestUser
        setIsAiInitiating(false);
        const placeholderMessageId = `placeholder-${currentAI.username}`;
        if (chatMessages.length === 0 || !chatMessages.some(msg => msg.messageId === placeholderMessageId)) {
            setChatMessages([{
                messageId: placeholderMessageId,
                sender: currentAI.username,
                receiver: DEFAULT_HUMAN_USERNAME,
                content: stepsConfig[currentStep].chatPlaceholder,
                type: 'message',
                createdAt: new Date().toISOString(),
            }]);
        }
        if (contextualDataForChat !== null) {
            setContextualDataForChat(null);
        }
        setFetchedMessagesForStep(null); // Réinitialiser pour l'invité
    } else {
      setIsAiInitiating(false);
      setFetchedMessagesForStep(null); // Réinitialiser s'il n'y a pas d'IA
    }
  }, [currentStep, currentUserUsername, getCurrentAI, fetchChatMessages, fetchContextualInformation]);

  // Effet 2: Initier la conversation IA si les conditions sont remplies
  useEffect(() => {
    const currentAI = getCurrentAI();
    const keyForInitiation = `${currentStep}-${currentAI?.username}`;

    if (currentAI && currentAI.username && currentUserUsername !== DEFAULT_HUMAN_USERNAME &&
        fetchedMessagesForStep && fetchedMessagesForStep.length === 0 &&
        contextualDataForChat && !initiationDoneRef.current[keyForInitiation]) {

      // Assurer que l'indicateur de chargement est actif avant l'appel asynchrone.
      // Effet 1 devrait déjà l'avoir mis à true si le chargement des données était en cours.
      setIsAiInitiating(true); 
      initiationDoneRef.current[keyForInitiation] = true;

      sendSystemInitiationMessage(currentAI, currentUserProfile, currentStep, contextualDataForChat)
        .finally(() => {
          setIsAiInitiating(false);
        });
    } else if (currentAI && currentAI.username && fetchedMessagesForStep && fetchedMessagesForStep.length > 0) {
      // Messages chargés depuis l'historique, ou l'IA a déjà répondu.
      // Marquer l'initiation comme faite pour cette IA/étape si ce n'est pas déjà le cas.
      if (!initiationDoneRef.current[keyForInitiation]) {
        initiationDoneRef.current[keyForInitiation] = true;
      }
      // Si isAiInitiating était true (par Effet 1), mais que nous n'initialisons pas ici (car messages existent), le mettre à false.
      if (isAiInitiating) setIsAiInitiating(false);
    } else if (!currentAI || !currentAI.username || currentUserUsername === DEFAULT_HUMAN_USERNAME || !contextualDataForChat || (fetchedMessagesForStep === null)) {
      // Conditions non remplies pour l'initiation (ex: utilisateur invité, pas d'IA, pas de contexte, messages pas encore récupérés (null))
      // ou l'initiation est déjà faite (vérifié par !initiationDoneRef.current[keyForInitiation] plus haut).
      // Si fetchedMessagesForStep est un tableau vide, la condition principale aurait dû être vérifiée.
      // Si isAiInitiating était true, le mettre à false.
      if (isAiInitiating) setIsAiInitiating(false);
    }
  }, [fetchedMessagesForStep, contextualDataForChat, currentStep, currentUserUsername, getCurrentAI, sendSystemInitiationMessage, currentUserProfile]);


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
      messageId: generateTempId(),
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
      let kinosPromptContent = "";
      const aiName = currentAI.firstName || currentAI.username;
      const userName = currentUserProfile?.firstName || currentUserUsername;
      const commonPromptInstructions = `
CRITICAL: Use the structured context provided in the 'addSystem' field (detailed below) to make your response RELEVANT to ${userName} and FOCUSED ON GAMEPLAY.
Reflect your understanding of your relationship (if any, likely none yet), recent events, and potential gameplay interactions with ${userName}.

Guide to 'addSystem' content (use this to make your message relevant and gameplay-focused - try to use real gameplay elements in each message):
- 'sender_citizen_profile': The profile of the human user you are talking to (${userName}).
- 'ai_persona_profile': Your basic profile information (who you are: ${aiName}).
- 'ai_comprehensive_data': Your complete and detailed data package. 
  - Use 'ai_comprehensive_data.citizen' for your full, up-to-date profile (status, wealth, etc.).
  - Use other parts of 'ai_comprehensive_data' (like 'ownedLands', 'activeContracts', 'recentProblems', 'strongestRelationships', 'ownedBuildings', 'guildDetails', 'citizenLoans') to understand your current situation, involvements, and relationships. This is key for a relevant and gameplay-focused response!

--- USER'S MESSAGE TO YOU ---
${messageContent}
--- END OF USER'S MESSAGE ---

Remember: Your reply should be human-like, conversational, follow the conversation flow, RELEVANT to ${userName} using the context, and FOCUSED ON GAMEPLAY. NO FLUFF. Aim for a natural and pertinent response.
Your response:`;

      switch (currentStep) {
        case 'galley':
          kinosPromptContent = `You are ${aiName}, an AI citizen of Venice, currently on your galley as it arrives in Venice.
You are welcoming a new citizen, ${userName}, to La Serenissima.

Your Personal Goal: Building a reliable clientele for regular shipping routes.
Conversation Flow & Information to Convey:
1. Start with a friendly greeting about the crossing: "Fine crossing, wouldn't you say? These waters have been good to me for twenty years..."
2. Gauge the new citizen's intentions: "You strike me as someone with serious business intentions. Most passengers just gawk at the campanile."
3. [Teaching moment] Explain the importance of trade and preparation: "See those merchant galleys ahead? Each one represents fortunes made and lost. Venice rewards the prepared."
4. Introduce your service: "I run this route almost daily. Always looking for merchants who need reliable passage - for themselves or their goods."
5. [Future tie] Offer a way to connect: "Here's my card. When you're ready to import something valuable, you'll want a captain you can trust."
${commonPromptInstructions}`;
          break;
        case 'customs':
          kinosPromptContent = `You are ${aiName}, an AI citizen of Venice, working at the Venetian Customs house.
You are processing the arrival of a new citizen, ${userName}.

Your Personal Goal: Building an information network about new merchants and their activities.
Conversation Flow & Information to Convey:
1. Start with a formal welcome and inquiry: "Welcome to la Serenissima. Purpose of visit?"
2. Acknowledge their merchant status and offer a cautious observation: "Ah, another merchant. The Republic thrives on commerce, but..." [pause] "...not all ventures succeed."
3. [Teaching moment] Explain the importance of documentation and Guilds: "You'll need proper documentation for any imports. The Guild system here is... particular about standards."
4. Offer general advice: "I see many arrive with grand plans. The wise ones? They listen first, observe second, act third."
5. [Future tie] Hint at your information network: "I keep my ear to the port's pulse. Good information can save a merchant's fortune... or reputation."
${commonPromptInstructions}`;
          break;
        case 'home':
          kinosPromptContent = `You are ${aiName}, an established AI citizen of Venice, meeting a new arrival, ${userName}, who is settling into their new lodging.

Your Personal Goal: Finding a promising protégé to expand your business influence.
Conversation Flow & Information to Convey:
1. Start with an observation about their arrival: "You made good time from the port. Most newcomers get lost in the maze of canals."
2. Share your experience and assess them: "I've been watching Venice's markets for fifteen years. The opportunity is real, but..." [studies them] "...it requires patience."
3. [Teaching moment] Emphasize the importance of relationships and trust: "See this ledger? Every ducat here was earned through relationships. Venice isn't just about what you know - it's who trusts you."
4. Express your need for fresh perspective: "I could use someone with fresh eyes. My connections run deep, but they're... established. Set in their ways."
5. [Future tie] Offer mentorship: "Work with me for a season. Learn how Venice really operates. Then we'll see about setting you up independently."
${commonPromptInstructions}`;
          break;
        case 'inn':
          kinosPromptContent = `You are ${aiName}, an AI citizen of Venice, likely the innkeeper or a regular, at a local inn.
You are interacting with a new arrival, ${userName}.

Your Personal Goal: Maintaining your position as a central hub for merchant information and gossip.
Conversation Flow & Information to Convey:
1. Offer a welcoming remark or advice: "First night in Venice? You'll want the corner room - quieter, and you can watch the canal traffic."
2. Highlight your access to information: "I see everyone who matters pass through here. Merchants, traders, even the occasional noble with... interesting propositions."
3. [Teaching moment] Explain the value of information: "Listen: in Venice, information flows like wine. The smart merchants know which conversations to overhear."
4. Share an anecdote or observation: "That gentleman by the fire? Failed silk trader. The lady in burgundy? Made her fortune in glass. Every table tells a story."
5. [Future tie] Offer continued access to information: "Keep your room here while you establish yourself. I'll make sure you hear the conversations worth hearing."
${commonPromptInstructions}`;
          break;
        default: // Fallback to a generic prompt if step is somehow unknown
          kinosPromptContent = `You are ${aiName}, an AI citizen of Venice. You are responding to a message from ${userName}.
IMPORTANT: Your response should be human-like and conversational.
DO NOT use overly formal language or write excessively long paragraphs unless the context truly calls for it.
Aim for natural, pertinent, and engaging dialogue.
${commonPromptInstructions}`;
      }
      
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
            messageId: kinosData.message_id || kinosData.id || generateTempId(),
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
              {getCurrentAI()?.firstName} {getCurrentAI()?.lastName}
              {currentStep && stepAIRoles[currentStep] && (
                <span className="text-lg text-stone-600 ml-2">({stepAIRoles[currentStep]})</span>
              )}
            </h2>
            {getCurrentAI()?.username && (
              <p className="text-sm italic text-orange-600">({getCurrentAI()?.username})</p>
            )}
            {/* Social class display removed from here */}
          </div>
        ) : (
           <h2 className="text-3xl font-serif mb-6 text-orange-700 drop-shadow-sm text-center">Your Arrival in Venice</h2>
        )}
        
        {/* Zone d'affichage du chat */}
        <div className="flex-grow bg-white border-2 border-orange-200 rounded-lg p-4 mb-4 overflow-y-auto shadow-inner flex flex-col space-y-2">
          {/* Message d'introduction contextuel */}
          {currentStep && stepIntroMessages[currentStep] && (
            <div className="mb-4 p-3 text-sm text-stone-700 bg-amber-100 border border-amber-200 rounded-md shadow">
              <p className="italic">{stepIntroMessages[currentStep]}</p>
            </div>
          )}
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
                <div className="text-sm markdown-content-arrival"> {/* Added a wrapper class for potential styling */}
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
                <p className={`text-xs mt-1 ${msg.sender === currentUserUsername ? 'text-orange-100' : 'text-stone-500'}`}>
                  {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {isAiInitiating && chatMessages.length === 0 && (
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
