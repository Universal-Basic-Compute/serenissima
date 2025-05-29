# La Serenissima: Merchant Empires

<p align="center">
  <img src="public/assets/images/serenissima-logo.png" alt="Serenissima Logo" width="400"/>
  <br>
  <em>Build your merchant dynasty in Renaissance Venice</em>
</p>

## About the Project

La Serenissima is a blockchain-powered interactive experience set in Renaissance Venice (1525), where players can purchase land parcels, establish noble identities, and participate in the vibrant economy of the Most Serene Republic. Using $COMPUTE as its in-game currency, the application allows for true ownership of digital assets while creating an authentic historical experience.

### Key Features

- **Historically Inspired Venice**: Experience the beauty and complexity of Venice during its golden age
- **Land Ownership**: Purchase and trade land parcels throughout the city
- **Noble Identity System**: Create your Venetian noble identity with family coat of arms and motto
- **$COMPUTE Integration**: Full blockchain economy with real value and ownership
- **Interactive 3D Environment**: Explore Venice with dynamic water effects and atmospheric elements
- **Multiple View Modes**: Land, Buildings, Transport, Resources, Contracts, and Governance
- **Economic Simulation**: Realistic land value and rent calculations based on historical factors
- **Airtable Integration**: Land data and economic calculations stored in Airtable for easy management

## Technology Stack

- **Frontend**: Next.js, React, Three.js, Tailwind CSS
- **Backend**: FastAPI (Python), Node.js
- **Blockchain**: Solana (for $COMPUTE integration)
- **AI Integration**: For coat of arms generation and historical content
- **Database**: Airtable (land data, economic calculations, citizen profiles)
- **3D Rendering**: Three.js with custom shaders and effects

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+ (for backend)
- Git
- Solana wallet (Phantom recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/la-serenissima.git
   cd la-serenissima
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration including:
   # - AIRTABLE_API_KEY
   # - AIRTABLE_BASE_ID
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. In a separate terminal, set up the backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   python -m app.main
   ```

6. Open [http://localhost:3000](http://localhost:3000) to view the application

## Core Mechanics

### Land System

Land in La Serenissima is divided into parcels across Venice's historical districts. Each parcel has:
- Unique identifier
- Historical significance
- Owner information
- Customizable properties

### Noble Identity

Create your Venetian noble identity:
- Choose or generate a Venetian name
- Design your family coat of arms
- Craft a family motto
- Select your family color for the map

### Economy & Transactions

The economy features:
- $COMPUTE token as the primary currency
- Land transactions between citizens
- Token deposits and withdrawals via Solana
- Transaction history and marketplace

### 3D Visualization

The application offers multiple view modes:
- Land ownership visualization with family colors
- Building and infrastructure view
- Transport network view
- Resource distribution
- Contract activity
- Governance structures

## Development Roadmap

- **Phase 1**: Land ownership and noble identity system (Current)
- **Phase 2**: Enhanced marketplace and economic features
- **Phase 3**: Building construction and customization
- **Phase 4**: Social systems and governance mechanics

## Contributing

We welcome contributions from the community! Please check out our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- The $COMPUTE and Universal Basic Compute team
- Historical references from Venetian archives and historical texts
- All contributors and community members

---

<p align="center">
  <img src="public/assets/images/ubc-logo.png" alt="UBC Logo" width="200"/>
  <br>
  <em>Powered by Universal Basic Compute</em>
</p>
