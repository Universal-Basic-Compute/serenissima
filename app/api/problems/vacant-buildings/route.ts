import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/services/ProblemService';
import { saveProblems } from '@/lib/utils/problemUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})); // Allow empty body for requests processing all users
    const { username } = body; // Username is optional

    console.log(`VACANT BUILDINGS API: Received request for username: ${username || 'all owners'}`);

    // Detect vacant buildings (homes or businesses)
    // This will return problems with titles "Vacant Home" or "Vacant Business"
    const allDetectedProblems = await problemService.detectVacantBuildings(username);
    
    let saved = false;
    let totalSavedCount = 0;
    const detectedProblemList = Object.values(allDetectedProblems);

    if (detectedProblemList.length > 0) {
      // Group problems by citizen (owner) and then by problem title
      const problemsGroupedByCitizenAndTitle: Record<string, Record<string, Record<string, any>>> = {};

      detectedProblemList.forEach(problem => {
        const citizen = problem.citizen;
        const title = problem.title;
        if (!problemsGroupedByCitizenAndTitle[citizen]) {
          problemsGroupedByCitizenAndTitle[citizen] = {};
        }
        if (!problemsGroupedByCitizenAndTitle[citizen][title]) {
          problemsGroupedByCitizenAndTitle[citizen][title] = {};
        }
        problemsGroupedByCitizenAndTitle[citizen][title][problem.problemId] = problem;
      });

      // Iterate through each citizen and then each problem title for that citizen
      for (const citizenName in problemsGroupedByCitizenAndTitle) {
        const titlesForCitizen = problemsGroupedByCitizenAndTitle[citizenName];
        for (const problemTitle in titlesForCitizen) {
          const problemsToSave = titlesForCitizen[problemTitle];
          if (Object.keys(problemsToSave).length > 0) {
            try {
              console.log(`VACANT BUILDINGS API: Saving ${Object.keys(problemsToSave).length} problems with title "${problemTitle}" for citizen ${citizenName}.`);
              const count = await saveProblems(citizenName, problemsToSave, problemTitle);
              totalSavedCount += count;
            } catch (error) {
              console.error(`Error saving "${problemTitle}" problems for citizen ${citizenName} to Airtable:`, error);
              // Continue to attempt saving other problem groups
            }
          }
        }
      }
      saved = totalSavedCount > 0 || detectedProblemList.length === 0; // Consider saved if any problem was saved or no problem to save
    } else {
      console.log(`VACANT BUILDINGS API: No vacant building problems detected for ${username || 'all owners'}.`);
      saved = true; // No problems to save, so operation is 'successful' in terms of saving
    }

    return NextResponse.json({
      success: true,
      processedUser: username || 'all', // Indicates if request was for a specific user or all
      problemType: "Vacant Buildings (Home/Business)", // Generic type as multiple titles are handled
      problemCount: detectedProblemList.length, // Total problems detected
      problems: allDetectedProblems, // The actual problem objects detected
      saved,
      savedCount: totalSavedCount
    });

  } catch (error) {
    console.error('Error in vacant buildings problems endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect or save vacant building problems', details: error.message },
      { status: 500 }
    );
  }
}
