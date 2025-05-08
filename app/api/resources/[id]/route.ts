import { NextRequest, NextResponse } from 'next/server';
import { loadAllResources } from '@/lib/serverResourceUtils';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const id = params.id;
    const resources = await loadAllResources();
    const resource = resources.find(r => r.id === id);
    
    if (!resource) {
      return NextResponse.json(
        { error: `Resource with ID ${id} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(resource);
  } catch (error) {
    console.error(`Error loading resource: ${error}`);
    return NextResponse.json(
      { error: 'Failed to load resource' },
      { status: 500 }
    );
  }
}
