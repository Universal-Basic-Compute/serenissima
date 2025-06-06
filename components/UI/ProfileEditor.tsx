import React, { useState, useEffect } from 'react';
import { useWalletContext } from './WalletProvider';

interface ProfileEditorProps {
  onClose: () => void;
  onSuccess?: (updatedProfile: any) => void;
}

const ProfileEditor: React.FC<ProfileEditorProps> = ({ onClose, onSuccess }) => {
  const { citizenProfile } = useWalletContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [familyMotto, setFamilyMotto] = useState('');
  const [coatOfArmsImageUrl, setCoatOfArmsImageUrl] = useState('');
  
  // Initialize form with current citizen data
  useEffect(() => {
    if (citizenProfile) {
      setUsername(citizenProfile.username || '');
      setFirstName(citizenProfile.firstName || '');
      setLastName(citizenProfile.lastName || '');
      setFamilyMotto(citizenProfile.familyMotto || '');
      setCoatOfArmsImageUrl(citizenProfile.coatOfArmsImageUrl || '');
    }
  }, [citizenProfile]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!citizenProfile || !citizenProfile.id) {
      setError('Citizen profile not found');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/citizens/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: citizenProfile.id, // This is the Airtable Record ID
          currentCitizenUsername: citizenProfile.username, // Pass current username for activity service
          username, // New username (if changed)
          firstName,
          lastName,
          familyMotto,
          coatOfArmsImageUrl
        }),
      });
      
      const data = await response.json();
      
      // The response from /api/citizens/update (which proxies /api/activities/try-create)
      // might not directly contain `data.citizen` in the same way.
      // It will likely return the result of the activity creation.
      // We need to ensure the `citizenProfileUpdated` event receives the *actual updated profile*.
      // The `try-create` for `update_citizen_profile` *should* return the updated citizen profile
      // in its `activityResult.citizen` or similar field.
      // Let's assume for now the backend's `try-create` for this activity type
      // returns a structure like { success: true, activityResult: { citizen: {...} } }
      // or { success: true, citizen: {...} } if it's simplified.

      if (data.success) {
        const updatedCitizenProfile = data.citizen || (data.activityResult && data.activityResult.citizen);

        if (updatedCitizenProfile) {
          // Update local storage with the new profile data
          localStorage.setItem('citizenProfile', JSON.stringify(updatedCitizenProfile));
          
          // Dispatch an event to notify other components about the profile update
          window.dispatchEvent(new CustomEvent('citizenProfileUpdated', { 
            detail: updatedCitizenProfile 
          }));
          
          // Call the success callback if provided
          if (onSuccess) {
            onSuccess(updatedCitizenProfile);
          }
          
          // Close the editor
          onClose();
        } else {
          // This case means the API call was "successful" but didn't return the expected citizen profile.
          // This could happen if the /api/activities/try-create response structure is different.
          console.warn('Profile update API call succeeded, but no updated citizen profile was returned in the response.', data);
          setError('Profile updated, but could not refresh data. Please reload.');
          // Optionally, still close or provide a way to manually refresh.
          onClose(); // Close anyway, user might see stale data until next load.
        }
      } else {
        setError(data.error || data.details || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('An error occurred while updating your profile');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-amber-50 rounded-lg p-6 max-w-md w-full border-2 border-amber-600 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-serif text-amber-800">Edit Profile</h2>
          <button 
            onClick={onClose}
            className="text-amber-600 hover:text-amber-800 p-2 rounded-full hover:bg-amber-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-amber-800 font-medium mb-1">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Your public username"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="firstName" className="block text-amber-800 font-medium mb-1">
                First Name
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full p-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="First name"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-amber-800 font-medium mb-1">
                Last Name
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full p-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Last name"
              />
            </div>
          </div>
          
          <div className="mb-4">
            <label htmlFor="familyMotto" className="block text-amber-800 font-medium mb-1">
              Family Motto
            </label>
            <input
              type="text"
              id="familyMotto"
              value={familyMotto}
              onChange={(e) => setFamilyMotto(e.target.value)}
              className="w-full p-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Your family motto"
            />
          </div>
          
          <div className="mb-6">
            <label htmlFor="coatOfArmsImageUrl" className="block text-amber-800 font-medium mb-1">
              Coat of Arms Image URL
            </label>
            <input
              type="text"
              id="coatOfArmsImageUrl"
              value={coatOfArmsImageUrl}
              onChange={(e) => setCoatOfArmsImageUrl(e.target.value)}
              className="w-full p-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="https://example.com/your-image.jpg"
            />
            <p className="text-xs text-amber-600 mt-1">
              Enter a URL to an image for your coat of arms
            </p>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors ${
                isSubmitting ? 'opacity-75 cursor-not-allowed' : ''
              }`}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileEditor;
