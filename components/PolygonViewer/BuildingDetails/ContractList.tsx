import Image from 'next/image';
import { getNormalizedResourceIconPath } from '../../../lib/utils/resourceUtils';

interface ContractListProps {
  contracts: any[];
}

const ContractList: React.FC<ContractListProps> = ({ contracts }) => {
  if (!contracts || contracts.length === 0) return null;

  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        PUBLIC SALE CONTRACTS
      </h3>
      <div className="space-y-3">
        {contracts.map((contract: any) => (
          <div key={contract.id} className="bg-green-50 p-3 rounded-md border border-green-100">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center">
                <div className="relative w-6 h-6 mr-2">
                  <Image 
                    src={getNormalizedResourceIconPath(contract.icon, contract.resourceType || contract.name)}
                    alt={contract.name}
                    width={24}
                    height={24}
                    className="w-6 h-6 object-contain"
                    loading="lazy"
                    unoptimized={true}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/resources/default.png';
                    }}
                  />
                </div>
                <span className="font-medium text-green-800">{contract.name}</span>
              </div>
              <span className="text-xs bg-green-100 px-2 py-1 rounded-full text-green-700">
                Public Sale
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="flex flex-col">
                <span className="text-gray-500">Hourly Amount</span>
                <span className="font-medium">{contract.targetAmount}</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-gray-500">Price</span>
                <span className="font-medium">{contract.price} ⚜️</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-gray-500">Transporter</span>
                <span className="font-medium">{contract.transporter || 'None'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContractList;
