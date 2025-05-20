import { NextResponse, NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_MESSAGES_TABLE = process.env.AIRTABLE_MESSAGES_TABLE || 'MESSAGES';
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS'; // Assuming 'CITIZENS' is the table name

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  Airtable.configure({ apiKey: AIRTABLE_API_KEY });
  return Airtable.base(AIRTABLE_BASE_ID);
};

interface CitizenFromAirtable {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImageUrl?: string | null;
}

interface CitizenWithStats extends CitizenFromAirtable {
  lastMessageTimestamp: string | null;
  unreadMessagesFromCitizenCount: number;
}

export async function POST(request: NextRequest) {
  try {
    const { currentCitizenUsername } = await request.json();

    if (!currentCitizenUsername) {
      return NextResponse.json(
        { success: false, error: 'currentCitizenUsername is required' },
        { status: 400 }
      );
    }

    const base = initAirtable();
    let citizensWithStats: CitizenWithStats[] = [];

    // 1. Fetch all citizens from the CITIZENS table
    const citizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Username', 'FirstName', 'LastName', 'CoatOfArmsImageUrl'], // Corrected field name
        filterByFormula: `NOT({Username} = '${currentCitizenUsername}')` // Exclude the current citizen
      })
      .all();

    const otherCitizens: CitizenFromAirtable[] = citizenRecords.map(record => ({
      id: record.id,
      username: record.get('Username') as string,
      firstName: record.get('FirstName') as string || '',
      lastName: record.get('LastName') as string || '',
      coatOfArmsImageUrl: record.get('CoatOfArmsImageUrl') as string || null, // Corrected field name
    }));
    
    // 2. For each other citizen, get stats
    for (const otherCitizen of otherCitizens) {
      if (!otherCitizen.username) continue; // Skip if username is missing

      // Get last message timestamp
      const lastMessageFilter = `OR(
        AND({Sender} = '${currentCitizenUsername}', {Receiver} = '${otherCitizen.username}'),
        AND({Sender} = '${otherCitizen.username}', {Receiver} = '${currentCitizenUsername}')
      )`;
      const lastMessageRecords = await base(AIRTABLE_MESSAGES_TABLE)
        .select({
          filterByFormula: lastMessageFilter,
          sort: [{ field: 'CreatedAt', direction: 'desc' }],
          maxRecords: 1,
          fields: ['CreatedAt']
        })
        .firstPage();
      
      const lastMessageTimestamp = lastMessageRecords.length > 0 
        ? lastMessageRecords[0].get('CreatedAt') as string 
        : null;

      // Get unread messages count from this otherCitizen to currentCitizenUsername
      const unreadMessagesFilter = `AND(
        {Sender} = '${otherCitizen.username}', 
        {Receiver} = '${currentCitizenUsername}', 
        {ReadAt} = ''
      )`;
      const unreadMessagesRecords = await base(AIRTABLE_MESSAGES_TABLE)
        .select({
          filterByFormula: unreadMessagesFilter,
          fields: ['Sender'] // Only need one field to count
        })
        .all();
      const unreadMessagesFromCitizenCount = unreadMessagesRecords.length;

      citizensWithStats.push({
        ...otherCitizen,
        lastMessageTimestamp,
        unreadMessagesFromCitizenCount
      });
    }

    // 3. Sort citizens by lastMessageTimestamp (descending, nulls last)
    citizensWithStats.sort((a, b) => {
      if (a.lastMessageTimestamp === null && b.lastMessageTimestamp === null) return 0;
      if (a.lastMessageTimestamp === null) return 1; // a is null, b is not, so b comes first
      if (b.lastMessageTimestamp === null) return -1; // b is null, a is not, so a comes first
      return new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime();
    });

    return NextResponse.json({ success: true, citizens: citizensWithStats });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching citizens with correspondence stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch citizens with stats', details: errorMessage },
      { status: 500 }
    );
  }
}
