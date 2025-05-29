import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})); // Allow empty body for requests processing all users
    const { username } = body; // Username is optional

    console.log(`ZERO RENT AMOUNT API: Received request for username: ${username || 'all relevant building owners'}`);

    const detectedProblems = await problemService.detectZeroRentPriceBuildings(username);
    // problemTitleToClear will be determined dynamically by saveProblems based on each problem's title

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

      // Iterate through each citizen and save their problems, grouped by specific title
      for (const citizenName in problemsGroupedByCitizen) {
        const citizenSpecificProblems = problemsGroupedByCitizen[citizenName];
        
        // Further group this citizen's problems by title
        const problemsByTitleForThisCitizen: Record<string, Record<string, any>> = {};
        Object.values(citizenSpecificProblems).forEach(problem => {
          if (!problemsByTitleForThisCitizen[problem.title]) {
            problemsByTitleForThisCitizen[problem.title] = {};
          }
          problemsByTitleForThisCitizen[problem.title][problem.problemId] = problem;
        });

        // Save problems for this citizen, one title group at a time
        for (const problemTitle in problemsByTitleForThisCitizen) {
          const problemsToSaveForTitle = problemsByTitleForThisCitizen[problemTitle];
          if (Object.keys(problemsToSaveForTitle).length > 0) {
            try {
              console.log(`ZERO RENT AMOUNT API: Saving ${Object.keys(problemsToSaveForTitle).length} problems with title "${problemTitle}" for citizen ${citizenName}.`);
              const count = await saveProblems(citizenName, problemsToSaveForTitle, problemTitle);
              totalSavedCount += count;
            } catch (error) {
              console.error(`Error saving "${problemTitle}" problems for citizen ${citizenName} to Airtable:`, error);
            }
          }
        }
      }
      saved = totalSavedCount > 0 || detectedProblemList.length === 0; // Consider saved if any problem was saved or if there were no problems to begin with.
    } else {
      console.log(`ZERO RENT AMOUNT API: No zero rent problems detected for ${username || 'all relevant building owners'}.`);
      if (username) {
        // If a specific username was provided and no problems were detected,
        // ensure any existing "Zero Rent" problems for that user are cleared for each specific title.
        const problemTitlesToClearForZeroRent = [
          "Zero Rent for Home",
          "Zero Rent for Leased Business"
        ];
        for (const titleToClear of problemTitlesToClearForZeroRent) {
          console.log(`ZERO RENT AMOUNT API: Ensuring old "${titleToClear}" problems are cleared for user ${username}.`);
          try {
            await saveProblems(username, {}, titleToClear);
          } catch (error) {
            console.error(`Error clearing old "${titleToClear}" problems for citizen ${username} from Airtable:`, error);
          }
        }
      }
      saved = true; 
    }

    return NextResponse.json({
      success: true,
      processedUser: username || 'all',
      problemType: "Zero Rent Amount (Home/Business)", // Generic type as multiple titles are handled
      problemCount: detectedProblemList.length,
      problems: detectedProblems,
      saved,
      savedCount: totalSavedCount
    });

  } catch (error) {
    console.error('Error in zero-rent-amount problems endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect or save "Zero Rent Amount" problems', details: error.message },
      { status: 500 }
    );
  }
}
