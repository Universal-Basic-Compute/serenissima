import { NextResponse } from 'next/server';
import { loadAllResources } from '@/lib/serverResourceUtils';

export async function GET() {
  try {
    const resources = await loadAllResources();
    return NextResponse.json(resources);
  } catch (error) {
    console.error('Error loading resources:', error);
    return NextResponse.json(
      { error: 'Failed to load resources' },
      { status: 500 }
    );
  }
}
