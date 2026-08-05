import { NextRequest } from 'next/server';
import { serveLegacyAsset } from '@/lib/utils/legacyAssetMirrorProxy';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return serveLegacyAsset('/public/assets', params.path);
}
