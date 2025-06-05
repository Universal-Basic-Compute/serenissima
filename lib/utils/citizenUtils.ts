import { normalizeProfileData } from '@/components/UI/WalletProvider'; // Importer la fonction de normalisation

/**
 * Get the current citizen's full profile from localStorage.
 * Reads from 'citizenProfile' key, parses JSON, and normalizes the data.
 * @returns The normalized citizen profile object, or null if not found or an error occurs.
 */
export function getCurrentCitizenProfile(): any | null {
  if (typeof window === 'undefined') {
    // Avoid localStorage access during server-side rendering or build time
    return null;
  }
  try {
    const profileStr = localStorage.getItem('citizenProfile');
    if (!profileStr) {
      return null;
    }
    const profile = JSON.parse(profileStr);
    return normalizeProfileData(profile); // Utiliser la fonction de normalisation importée
  } catch (error) {
    console.error('Error getting citizen profile from localStorage:', error);
    return null;
  }
}

/**
 * Get the current citizen's username from their stored profile.
 * @returns The username of the current citizen, or null if not logged in or profile not found.
 */
export function getUsername(): string | null {
  const profile = getCurrentCitizenProfile();
  return profile ? profile.username : null;
}

/**
 * Get the current citizen's wallet address from localStorage.
 * @returns The wallet address, or null if not found.
 */
export function getCurrentWalletAddress(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem('walletAddress');
  } catch (error) {
    console.error('Error getting wallet address from localStorage:', error);
    return null;
  }
}

/**
 * Checks if a citizen is currently logged in.
 * A citizen is considered logged in if their profile and wallet address are present in localStorage.
 * @returns True if the citizen is logged in, false otherwise.
 */
export function isCitizenLoggedIn(): boolean {
  const profile = getCurrentCitizenProfile();
  const walletAddress = getCurrentWalletAddress();
  return !!profile && !!walletAddress;
}
