import { NextResponse } from 'next/server';
import Airtable, { FieldSet, Records } from 'airtable';

// Initialize Airtable client
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_MESSAGES_TABLE = process.env.AIRTABLE_MESSAGES_TABLE || 'MESSAGES';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error('Airtable API key or Base ID is not configured in environment variables.');
}

const airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 60000 }).base(AIRTABLE_BASE_ID); // Increased timeout to 60s
const messagesTable = airtableBase(AIRTABLE_MESSAGES_TABLE);

interface AirtableMessageRecord extends FieldSet {
  MessageId: string;
  Sender: string; // Assuming Sender stores Username directly as string
  Receiver: string; // Changed from Recipient
  Content: string;
  Type: string;
  CreatedAt: string;
}

interface Thought {
  messageId: string;
  citizenUsername: string;
  originalContent: string;
  mainThought: string;
  createdAt: string;
}

// Helper function to extract main thought
function extractMainThought(content: string): string {
  if (!content) {
    return "";
  }

  const MIN_LENGTH = 20;
  const MAX_LENGTH = 400;

  let potentialThoughts: string[] = [];

  // 1. Check for bolded sentence
  const boldRegex = /\*\*(.*?)\*\*/; // Non-greedy match for content within **...**
  const boldMatch = content.match(boldRegex);
  let boldSentence: string | null = null;

  if (boldMatch && boldMatch[1]) {
    boldSentence = boldMatch[1].trim();
    if (boldSentence.length >= MIN_LENGTH && boldSentence.length <= MAX_LENGTH) {
      return boldSentence; // Ideal case: bold and good length
    }
    // If bold sentence is not ideal length, add it as a fallback
    potentialThoughts.push(boldSentence);
  }

  // 2. Get all sentences and filter by length
  const allSentences = content
    .split(/(?<=[.!?])(?=\s|$)/) // Split after punctuation if followed by space or end of string
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0);

  const goodLengthSentences = allSentences.filter(
    s => s.length >= MIN_LENGTH && s.length <= MAX_LENGTH
  );

  if (goodLengthSentences.length > 0) {
    // Prefer non-bold good length sentences if bold one was not ideal
    const nonBoldGoodLength = goodLengthSentences.filter(s => s !== boldSentence);
    if (nonBoldGoodLength.length > 0) {
      return nonBoldGoodLength[Math.floor(Math.random() * nonBoldGoodLength.length)];
    }
    // If only bold sentence had good length (and it was already returned), or all good length are bold
    return goodLengthSentences[Math.floor(Math.random() * goodLengthSentences.length)];
  }

  // 3. Fallback logic if no sentence met the length criteria
  // Add all sentences as potential thoughts if not already added (e.g. boldSentence)
  allSentences.forEach(s => {
    if (!potentialThoughts.includes(s)) {
      potentialThoughts.push(s);
    }
  });
  
  if (potentialThoughts.length === 0 && content.trim().length > 0) {
    // If splitting sentences failed but there's content, use the whole content as a thought
    potentialThoughts.push(content.trim());
  }


  if (potentialThoughts.length > 0) {
    // If we have any potential thoughts (e.g. original bold, or any other sentence)
    // pick one at random from the collected ones.
    return potentialThoughts[Math.floor(Math.random() * potentialThoughts.length)];
  }
  
  // Absolute fallback: return trimmed content if all else fails
  return content.trim();
}

export async function GET() {
  try {
    console.log('[API GetThoughts] Fetching thoughts...');

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const records: Records<FieldSet> = await messagesTable
      .select({
        // Filter for types 'thought_log', 'unguided_run_log', 'autonomous_run_log' and created in the last 24 hours
        // Formula for comparing dates: IS_AFTER({FieldName}, 'YYYY-MM-DDTHH:mm:ssZ')
        // It's often more reliable to fetch records for the type and then filter date/sender=recipient in code,
        // especially if Sender/Recipient are linked records.
        // However, constructing a robust date filter for Airtable:
        filterByFormula: `AND(OR({Type} = 'thought_log', {Type} = 'unguided_run_log', {Type} = 'autonomous_run_log'), IS_AFTER({CreatedAt}, '${twentyFourHoursAgo}'))`,
        fields: ['MessageId', 'Sender', 'Receiver', 'Content', 'Type', 'CreatedAt'], // Changed Recipient to Receiver
        sort: [{ field: 'CreatedAt', direction: 'desc' }],
      })
      .all();

    console.log(`[API GetThoughts] Fetched ${records.length} relevant log records from the last 24 hours.`);

    const thoughts: Thought[] = [];

    for (const record of records) {
      const fields = record.fields as AirtableMessageRecord; // Assert type here

      // Removed filter for Sender === Recipient
      // Now processes all 'thought_log' messages from the last 24 hours
      if (fields.Content && fields.Sender) { // Ensure Content and Sender exist
        const mainThought = extractMainThought(fields.Content);
        thoughts.push({
          messageId: fields.MessageId || record.id, // Use MessageId if available, else Airtable record ID
          citizenUsername: fields.Sender, // Sender is the citizen who had the thought
          originalContent: fields.Content,
          mainThought: mainThought,
          createdAt: fields.CreatedAt,
        });
      }
    }

    console.log(`[API GetThoughts] Processed ${thoughts.length} thoughts.`);

    // Randomize the order of thoughts using Fisher-Yates shuffle
    for (let i = thoughts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [thoughts[i], thoughts[j]] = [thoughts[j], thoughts[i]];
    }

    console.log('[API GetThoughts] Randomized the order of thoughts.');

    return NextResponse.json({ success: true, thoughts });

  } catch (error: any) {
    console.error('[API GetThoughts] Error fetching thoughts:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch thoughts' },
      { status: 500 }
    );
  }
}
