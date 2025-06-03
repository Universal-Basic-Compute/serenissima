'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FaTimes } from 'react-icons/fa'; // FaSpinner a été retiré

interface DailyUpdatePanelProps {
  onClose: () => void;
  isUserLoggedIn?: boolean; // Added to accept the prop from app/page.tsx
}

const DailyUpdatePanel: React.FC<DailyUpdatePanelProps> = ({ onClose, isUserLoggedIn }) => {
  const [messageContent, setMessageContent] = useState<string>(''); // Initialisé avec une chaîne vide
  const [isLoading, setIsLoading] = useState<boolean>(true); // True while fetching data
  const [error, setError] = useState<string | null>(null); // Gardé pour une gestion d'erreur spécifique si nécessaire
  const [isPanelVisible, setIsPanelVisible] = useState<boolean>(false); // Controls CSS display:none
  const [isMinTimePassed, setIsMinTimePassed] = useState<boolean>(false); // Ensures minimum display delay
  const panelRef = useRef<HTMLDivElement>(null);

  // Effect for fetching data
  useEffect(() => {
    const fetchDailyUpdate = async () => {
      setIsLoading(true);
      setError(null);
      setMessageContent(''); // Effacer le message précédent
      try {
        const response = await fetch('/api/messages?type=daily_update&latest=true');
        if (!response.ok) {
          throw new Error(`Le serveur a répondu avec ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success && data.message && data.message.content) {
          setMessageContent(data.message.content);
        } else if (data.success && (!data.message || !data.message.content)) {
          // Récupération réussie, mais pas de contenu de message
          setMessageContent("Pas de nouvelles mises à jour pour aujourd'hui. Revenez plus tard !");
          console.log('Aucun contenu de message de mise à jour quotidienne trouvé.');
        } else {
          // L'appel API a réussi mais l'opération a échoué (par ex., data.success est false)
          const apiErrorMessage = data.error || "Échec de la récupération des mises à jour. Veuillez réessayer.";
          setMessageContent(apiErrorMessage);
          console.error('Échec de la récupération des mises à jour quotidiennes:', apiErrorMessage);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Une erreur réseau inconnue est survenue';
        console.error('Erreur lors de la récupération de la mise à jour quotidienne:', errorMessage);
        setError(errorMessage); // Définir l'état d'erreur pour un affichage spécifique potentiel
        setMessageContent(`Désolé, nous n'avons pas pu récupérer les derniers avvisi en raison d'une erreur : ${errorMessage}. Veuillez essayer de continuer et revenez plus tard.`);
      } finally {
        setIsLoading(false); // Data fetching is complete
      }
    };

    fetchDailyUpdate();
  }, []); // onClose a été retiré des dépendances, car nous ne l'appelons plus directement ici.

  // Effect for minimum display time
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMinTimePassed(true);
    }, 6000); // 6000ms (6 seconds) minimum delay before panel can become visible
    return () => clearTimeout(timer);
  }, []);

  // Effect to control panel visibility based on data loading and minimum time
  useEffect(() => {
    if (!isLoading && isMinTimePassed && !error) { // Added !error condition
      setIsPanelVisible(true);
    } else if (error) { // If there's an error, ensure panel is not visible
      setIsPanelVisible(false);
    }
  }, [isLoading, isMinTimePassed, error]);

  // Handle clicks outside the panel to close it (optional, good UX)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // Intentionally not closing on outside click to make user explicitly click "Continue"
        // onClose(); 
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]); // onClose est utilisé par handleClickOutside, il doit donc rester si cette fonctionnalité est conservée.

  // La structure principale du panneau est toujours rendue.
  // Le contenu change en fonction de isLoading et messageContent.
  return (
    // Le wrapper principal du panneau. bg-black/80 a été retiré pour rendre l'arrière-plan (la carte) visible.
    // z-[46] le place au-dessus des bulles de pensée (z-[45]) et des éléments de l'interface principale (z-20, z-30).
    <div 
      className="fixed inset-0 z-[46] flex items-center justify-center p-4 overflow-auto pointer-events-none"
      style={!isPanelVisible ? { display: 'none' } : {}} // Contrôler la visibilité ici
    >
      <div
        ref={panelRef}
        className="bg-amber-50 border-2 border-amber-700 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col pointer-events-auto" // Added pointer-events-auto here
      >
        <div className="flex justify-between items-center p-4 border-b border-amber-200">
          <h2 className="text-2xl font-serif text-orange-800">
            AVVISI  - ULTIME NOVELLE VENEZIANE
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading} // Désactiver le bouton de fermeture pendant le chargement
            className="text-amber-600 hover:text-amber-800 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close Update"
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div 
          className="prose prose-amber max-w-none p-6 overflow-y-auto custom-scrollbar flex-grow min-h-[150px]" 
          style={{ '--tw-prose-body': '#9A3412' } as React.CSSProperties} // #9A3412 est orange-800
        > {/* min-h pour la cohérence de la taille */}
          {/* Le spinner et le texte de chargement ont été retirés. Le messageContent s'affichera directement. */}
          {/* Si isLoading est true, messageContent sera vide initialement, puis mis à jour. */}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageContent}</ReactMarkdown>
        </div>

        <div className="p-4 border-t border-amber-200 text-center">
          <button
            onClick={onClose}
            disabled={isLoading} // Désactiver le bouton de continuation pendant le chargement
            className="px-6 py-3 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors font-semibold disabled:bg-amber-400 disabled:cursor-not-allowed"
          >
            Continue to La Serenissima
          </button>
        </div>
      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 248, 230, 0.2); /* Light amber track */
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(180, 120, 60, 0.5); /* Darker amber thumb */
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(180, 120, 60, 0.7); /* Darker amber thumb on hover */
        }
      `}</style>
    </div>
  );
};

export default DailyUpdatePanel;
