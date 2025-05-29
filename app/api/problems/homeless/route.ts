import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})); // Allow empty body for requests processing all users
    const { username } = body; // Username is optional

    console.log(`HOMELESS API: Received request for username: ${username || 'all citizens'}`);

    const problems = await problemService.detectHomelessCitizens(username);
    // problemTitleToClear will now be determined dynamically

    let saved = false;
    let savedCount = 0;
    const problemList = Object.values(problems);

    if (problemList.length > 0) {
      try {
        // Group all detected problems by citizen
        const allProblemsByCitizen: Record<string, Record<string, any>> = {};
        problemList.forEach(problem => {
          if (!allProblemsByCitizen[problem.citizen]) {
            allProblemsByCitizen[problem.citizen] = {};
          }
          allProblemsByCitizen[problem.citizen][problem.problemId] = problem;
        });

        // Iterate through each citizen who has problems
        for (const citizenName in allProblemsByCitizen) {
          const citizenSpecificProblems = allProblemsByCitizen[citizenName];
          
          // Further group this citizen's problems by title
          const problemsByTitleForThisCitizen: Record<string, Record<string, any>> = {};
          Object.values(citizenSpecificProblems).forEach(problem => {
            if (!problemsByTitleForThisCitizen[problem.title]) {
              problemsByTitleForThisCitizen[problem.title] = {};
            }
            problemsByTitleForThisCitizen[problem.title][problem.problemId] = problem;
          });

          // Save problems for this citizen, grouped by title
          for (const problemTitle in problemsByTitleForThisCitizen) {
            const problemsToSaveForTitle = problemsByTitleForThisCitizen[problemTitle];
            if (Object.keys(problemsToSaveForTitle).length > 0) {
              const count = await saveProblems(citizenName, problemsToSaveForTitle, problemTitle);
              savedCount += count;
            }
          }
        }
        saved = true;
      } catch (error) {
        console.error('Error saving homeless-related problems to Airtable:', error);
        // Continue to return detected problems even if saving fails
      }
    } else {
        console.log(`HOMELESS API: No homeless problems detected for ${username || 'all citizens'}.`);
    }

    return NextResponse.json({
      success: true,
      processedUser: username || 'all', // Indicates if request was for a specific user or all
      problemType: "Homeless Citizen and Related Impacts", // Generic type as multiple titles are handled
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
