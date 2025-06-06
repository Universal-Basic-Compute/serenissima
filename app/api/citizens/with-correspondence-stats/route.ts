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

interface Coordinates {
  lat: number;
  lng: number;
}

interface CitizenFromAirtable {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImageUrl?: string | null;
  position?: string; // Added position
}

interface CitizenWithStats extends CitizenFromAirtable {
  lastMessageTimestamp: string | null;
  unreadMessagesFromCitizenCount: number;
  distance?: number | null; // Added distance
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

    // Helper function to parse position string
    const parsePosition = (positionStr?: string): Coordinates | null => {
      if (!positionStr) return null;
      try {
        const pos = JSON.parse(positionStr);
        if (typeof pos.lat === 'number' && typeof pos.lng === 'number') {
          return { lat: pos.lat, lng: pos.lng };
        }
      } catch (e) {
        console.warn(`Failed to parse position string: ${positionStr}`, e);
      }
      return null;
    };

    // Helper function to calculate geographic distance using equirectangular approximation
    const calculateDistance = (pos1: Coordinates, pos2: Coordinates): number => {
      const R = 6371e3; // Earth's radius in meters
      const lat1Rad = pos1.lat * Math.PI / 180;
      const lat2Rad = pos2.lat * Math.PI / 180;
      const deltaLatRad = (pos2.lat - pos1.lat) * Math.PI / 180;
      const deltaLngRad = (pos2.lng - pos1.lng) * Math.PI / 180;

      const x = deltaLngRad * Math.cos((lat1Rad + lat2Rad) / 2);
      const y = deltaLatRad;
      const distance = Math.sqrt(x * x + y * y) * R;

      return distance; // Distance is now in meters
    };

    // 1. Fetch all citizens from the CITIZENS table, including their positions
    const allCitizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Username', 'FirstName', 'LastName', 'Position'], // Removed CoatOfArmsImageUrl
      })
      .all();

    let currentCitizenPosition: Coordinates | null = null;
    const allOtherCitizensFromAirtable: CitizenFromAirtable[] = [];

    allCitizenRecords.forEach(record => {
      const username = record.get('Username') as string;
      const positionStr = record.get('Position') as string | undefined;

      if (username === currentCitizenUsername) {
        currentCitizenPosition = parsePosition(positionStr);
      } else {
        allOtherCitizensFromAirtable.push({
          id: record.id,
          username: username,
          firstName: record.get('FirstName') as string || '',
          lastName: record.get('LastName') as string || '',
          coatOfArmsImageUrl: username ? `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${username}.png` : null,
          position: positionStr,
        });
      }
    });

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
      let distance: number | null = null;
      if (currentCitizenPosition) {
        const otherCitizenPosition = parsePosition(citizen.position);
        if (otherCitizenPosition) {
          const rawDistance = calculateDistance(currentCitizenPosition, otherCitizenPosition);
          if (rawDistance > 500) {
            distance = Math.ceil(rawDistance / 100) * 100; // Round up to the nearest 100
          } else {
            distance = Math.ceil(rawDistance / 10) * 10; // Round up to the nearest 10
          }
        }
      }
      return {
        ...citizen,
        lastMessageTimestamp: stats.lastMessageTimestamp,
        unreadMessagesFromCitizenCount: stats.unreadMessagesFromCitizenCount,
        distance: distance,
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
