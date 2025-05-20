import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})); // Allow empty body for requests processing all users
    const { username } = body; // Username is optional

    console.log(`HOMELESS API: Received request for username: ${username || 'all citizens'}`);

    const problems = await problemService.detectHomelessCitizens(username);
    const problemTitleToClear = "Homeless Citizen";

    let saved = false;
    let savedCount = 0;
    const problemList = Object.values(problems);

    if (problemList.length > 0) {
      try {
        if (username) {
          // If a specific username is provided, problems will already be filtered by detectHomelessCitizens.
          // We just need to ensure 'problems' object contains only this user's issues if any.
          if (Object.keys(problems).length > 0) { // Ensure problems object is not empty
             savedCount = await saveProblems(username, problems, problemTitleToClear);
          }
        } else {
          // Process for all citizens for whom problems were detected
          const problemsByCitizen: Record<string, Record<string, any>> = {};
          problemList.forEach(problem => {
            if (!problemsByCitizen[problem.citizen]) {
              problemsByCitizen[problem.citizen] = {};
            }
            problemsByCitizen[problem.citizen][problem.problemId] = problem;
          });

          for (const citizenName in problemsByCitizen) {
            const count = await saveProblems(citizenName, problemsByCitizen[citizenName], problemTitleToClear);
            savedCount += count;
          }
        }
        saved = true;
      } catch (error) {
        console.error('Error saving homeless problems to Airtable:', error);
        // Continue to return detected problems even if saving fails
      }
    } else {
        console.log(`HOMELESS API: No homeless problems detected for ${username || 'all citizens'}.`);
    }

    return NextResponse.json({
      success: true,
      processedUser: username || 'all', // Indicates if request was for a specific user or all
      problemType: problemTitleToClear,
      problemCount: problemList.length, // Total problems detected based on the scope (user or all)
      problems, // The actual problem objects detected
      saved,
      savedCount
    });

  } catch (error) {
    console.error('Error in homeless problems endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect or save homeless problems', details: error.message },
      { status: 500 }
    );
  }
}
