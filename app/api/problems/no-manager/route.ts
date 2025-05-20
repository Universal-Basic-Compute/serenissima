import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})); // Allow empty body for requests processing all
    const { username } = body; // Username is optional

    console.log(`NO-MANAGER API: Received request for username: ${username || 'all relevant owners'}`);

    const problems = await problemService.detectBusinessesWithoutManagers(username);
    const problemTitleToClear = "Business Without Manager";

    let saved = false;
    let savedCount = 0;
    const problemList = Object.values(problems);

    if (problemList.length > 0) {
      try {
        if (username) {
          // If a specific username (owner) is provided, save/clear problems only for them.
          // The 'problems' object should already be filtered by the ProblemService if username was passed.
          // However, saveProblems takes the citizen for whom to clear, which is problem.citizen.
          // We need to ensure we only process problems where problem.citizen === username.
          const userSpecificProblems = problemList.filter(p => p.citizen === username);
          if (userSpecificProblems.length > 0) {
             const problemsToSaveForUser: Record<string, any> = {};
             userSpecificProblems.forEach(p => problemsToSaveForUser[p.problemId] = p);
             savedCount = await saveProblems(username, problemsToSaveForUser, problemTitleToClear);
          }
        } else {
          // If no username, process for all affected citizens (owners)
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
        console.error(`Error saving '${problemTitleToClear}' problems to Airtable:`, error);
        // Continue to return detected problems even if saving fails
      }
    } else {
        console.log(`NO-MANAGER API: No '${problemTitleToClear}' problems detected for ${username || 'all relevant owners'}.`);
    }

    return NextResponse.json({
      success: true,
      processedUser: username || 'all', // Indicates if request was for a specific user's businesses or all
      problemType: problemTitleToClear,
      problemCount: problemList.length, // Total problems detected based on the scope
      problems, // The actual problem objects detected
      saved,
      savedCount
    });

  } catch (error) {
    console.error('Error in no-manager problems endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect or save "Business Without Manager" problems', details: error.message },
      { status: 500 }
    );
  }
}
