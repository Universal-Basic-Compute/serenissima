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

    // 1. Fetch all citizens from the CITIZENS table (excluding the current one)
    const citizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Username', 'FirstName', 'LastName', 'CoatOfArmsImageUrl'],
        filterByFormula: `NOT({Username} = '${currentCitizenUsername}')`
      })
      .all();

    const allOtherCitizensFromAirtable: CitizenFromAirtable[] = citizenRecords.map(record => ({
      id: record.id,
      username: record.get('Username') as string,
      firstName: record.get('FirstName') as string || '',
      lastName: record.get('LastName') as string || '',
      coatOfArmsImageUrl: record.get('CoatOfArmsImageUrl') as string || null,
    }));

    // 2. Fetch all relevant messages in one go
    // Messages where currentCitizenUsername is either Sender or Receiver
    const messagesFilter = `OR(
      {Sender} = '${currentCitizenUsername}',
      {Receiver} = '${currentCitizenUsername}'
    )`;
    const messageRecords = await base(AIRTABLE_MESSAGES_TABLE)
      .select({
        filterByFormula: messagesFilter,
        fields: ['Sender', 'Receiver', 'CreatedAt', 'ReadAt'],
        sort: [{ field: 'CreatedAt', direction: 'desc' }] // Sort by CreatedAt to easily find the last message
      })
      .all();

    // 3. Process messages to gather stats for each citizen
    const citizenStatsMap = new Map<string, { lastMessageTimestamp: string | null, unreadMessagesFromCitizenCount: number }>();

    for (const msgRecord of messageRecords) {
      const sender = msgRecord.get('Sender') as string;
      const receiver = msgRecord.get('Receiver') as string;
      const createdAt = msgRecord.get('CreatedAt') as string;
      const readAt = msgRecord.get('ReadAt') as string | null;

      // Determine the "other" citizen in this conversation
      let otherCitizenUsername: string | null = null;
      if (sender === currentCitizenUsername) {
        otherCitizenUsername = receiver;
      } else if (receiver === currentCitizenUsername) {
        otherCitizenUsername = sender;
      }

      if (otherCitizenUsername && otherCitizenUsername !== currentCitizenUsername) {
        if (!citizenStatsMap.has(otherCitizenUsername)) {
          citizenStatsMap.set(otherCitizenUsername, {
            lastMessageTimestamp: null,
            unreadMessagesFromCitizenCount: 0
          });
        }
        const stats = citizenStatsMap.get(otherCitizenUsername)!;

        // Update last message timestamp (since messages are sorted desc, first one encountered is the latest)
        if (stats.lastMessageTimestamp === null) {
          stats.lastMessageTimestamp = createdAt;
        }

        // Increment unread count if message is from otherCitizen to currentCitizen and is unread
        if (sender === otherCitizenUsername && receiver === currentCitizenUsername && !readAt) {
          stats.unreadMessagesFromCitizenCount++;
        }
      }
    }

    // 4. Combine citizen data with processed stats
    const citizensWithStats: CitizenWithStats[] = allOtherCitizensFromAirtable.map(citizen => {
      const stats = citizenStatsMap.get(citizen.username) || { lastMessageTimestamp: null, unreadMessagesFromCitizenCount: 0 };
      return {
        ...citizen,
        lastMessageTimestamp: stats.lastMessageTimestamp,
        unreadMessagesFromCitizenCount: stats.unreadMessagesFromCitizenCount
      };
    });

    // 5. Sort citizens by lastMessageTimestamp (descending, nulls last)
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
