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
    // Get the username from the request body (optional now)
    const body = await request.json();
    const { username } = body;
    
    // Detect lands with no buildings (for all lands if username is not provided)
    const problems = await problemService.detectLandsWithNoBuildings(username);
    
    // Add Center as Position for each problem
    for (const problemId in problems) {
      const problem = problems[problemId];
      // If the problem has a center field, stringify it and store as position
      if (problem.center) {
        problem.position = JSON.stringify(problem.center);
      }
    }
    
    // Save to Airtable
    let saved = false;
    let savedCount = 0;
    
    try {
      // If username is provided, save problems for that user only
      // Otherwise, save all problems
      if (username) {
        savedCount = await saveProblems(username, problems);
      } else {
        // Group problems by citizen
        const problemsByCitizen: Record<string, Record<string, any>> = {};
        
        for (const problemId in problems) {
          const problem = problems[problemId];
          const citizen = problem.citizen;
          
          if (!problemsByCitizen[citizen]) {
            problemsByCitizen[citizen] = {};
          }
          
          problemsByCitizen[citizen][problemId] = problem;
        }
        
        // Save problems for each citizen
        for (const citizen in problemsByCitizen) {
          const citizenProblems = problemsByCitizen[citizen];
          const count = await saveProblems(citizen, citizenProblems);
          savedCount += count;
        }
      }
      
      saved = true;
    } catch (error) {
      console.error('Error saving problems to Airtable:', error);
    }
    
    return NextResponse.json({
      success: true,
      username: username || 'all',
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
