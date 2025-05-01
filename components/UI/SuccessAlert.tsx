import React, { useEffect, useState } from 'react';
import AnimatedDucats from './AnimatedDucats';

interface SuccessAlertProps {
  message: string;
  signature?: string;
  onClose: () => void;
}

const SuccessAlert: React.FC<SuccessAlertProps> = ({ message, signature, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Allow time for fade-out animation
    }, 5000); // Auto-close after 5 seconds
    
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="bg-white rounded-lg p-6 shadow-xl max-w-md w-full relative z-10 border-2 border-amber-600">
        <div className="flex items-center mb-4">
          <div className="bg-green-100 p-2 rounded-full mr-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900">Success!</h3>
        </div>
        
        <p className="mb-3 text-gray-700">
          {message.includes('$COMPUTE') ? (
            <>
              {message.split('$COMPUTE')[0]}
              <span className="compute-token">$COMPUTE</span>
              {message.split('$COMPUTE')[1]}
            </>
          ) : (
            message
          )}
        </p>
        
        {signature && (
          <div className="bg-gray-50 p-3 rounded mb-4 border border-gray-200">
            <p className="text-sm text-gray-600 font-mono break-all">
              <span className="font-semibold">Transaction:</span> {signature}
            </p>
          </div>
        )}
        
        <button
          onClick={onClose}
          className="w-full bg-amber-600 text-white py-2 px-4 rounded hover:bg-amber-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default SuccessAlert;
