import React from 'react';
import Image from 'next/image';
import { FaTimes, FaArrowRight, FaArrowLeft } from 'react-icons/fa';

interface ProjectPresentationProps {
  onClose: () => void;
}

const ProjectPresentation: React.FC<ProjectPresentationProps> = ({ onClose }) => {
  const [currentSection, setCurrentSection] = React.useState(0);
  const sections = [
    { id: 'intro', title: 'Serenissima: An Economic Experiment in Renaissance Venice' },
    { id: 'experiment', title: 'The Experiment' },
    { id: 'experience', title: 'The Player Experience' },
    { id: 'why-venice', title: 'Why Renaissance Venice?' },
    { id: 'ubc-community', title: 'For the UBC Community' },
    { id: 'compute', title: '$COMPUTE: The Lifeblood of Serenissima' },
    { id: 'approach', title: 'Our Experimental Approach' },
    { id: 'future', title: 'Where The Experiment Leads' },
    { id: 'join', title: 'Join The Experiment' },
    { id: 'next-steps', title: 'Next Steps in the Experiment' },
  ];

  const nextSection = () => {
    if (currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
    }
  };

  const prevSection = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const goToSection = (index: number) => {
    setCurrentSection(index);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col overflow-hidden">
      {/* Header with navigation */}
      <div className="flex justify-between items-center p-4 border-b border-amber-700 bg-gradient-to-r from-amber-900 to-amber-800">
        <div className="flex items-center">
          <Image 
            src="https://backend.serenissima.ai/public_assets/images/knowledge/venice-lion.png" 
            alt="Lion of Venice" 
            width={40} 
            height={40}
            className="mr-3"
          />
          <h2 className="text-2xl font-serif text-amber-300">
            Serenissima Project Presentation
          </h2>
        </div>
        <div className="flex items-center">
          <div className="hidden md:flex mr-6">
            {sections.map((section, index) => (
              <button
                key={section.id}
                onClick={() => goToSection(index)}
                className={`mx-1 w-2 h-2 rounded-full transition-all ${
                  currentSection === index 
                    ? 'bg-amber-400 w-4' 
                    : 'bg-amber-700 hover:bg-amber-600'
                }`}
                aria-label={`Go to section ${section.title}`}
              />
            ))}
          </div>
          <button 
            onClick={onClose}
            className="text-amber-300 hover:text-amber-100 transition-colors p-2 rounded-full hover:bg-amber-900/30"
            aria-label="Close presentation"
          >
            <FaTimes size={24} />
          </button>
        </div>
      </div>
      
      {/* Main content area */}
      <div className="flex-grow overflow-hidden relative">
        {/* Background image with overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="https://backend.serenissima.ai/public_assets/images/knowledge/venice-background.jpg"
            alt="Venice Background"
            fill
            style={{ objectFit: 'cover', objectPosition: 'center' }}
            quality={80}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70"></div>
        </div>
        
        {/* Content container */}
        <div className="relative z-10 h-full flex flex-col md:flex-row">
          {/* Section navigation for mobile */}
          <div className="md:hidden flex justify-between items-center p-4 bg-black/30">
            <button 
              onClick={prevSection} 
              disabled={currentSection === 0}
              className={`p-2 rounded-full ${
                currentSection === 0 ? 'text-amber-800' : 'text-amber-400 hover:bg-amber-900/50'
              }`}
            >
              <FaArrowLeft />
            </button>
            <span className="text-amber-300 font-serif">
              {currentSection + 1} / {sections.length}
            </span>
            <button 
              onClick={nextSection} 
              disabled={currentSection === sections.length - 1}
              className={`p-2 rounded-full ${
                currentSection === sections.length - 1 ? 'text-amber-800' : 'text-amber-400 hover:bg-amber-900/50'
              }`}
            >
              <FaArrowRight />
            </button>
          </div>
          
          {/* Left sidebar with section navigation (desktop) */}
          <div className="hidden md:block w-64 bg-black/40 border-r border-amber-900/50 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-amber-400 font-serif text-lg mb-4 border-b border-amber-900/50 pb-2">
                Presentation Sections
              </h3>
              <nav>
                <ul className="space-y-1">
                  {sections.map((section, index) => (
                    <li key={section.id}>
                      <button
                        onClick={() => goToSection(index)}
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${
                          currentSection === index
                            ? 'bg-amber-900/70 text-amber-200'
                            : 'text-amber-400 hover:bg-amber-900/30 hover:text-amber-300'
                        }`}
                      >
                        {index + 1}. {section.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
          
          {/* Main content */}
          <div className="flex-grow overflow-y-auto p-6 md:p-10">
            <div className="max-w-4xl mx-auto bg-black/60 backdrop-blur-sm rounded-lg border border-amber-900/30 p-6 md:p-8">
              {currentSection === 0 && (
                <div className="space-y-6 animate-fadeIn">
                  <h1 className="text-3xl md:text-4xl font-serif text-amber-300 mb-2">
                    Serenissima: An Economic Experiment in Renaissance Venice
                  </h1>
                  <h2 className="text-xl md:text-2xl font-serif text-amber-200 italic mb-8">
                    Beyond Gaming: A Living Laboratory for Digital Economics
                  </h2>
                  <div className="aspect-w-16 aspect-h-9 mb-8 rounded-lg overflow-hidden">
                    <Image
                      src="https://backend.serenissima.ai/public_assets/images/knowledge/presentation.jpg"
                      alt="Venice Grand Canal"
                      fill
                      style={{ objectFit: 'cover' }}
                      className="rounded-lg"
                    />
                  </div>
                  <p className="text-amber-100 text-lg">
                    Welcome to Serenissima, where the economic brilliance of Renaissance Venice meets 
                    the innovative potential of blockchain technology and artificial intelligence.
                  </p>
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={nextSection}
                      className="px-6 py-3 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded-lg flex items-center transition-colors"
                    >
                      Explore the Experiment <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 1 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    The Experiment
                  </h2>
                  <p className="text-amber-100 mb-4">
                    Serenissima isn't just another blockchain game. It's an experiment in creating meaningful economic interactions in digital space.
                  </p>
                  <p className="text-amber-100 mb-4">
                    We're asking fundamental questions:
                  </p>
                  <blockquote className="border-l-4 border-amber-500 pl-4 my-6">
                    <p className="text-xl text-amber-200 italic">
                      What if we built a digital economy that mirrors the complexity and interdependence of real commerce?
                    </p>
                  </blockquote>
                  <p className="text-amber-100 mb-4">
                    Renaissance Venice—the birthplace of modern banking, international trade networks, and sophisticated manufacturing—provides the perfect historical canvas for this experiment.
                  </p>
                  <p className="text-amber-100 mb-4">
                    By recreating Venice's economic systems within a blockchain framework, we're exploring how <span className="text-amber-300 font-medium">genuine economic value</span> can emerge from player interactions, AI behaviors, and historical authenticity.
                  </p>
                  <div className="flex justify-between mt-8">
                    <button
                      onClick={prevSection}
                      className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 rounded flex items-center transition-colors"
                    >
                      <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    <button
                      onClick={nextSection}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded flex items-center transition-colors"
                    >
                      Next <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 2 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    The Player Experience
                  </h2>
                  <div className="flex flex-col md:flex-row gap-6 mb-6">
                    <div className="md:w-1/2">
                      <p className="text-amber-100 mb-4">
                        Imagine yourself as a merchant in 15th century Venice:
                      </p>
                      <p className="text-amber-100 mb-4">
                        You begin with a modest plot of land in the outer districts. Using your initial $COMPUTE, you construct a simple workshop. As production begins, you navigate the complex web of suppliers, manufacturers, and merchants to find your niche.
                      </p>
                      <p className="text-amber-100 mb-4">
                        Perhaps you focus on the glass trade, establishing relationships with sand suppliers from the lagoon islands before transforming raw materials into delicate glassware sought by nobility across Europe.
                      </p>
                    </div>
                    <div className="md:w-1/2 rounded-lg overflow-hidden">
                      <Image
                        src="https://backend.serenissima.ai/public_assets/images/knowledge/venice-merchant.jpg"
                        alt="Venetian Merchant"
                        width={500}
                        height={300}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  </div>
                  <p className="text-amber-100 mb-4">
                    Or maybe you invest in property, carefully selecting locations with growth potential, constructing buildings that attract AI citizens who pay rent and staff local businesses.
                  </p>
                  <p className="text-amber-100 mb-4">
                    Your success isn't measured merely in $COMPUTE accumulated, but in your <span className="text-amber-300 font-medium">rising position in Venetian society</span>. From humble beginnings, you might eventually own a Grand Canal palazzo, participate in guild leadership, or even influence the Republic's governance.
                  </p>
                  <p className="text-amber-100 mb-4">
                    This isn't about grinding for tokens—it's about <span className="text-amber-300 font-medium">building something lasting</span> in a world where every economic decision ripples through an intricate system of supply, demand, and social capital.
                  </p>
                  <div className="flex justify-between mt-8">
                    <button
                      onClick={prevSection}
                      className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 rounded flex items-center transition-colors"
                    >
                      <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    <button
                      onClick={nextSection}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded flex items-center transition-colors"
                    >
                      Next <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 3 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    Why Renaissance Venice?
                  </h2>
                  <p className="text-amber-100 mb-6">
                    We didn't choose Renaissance Venice for its aesthetic beauty alone. We chose it because it offers something unique for our economic experiment:
                  </p>
                  
                  <div className="grid md:grid-cols-3 gap-6 mb-6">
                    <div className="bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Natural Scarcity</h3>
                      <p className="text-amber-100">
                        Emerges from the geographic reality of building on islands. Unlike games that artificially limit digital land, Venice's physical constraints create authentic value differentials—a Grand Canal frontage was genuinely more valuable than a back alley in Cannaregio.
                      </p>
                    </div>
                    
                    <div className="bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Complex Production</h3>
                      <p className="text-amber-100">
                        Venetian commerce was defined by interdependencies. Glass-making required specific sand from the lagoon, wood for fuel, and chemical additives sourced through trade networks. Silk production needed raw materials from the East, skilled labor, and specialized facilities.
                      </p>
                    </div>
                    
                    <div className="bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Visible Hierarchy</h3>
                      <p className="text-amber-100">
                        Social status was expressed through architecture and location. Your status was immediately apparent from where and how you lived, creating natural progression goals beyond simple wealth accumulation.
                      </p>
                    </div>
                  </div>
                  
                  <p className="text-amber-100">
                    These historical realities provide natural game mechanics that create depth without artificial complexity.
                  </p>
                  
                  <div className="flex justify-between mt-8">
                    <button
                      onClick={prevSection}
                      className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 rounded flex items-center transition-colors"
                    >
                      <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    <button
                      onClick={nextSection}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded flex items-center transition-colors"
                    >
                      Next <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 4 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    For the UBC Community
                  </h2>
                  <p className="text-amber-100 mb-6">
                    For the Universal Basic Compute community, Serenissima offers more than entertainment:
                  </p>
                  
                  <div className="space-y-5 mb-6">
                    <div className="flex items-start">
                      <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1">
                        <svg className="w-4 h-4 text-amber-100" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-serif text-amber-300 mb-1">A Practical Application</h3>
                        <p className="text-amber-100">
                          Of $COMPUTE in a context that demonstrates real utility beyond speculation. The token becomes the lifeblood of a functioning economy, not just a trading instrument.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1">
                        <svg className="w-4 h-4 text-amber-100" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-serif text-amber-300 mb-1">Meaningful Ownership</h3>
                        <p className="text-amber-100">
                          For early supporters. The initial plots offered to community members aren't merely speculative assets—they're productive elements in an economic system with genuine utility.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1">
                        <svg className="w-4 h-4 text-amber-100" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-serif text-amber-300 mb-1">Collaborative Value Creation</h3>
                        <p className="text-amber-100">
                          Rather than zero-sum competition. The interdependent nature of Venetian commerce means players benefit more from cooperation than pure competition, fostering community bonds.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1">
                        <svg className="w-4 h-4 text-amber-100" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-serif text-amber-300 mb-1">A Living Showcase</h3>
                        <p className="text-amber-100">
                          Of how AI, blockchain, and historical systems can converge into something greater than the sum of their parts. UBC's vision of meaningful AI integration comes to life in the autonomous citizens and adaptive systems of Venice.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-amber-100">
                    The UBC community isn't just an audience—they're <span className="text-amber-300 font-medium">co-creators</span> in this economic experiment, helping to shape how the systems evolve and grow.
                  </p>
                  
                  <div className="flex justify-between mt-8">
                    <button
                      onClick={prevSection}
                      className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 rounded flex items-center transition-colors"
                    >
                      <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    <button
                      onClick={nextSection}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded flex items-center transition-colors"
                    >
                      Next <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 5 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    $COMPUTE: The Lifeblood of Serenissima
                  </h2>
                  
                  <div className="bg-gradient-to-r from-amber-900/40 to-amber-800/40 p-6 rounded-lg border border-amber-700/50 mb-6">
                    <p className="text-amber-100 mb-4">
                      In Serenissima, $COMPUTE isn't an artificial reward token—it's the foundation of a functioning economy:
                    </p>
                    
                    <ul className="space-y-4">
                      <li className="flex items-start">
                        <span className="text-amber-400 mr-2">•</span>
                        <p className="text-amber-100">
                          <span className="text-amber-300 font-medium">Every ducat spent has purpose.</span> Whether invested in land, poured into construction, paid as wages, or collected as taxes, $COMPUTE flows through the system in economically meaningful ways.
                        </p>
                      </li>
                      
                      <li className="flex items-start">
                        <span className="text-amber-400 mr-2">•</span>
                        <p className="text-amber-100">
                          <span className="text-amber-300 font-medium">Value emerges organically</span> from the utility of what your tokens can purchase and maintain. A well-positioned building generating steady revenue has clear value beyond arbitrary scarcity.
                        </p>
                      </li>
                      
                      <li className="flex items-start">
                        <span className="text-amber-400 mr-2">•</span>
                        <p className="text-amber-100">
                          <span className="text-amber-300 font-medium">Economic activities create genuine utility.</span> Manufacturing glass, transporting goods, or providing banking services all contribute value to the ecosystem in ways that can be measured and rewarded.
                        </p>
                      </li>
                    </ul>
                  </div>
                  
                  <div className="flex items-center justify-center mb-6">
                    <div className="w-16 h-16 bg-amber-700 rounded-full flex items-center justify-center mr-4">
                      <span className="text-2xl font-bold text-amber-100">$</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-amber-100 text-lg">
                        For $COMPUTE holders, Serenissima provides a context where their tokens connect directly to productive assets in a dynamic economy—<span className="text-amber-300 font-medium">transforming digital currency into economic agency.</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex justify-between mt-8">
                    <button
                      onClick={prevSection}
                      className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 rounded flex items-center transition-colors"
                    >
                      <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    <button
                      onClick={nextSection}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded flex items-center transition-colors"
                    >
                      Next <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 6 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    Our Experimental Approach
                  </h2>
                  
                  <p className="text-amber-100 mb-6">
                    Serenissima is being developed with a methodical, experimental approach:
                  </p>
                  
                  <div className="space-y-6 mb-6">
                    <div className="bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Phase 1: Foundation</h3>
                      <p className="text-amber-100">
                        We're building the geographic foundation of Venice with historically accurate land parcels. This phase establishes the core systems for land ownership, basic economic transactions, and the initial integration of $COMPUTE.
                      </p>
                    </div>
                    
                    <div className="bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Phase 2: Economic Infrastructure</h3>
                      <p className="text-amber-100">
                        Introduction of buildings, roads, and transportation networks. This phase will establish the physical infrastructure that supports economic activity, along with the initial implementation of rent and income mechanics.
                      </p>
                    </div>
                    
                    <div className="bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Phase 3: Production & Trade</h3>
                      <p className="text-amber-100">
                        Implementation of resource gathering, manufacturing, and trade systems. This phase introduces the complex interdependencies that made Venetian commerce so fascinating, with supply chains spanning multiple players and AI agents.
                      </p>
                    </div>
                    
                    <div className="bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Phase 4: Social & Political Systems</h3>
                      <p className="text-amber-100">
                        Introduction of guilds, governance mechanisms, and social hierarchies. This phase completes the experiment by adding the social and political dimensions that influenced economic activity in Renaissance Venice.
                      </p>
                    </div>
                  </div>
                  
                  <p className="text-amber-100">
                    Throughout each phase, we're carefully observing how players interact with the systems, making adjustments to ensure both historical authenticity and engaging gameplay.
                  </p>
                  
                  <div className="flex justify-between mt-8">
                    <button
                      onClick={prevSection}
                      className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 rounded flex items-center transition-colors"
                    >
                      <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    <button
                      onClick={nextSection}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded flex items-center transition-colors"
                    >
                      Next <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 7 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    Where The Experiment Leads
                  </h2>
                  
                  <p className="text-amber-100 mb-6">
                    The long-term vision for Serenissima extends beyond a single virtual world:
                  </p>
                  
                  <div className="flex flex-col md:flex-row gap-6 mb-6">
                    <div className="md:w-1/2 bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Economic Research</h3>
                      <p className="text-amber-100">
                        Serenissima will generate valuable data on how digital economies function, potentially informing real-world economic policies and blockchain implementations. The controlled environment allows us to observe economic principles in action without real-world consequences.
                      </p>
                    </div>
                    
                    <div className="md:w-1/2 bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">AI Integration</h3>
                      <p className="text-amber-100">
                        As AI citizens become more sophisticated, Serenissima will serve as a testbed for how artificial intelligence can participate meaningfully in economic systems. These AI agents will evolve from simple NPCs to complex economic actors with their own goals and strategies.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-6 mb-6">
                    <div className="md:w-1/2 bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Educational Platform</h3>
                      <p className="text-amber-100">
                        The historically accurate systems provide an immersive way to understand Renaissance economics and Venetian history. We envision partnerships with educational institutions to use Serenissima as a teaching tool for economic principles and historical understanding.
                      </p>
                    </div>
                    
                    <div className="md:w-1/2 bg-amber-900/30 p-5 rounded-lg border border-amber-800/50">
                      <h3 className="text-xl font-serif text-amber-300 mb-3">Blockchain Innovation</h3>
                      <p className="text-amber-100">
                        The integration of $COMPUTE demonstrates how tokens can have genuine utility beyond speculation. This model could influence how other blockchain projects approach token economics and utility design in the future.
                      </p>
                    </div>
                  </div>
                  
                  <p className="text-amber-100">
                    By creating a functioning digital economy with historical authenticity, we're building more than a game—we're creating a laboratory for understanding how economies work and how they might evolve in digital spaces.
                  </p>
                  
                  <div className="flex justify-between mt-8">
                    <button
                      onClick={prevSection}
                      className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 rounded flex items-center transition-colors"
                    >
                      <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    <button
                      onClick={nextSection}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded flex items-center transition-colors"
                    >
                      Next <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 8 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    Join The Experiment
                  </h2>
                  
                  <p className="text-amber-100 mb-6">
                    Serenissima is more than a project—it's a community of pioneers exploring the frontier of digital economics:
                  </p>
                  
                  <div className="bg-gradient-to-r from-amber-900/40 to-amber-800/40 p-6 rounded-lg border border-amber-700/50 mb-6">
                    <h3 className="text-xl font-serif text-amber-300 mb-4">How to Participate</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-start">
                        <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1 flex-shrink-0">
                          <span className="text-amber-100 font-bold">1</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-serif text-amber-300 mb-1">Connect Your Wallet</h4>
                          <p className="text-amber-100">
                            Link your wallet to establish your identity in Serenissima and access your $COMPUTE tokens.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start">
                        <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1 flex-shrink-0">
                          <span className="text-amber-100 font-bold">2</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-serif text-amber-300 mb-1">Acquire Land</h4>
                          <p className="text-amber-100">
                            Purchase your first plot of land in Venice. Consider location carefully—just as in the real Renaissance, where you establish yourself matters.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start">
                        <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1 flex-shrink-0">
                          <span className="text-amber-100 font-bold">3</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-serif text-amber-300 mb-1">Engage With the Community</h4>
                          <p className="text-amber-100">
                            Join our Discord to connect with other participants, share strategies, and influence the development of Serenissima through community feedback.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start">
                        <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1 flex-shrink-0">
                          <span className="text-amber-100 font-bold">4</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-serif text-amber-300 mb-1">Experiment & Build</h4>
                          <p className="text-amber-100">
                            As new features are released, be among the first to experiment with them and help shape how they evolve.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-center mb-6">
                    <button className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-amber-100 rounded-lg flex items-center transition-colors">
                      Connect Wallet & Begin
                    </button>
                  </div>
                  
                  <p className="text-amber-100 text-center">
                    By joining now, you're not just playing a game—you're helping to shape the future of digital economics.
                  </p>
                  
                  <div className="flex justify-between mt-8">
                    <button
                      onClick={prevSection}
                      className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 rounded flex items-center transition-colors"
                    >
                      <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    <button
                      onClick={nextSection}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded flex items-center transition-colors"
                    >
                      Next <FaArrowRight className="ml-2" />
                    </button>
                  </div>
                </div>
              )}
              
              {currentSection === 9 && (
                <div className="space-y-6 animate-fadeIn">
                  <h2 className="text-2xl md:text-3xl font-serif text-amber-300 mb-4">
                    Next Steps in the Experiment
                  </h2>
                  
                  <p className="text-amber-100 mb-6">
                    The immediate roadmap for Serenissima focuses on expanding the economic foundations:
                  </p>
                  
                  <div className="space-y-6 mb-6">
                    <div className="flex items-start">
                      <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1">
                        <svg className="w-4 h-4 text-amber-100" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-serif text-amber-300 mb-1">Building System</h3>
                        <p className="text-amber-100">
                          The next major update will introduce the ability to construct buildings on your land. Different building types will serve various economic functions, from workshops that produce goods to residences that generate rent.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1">
                        <svg className="w-4 h-4 text-amber-100" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-serif text-amber-300 mb-1">Transportation Network</h3>
                        <p className="text-amber-100">
                          Roads, bridges, and water transportation will connect the islands of Venice, creating a network that influences property values and enables the movement of goods and people.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1">
                        <svg className="w-4 h-4 text-amber-100" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-serif text-amber-300 mb-1">Resource System</h3>
                        <p className="text-amber-100">
                          Introduction of basic resources and the ability to transform them into valuable goods. This will establish the foundation for the complex supply chains that characterized Venetian commerce.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1">
                        <svg className="w-4 h-4 text-amber-100" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-serif text-amber-300 mb-1">AI Population</h3>
                        <p className="text-amber-100">
                          The introduction of AI citizens who will inhabit your buildings, work in your businesses, and create demand for goods and services. These citizens will bring Venice to life and drive economic activity.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-amber-100 text-center">
                    Each of these systems will be released incrementally, with community feedback shaping their development and integration.
                  </p>
                  
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={() => setCurrentSection(0)}
                      className="px-6 py-3 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded-lg flex items-center transition-colors"
                    >
                      Return to Start
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer with navigation */}
      <div className="hidden md:flex justify-between items-center p-4 border-t border-amber-700 bg-gradient-to-r from-amber-900 to-amber-800">
        <button
          onClick={prevSection}
          disabled={currentSection === 0}
          className={`px-4 py-2 rounded flex items-center transition-colors ${
            currentSection === 0 
              ? 'bg-amber-900/30 text-amber-700 cursor-not-allowed' 
              : 'bg-amber-800 hover:bg-amber-700 text-amber-200'
          }`}
        >
          <FaArrowLeft className="mr-2" /> Previous Section
        </button>
        
        <div className="text-amber-300 font-serif">
          {currentSection + 1} of {sections.length}
        </div>
        
        <button
          onClick={nextSection}
          disabled={currentSection === sections.length - 1}
          className={`px-4 py-2 rounded flex items-center transition-colors ${
            currentSection === sections.length - 1 
              ? 'bg-amber-900/30 text-amber-700 cursor-not-allowed' 
              : 'bg-amber-700 hover:bg-amber-600 text-amber-100'
          }`}
        >
          Next Section <FaArrowRight className="ml-2" />
        </button>
      </div>
    </div>
  );
};

export default ProjectPresentation;
