import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})); // Allow empty body
    const { username } = body; // Username is optional

    console.log(`NO ACTIVE CONTRACTS API: Received request for username: ${username || 'all relevant business owners'}`);

    const detectedProblems = await problemService.detectNoActiveContractsForBusinesses(username);
    const problemTitleToClear = "No Active Contracts";

    let saved = false;
    let totalSavedCount = 0;
    const detectedProblemList = Object.values(detectedProblems);

    if (detectedProblemList.length > 0) {
      // Group problems by citizen (owner)
      const problemsGroupedByCitizen: Record<string, Record<string, any>> = {};
      detectedProblemList.forEach(problem => {
        const citizen = problem.citizen;
        if (!problemsGroupedByCitizen[citizen]) {
          problemsGroupedByCitizen[citizen] = {};
        }
        problemsGroupedByCitizen[citizen][problem.problemId] = problem;
      });

      // Iterate through each citizen and save their "No Active Contracts" problems
      for (const citizenName in problemsGroupedByCitizen) {
        const problemsToSave = problemsGroupedByCitizen[citizenName];
        if (Object.keys(problemsToSave).length > 0) {
          try {
            console.log(`NO ACTIVE CONTRACTS API: Saving ${Object.keys(problemsToSave).length} problems with title "${problemTitleToClear}" for citizen ${citizenName}.`);
            const count = await saveProblems(citizenName, problemsToSave, problemTitleToClear);
            totalSavedCount += count;
          } catch (error) {
            console.error(`Error saving "${problemTitleToClear}" problems for citizen ${citizenName} to Airtable:`, error);
          }
        }
      }
      saved = totalSavedCount > 0 || detectedProblemList.length === 0;
    } else {
      console.log(`NO ACTIVE CONTRACTS API: No problems detected for ${username || 'all relevant business owners'}.`);
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
    console.error('Error in no-active-contracts problems endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect or save "No Active Contracts" problems', details: error.message },
      { status: 500 }
    );
  }
}
