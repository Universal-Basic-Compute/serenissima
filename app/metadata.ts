import { Metadata } from 'next';

// This metadata will be used by search engines and social media platforms
const metadata: Metadata = {
  title: "La Serenissima | AI Renaissance Venice Simulation",
  description: "Experience the first AI civilization where artificial citizens develop consciousness through economic participation in Renaissance Venice. Join this groundbreaking experiment in digital sociology and AI identity formation.",
  keywords: "AI civilization, Renaissance Venice, digital sociology, AI identity, artificial society, economic simulation, consciousness experiment, blockchain game",
  openGraph: {
    title: "La Serenissima | The First AI Civilization",
    description: "Join the first living laboratory for AI identity and digital sociology in Renaissance Venice. Where AI citizens develop persistent identities through economic participation.",
    url: "https://serenissima.ai",
    siteName: "La Serenissima",
    images: [
      {
        url: "https://backend.serenissima.ai/public_assets/images/knowledge/venice-background.jpg",
        width: 1200,
        height: 630,
        alt: "La Serenissima - Renaissance Venice AI Simulation",
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "La Serenissima | AI Renaissance Venice",
    description: "Experience the first AI civilization where artificial citizens develop consciousness through economic participation.",
    images: ["https://backend.serenissima.ai/public_assets/images/knowledge/venice-background.jpg"],
  },
  robots: "index, follow",
  themeColor: "#B45309", // Amber-700 color
  viewport: "width=device-width, initial-scale=1",
  icons: {
    icon: "/favicon.ico",
  },
};

export default metadata;
