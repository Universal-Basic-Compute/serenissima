'use client';

import GovernancePanel from '@/components/UI/GovernancePanel';
import { useRouter } from 'next/navigation';

export default function GovernancePage() {
  const router = useRouter();
  
  return (
    <GovernancePanel 
      onClose={() => router.push('/')}
      standalone={true}
    />
  );
}
