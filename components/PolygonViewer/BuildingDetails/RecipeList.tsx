import Image from 'next/image';
import { getNormalizedResourceIconPath } from '../../../lib/utils/resourceUtils';

// Helper function to format craft time in minutes to a more readable format
const formatCraftTime = (minutes: number): string => {
  if (!minutes) return '';
  
  if (minutes < 60) {
    return `${minutes} min`;
  } else if (minutes < 1440) { // Less than a day
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 
      ? `${hours} hr ${remainingMinutes} min` 
      : `${hours} hr`;
  } else { // Days or more
    const days = Math.floor(minutes / 1440);
    const remainingHours = Math.floor((minutes % 1440) / 60);
    const remainingMinutes = minutes % 60;
    
    let result = `${days} day${days !== 1 ? 's' : ''}`;
    if (remainingHours > 0) {
      result += ` ${remainingHours} hr`;
    }
    if (remainingMinutes > 0) {
      result += ` ${remainingMinutes} min`;
    }
    return result;
  }
};

interface RecipeListProps {
  recipes: any[];
}

const RecipeList: React.FC<RecipeListProps> = ({ recipes }) => {
  if (!recipes || recipes.length === 0) return null;

  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        RECIPES
      </h3>
      <div className="space-y-4">
        {recipes.map((recipe, index) => (
          <div key={`recipe-${index}`} className="bg-amber-50 p-3 rounded-md border border-amber-100">
            {/* Recipe title with craft time */}
            <div className="flex justify-between items-center mb-2 pb-1 border-b border-amber-200">
              <span className="font-medium text-amber-800">Recipe #{index + 1}</span>
              {recipe.craftMinutes > 0 && (
                <span className="text-xs bg-amber-100 px-2 py-1 rounded-full text-amber-700">
                  {formatCraftTime(recipe.craftMinutes)}
                </span>
              )}
            </div>
            
            {/* Recipe content in a grid */}
            <div className="grid grid-cols-3 gap-2">
              {/* Input resources */}
              <div className="col-span-1 border-r border-amber-200 pr-2">
                <div className="text-xs text-amber-600 mb-1 font-medium">INPUTS</div>
                {recipe.inputs && recipe.inputs.length > 0 ? (
                  recipe.inputs.map((input: any) => (
                    <div key={`input-${input.resourceType}`} className="flex items-center mb-1">
                      <div className="flex-shrink-0 w-6 h-6 mr-1">
                        <Image 
                          src={getNormalizedResourceIconPath(input.icon, input.resourceType || input.name)}
                          alt={input.name}
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
                      <div className="flex-1">
                        <span className="text-xs capitalize">{input.name}</span>
                        <span className="text-xs text-amber-700 ml-1">x{input.amount}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-500 italic">No inputs required</div>
                )}
              </div>
              
              {/* Arrow */}
              <div className="flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
              
              {/* Output resources */}
              <div className="col-span-1">
                <div className="text-xs text-amber-600 mb-1 font-medium">OUTPUTS</div>
                {recipe.outputs && recipe.outputs.length > 0 ? (
                  recipe.outputs.map((output: any) => (
                    <div key={`output-${output.resourceType}`} className="flex items-center mb-1">
                      <div className="flex-shrink-0 w-6 h-6 mr-1">
                        <Image 
                          src={getNormalizedResourceIconPath(output.icon, output.resourceType || output.name)}
                          alt={output.name}
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
                      <div className="flex-1">
                        <span className="text-xs capitalize">{output.name}</span>
                        <span className="text-xs text-green-600 ml-1">x{output.amount}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-500 italic">No outputs produced</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecipeList;
