import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})); // Allow empty body
    const { username } = body; // Username is optional

    console.log(`WORKLESS API: Received request for username: ${username || 'all citizens'}`);

    // Pass a list of social classes to exclude. For now, just "Nobili".
    // problemService.detectWorklessCitizens will need to be updated to accept this.
    // Assuming problemService is updated to handle an optional array of excluded social classes.
    const excludedSocialClasses = ["Nobili"];
    const problems = await problemService.detectWorklessCitizens(username, excludedSocialClasses);
    const problemTitleToClear = "Workless Citizen";

    let saved = false;
    let savedCount = 0;
    const problemList = Object.values(problems);

    if (problemList.length > 0) {
      try {
        if (username) {
          if (Object.keys(problems).length > 0) {
            savedCount = await saveProblems(username, problems, problemTitleToClear);
          }
        } else {
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
        console.error('Error saving workless problems to Airtable:', error);
      }
    } else {
        console.log(`WORKLESS API: No workless problems detected for ${username || 'all citizens'}.`);
    }

    return NextResponse.json({
      success: true,
      processedUser: username || 'all',
      problemType: problemTitleToClear,
      problemCount: problemList.length,
      problems,
      saved,
      savedCount
    });

  } catch (error) {
    console.error('Error in workless problems endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect or save workless problems', details: error.message },
      { status: 500 }
    );
  }
}
