import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})); // Allow empty body
    const { username } = body; // Username is optional

    console.log(`ZERO WAGES BUSINESS API: Received request for username: ${username || 'all relevant business operators'}`);

    const detectedProblems = await problemService.detectZeroWagesBusinesses(username);
    const problemTitleToClear = "Zero Wages for Business"; // Specific title for this problem type

    let saved = false;
    let totalSavedCount = 0;
    const detectedProblemList = Object.values(detectedProblems);

    if (detectedProblemList.length > 0) {
      // Group problems by citizen (RunBy)
      const problemsGroupedByCitizen: Record<string, Record<string, any>> = {};
      detectedProblemList.forEach(problem => {
        const citizen = problem.citizen; // This is the RunBy citizen
        if (!problemsGroupedByCitizen[citizen]) {
          problemsGroupedByCitizen[citizen] = {};
        }
        problemsGroupedByCitizen[citizen][problem.problemId] = problem;
      });

      // Iterate through each citizen and save their "Zero Wages for Business" problems
      for (const citizenName in problemsGroupedByCitizen) {
        const problemsToSave = problemsGroupedByCitizen[citizenName];
        // Since all problems from this detector have the same title, we don't need to group by title further here.
        if (Object.keys(problemsToSave).length > 0) {
          try {
            console.log(`ZERO WAGES BUSINESS API: Saving ${Object.keys(problemsToSave).length} problems with title "${problemTitleToClear}" for citizen ${citizenName}.`);
            const count = await saveProblems(citizenName, problemsToSave, problemTitleToClear);
            totalSavedCount += count;
          } catch (error) {
            console.error(`Error saving "${problemTitleToClear}" problems for citizen ${citizenName} to Airtable:`, error);
          }
        }
      }
      saved = totalSavedCount > 0 || detectedProblemList.length === 0;
    } else {
      console.log(`ZERO WAGES BUSINESS API: No problems detected for ${username || 'all relevant business operators'}.`);
      // If a specific username was provided and no problems were detected,
      // we should ensure any existing "Zero Wages for Business" problems for that user are cleared.
      // saveProblems handles clearing if problemsToSave is empty for that specific title & citizen.
      if (username) {
        console.log(`ZERO WAGES BUSINESS API: Ensuring old "${problemTitleToClear}" problems are cleared for user ${username}.`);
        try {
            await saveProblems(username, {}, problemTitleToClear);
        } catch (error) {
            console.error(`Error clearing old "${problemTitleToClear}" problems for citizen ${username} from Airtable:`, error);
        }
      }
      saved = true; 
    }

    return NextResponse.json({
      success: true,
      processedUser: username || 'all',
      problemType: problemTitleToClear,
      problemCount: detectedProblemList.length,
      problems: detectedProblems,
      saved,
      savedCount: totalSavedCount
    });

  } catch (error) {
    console.error('Error in zero-wages-business problems endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect or save "Zero Wages for Business" problems', details: error.message },
      { status: 500 }
    );
  }
}
