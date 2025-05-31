import { NextResponse } from 'next/server';
import Airtable, { FieldSet, Records } from 'airtable';

// Initialize Airtable client
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_MESSAGES_TABLE = process.env.AIRTABLE_MESSAGES_TABLE || 'MESSAGES';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error('Airtable API key or Base ID is not configured in environment variables.');
}

const airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const messagesTable = airtableBase(AIRTABLE_MESSAGES_TABLE);

interface AirtableMessageRecord extends FieldSet {
  MessageId: string;
  Sender: string;
  Receiver: string;
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

// Helper function to extract main thought (similar to the one in /api/get-thoughts)
function extractMainThought(content: string): string {
  if (!content) {
    return "";
  }
  const MIN_LENGTH = 20;
  const MAX_LENGTH = 400;
  let potentialThoughts: string[] = [];
  const boldRegex = /\*\*(.*?)\*\*/; // Non-greedy match for content within **...**
  const boldMatch = content.match(boldRegex);
  let boldSentence: string | null = null;

  if (boldMatch && boldMatch[1]) {
    boldSentence = boldMatch[1].trim();
    if (boldSentence.length >= MIN_LENGTH && boldSentence.length <= MAX_LENGTH) {
      return boldSentence; // Ideal case: bold and good length
    }
    potentialThoughts.push(boldSentence);
  }

  const allSentences = content
    .split(/(?<=[.!?])(?=\s|$)/) // Split after punctuation if followed by space or end of string
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0);

  const goodLengthSentences = allSentences.filter(
    s => s.length >= MIN_LENGTH && s.length <= MAX_LENGTH
  );

  if (goodLengthSentences.length > 0) {
    const nonBoldGoodLength = goodLengthSentences.filter(s => s !== boldSentence);
    if (nonBoldGoodLength.length > 0) {
      return nonBoldGoodLength[Math.floor(Math.random() * nonBoldGoodLength.length)];
    }
    return goodLengthSentences[Math.floor(Math.random() * goodLengthSentences.length)];
  }

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
    return potentialThoughts[Math.floor(Math.random() * potentialThoughts.length)];
  }
  return content.trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const citizenUsername = searchParams.get('citizenUsername');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 5; // Default limit to 5

    if (!citizenUsername) {
      return NextResponse.json(
        { success: false, error: 'citizenUsername parameter is required' },
        { status: 400 }
      );
    }

    console.log(`[API Thoughts] Fetching thoughts for citizen: ${citizenUsername}, limit: ${limit}`);

    const records: Records<FieldSet> = await messagesTable
      .select({
        filterByFormula: `AND(OR({Type} = 'thought_log', {Type} = 'unguided_run_log'), {Sender} = '${citizenUsername}')`,
        fields: ['MessageId', 'Sender', 'Receiver', 'Content', 'Type', 'CreatedAt'], // Ensure all needed fields are fetched
        sort: [{ field: 'CreatedAt', direction: 'desc' }],
        maxRecords: limit 
      })
      .all();

    console.log(`[API Thoughts] Fetched ${records.length} thought_log records for ${citizenUsername}.`);

    const thoughts: Thought[] = records.map(record => {
      const fields = record.fields as AirtableMessageRecord;
      const mainThought = extractMainThought(fields.Content || ""); // Ensure content is passed, default to empty string
      return {
        messageId: fields.MessageId || record.id,
        citizenUsername: fields.Sender,
        originalContent: fields.Content || "",
        mainThought: mainThought,
        createdAt: fields.CreatedAt,
      };
    });
    
    console.log(`[API Thoughts] Processed ${thoughts.length} thoughts for ${citizenUsername}.`);

    return NextResponse.json({ success: true, thoughts });

  } catch (error: any) {
    console.error('[API Thoughts] Error fetching thoughts:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch thoughts' },
      { status: 500 }
    );
  }
}
