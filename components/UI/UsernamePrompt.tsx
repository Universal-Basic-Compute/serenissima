'use client';

import React, { useState } from 'react';

interface UsernamePromptProps {
  onUsernameSubmit: (username: string) => Promise<void>; // Callback avec le nom d'utilisateur
  onClose: () => void; // Pour fermer le modal si l'utilisateur annule
  initialError?: string | null;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;

const UsernamePrompt: React.FC<UsernamePromptProps> = ({ onUsernameSubmit, onClose, initialError }) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(initialError || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateUsername = (name: string): string | null => {
    if (!name) {
      return 'Username cannot be empty.';
    }
    if (name.length < MIN_USERNAME_LENGTH) {
      return `Username must be at least ${MIN_USERNAME_LENGTH} characters long.`;
    }
    if (name.length > MAX_USERNAME_LENGTH) {
      return `Username cannot exceed ${MAX_USERNAME_LENGTH} characters.`;
    }
    if (!USERNAME_REGEX.test(name)) {
      return 'Username can only contain letters, numbers, underscores (_), and hyphens (-).';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null); // Clear previous errors

    try {
      await onUsernameSubmit(username);
      // Le parent (WalletProvider) gérera la fermeture après une soumission réussie.
    } catch (submissionError: any) {
      console.error("Error during username submission in prompt:", submissionError);
      setError(submissionError.message || 'Failed to set username. It might be taken or invalid.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000]">
      <div className="bg-amber-50 p-8 rounded-lg shadow-2xl w-full max-w-md border-4 border-amber-600">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">Choose Your Name</h2>
          {/* Option de fermeture retirée pour forcer le choix du nom d'utilisateur */}
          {/* <button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button> */}
        </div>
        
        <p className="text-stone-700 mb-2 text-center">
          Welcome to La Serenissima! To begin your journey, please choose a unique username.
        </p>
        <p className="text-xs text-stone-600 mb-6 text-center">
          This name will identify you in the Republic. Choose wisely, as it cannot be easily changed.
          (Min {MIN_USERNAME_LENGTH}, Max {MAX_USERNAME_LENGTH} chars. Allowed: A-Z, a-z, 0-9, _, -)
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-amber-800 font-medium mb-2 sr-only">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError(null); // Clear error on typing
              }}
              className="w-full p-3 border-2 border-amber-400 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-amber-600 text-lg text-center"
              placeholder="Enter your desired username"
              aria-describedby="username-error"
            />
          </div>

          {error && (
            <p id="username-error" className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            className={`w-full px-6 py-3 text-lg font-semibold rounded-md transition-colors duration-150 ease-in-out
              ${isSubmitting || !username.trim()
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-4 focus:ring-amber-400 focus:outline-none'
              }`}
            disabled={isSubmitting || !username.trim()}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying...
              </div>
            ) : 'Claim Your Name & Enter Venice'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UsernamePrompt;
