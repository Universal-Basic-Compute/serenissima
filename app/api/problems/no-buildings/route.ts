import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function GET(request: NextRequest) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username') || searchParams.get('citizen');
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    
    // Detect lands with no buildings
    const problems = await problemService.detectLandsWithNoBuildings(username);
    
    // Return the problems data
    return NextResponse.json({
      success: true,
      username,
      problemCount: Object.keys(problems).length,
      problems
    });
    
  } catch (error) {
    console.error('Error detecting no buildings problems:', error);
    return NextResponse.json(
      { error: 'Failed to detect no buildings problems', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the username from the request body
    const body = await request.json();
    const { username } = body;
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }
    
    // Detect lands with no buildings
    const problems = await problemService.detectLandsWithNoBuildings(username);
    
    // Save to Airtable
    let saved = false;
    let savedCount = 0;
    
    try {
      savedCount = await saveProblems(username, problems);
      saved = true;
    } catch (error) {
      console.error('Error saving problems to Airtable:', error);
    }
    
    return NextResponse.json({
      success: true,
      username,
      problemCount: Object.keys(problems).length,
      problems,
      saved,
      savedCount
    });
    
  } catch (error) {
    console.error('Error detecting and saving no buildings problems:', error);
    return NextResponse.json(
      { error: 'Failed to detect and save no buildings problems', details: error.message },
      { status: 500 }
    );
  }
}
