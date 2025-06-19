import type { Metadata } from 'next';
import ClientLayout from './layout';
import metadataConfig from './metadata';

export const metadata: Metadata = metadataConfig;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientLayout>{children}</ClientLayout>;
}
