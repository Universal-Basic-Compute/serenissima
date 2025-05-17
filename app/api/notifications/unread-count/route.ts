import { NextResponse, NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { citizen } = await request.json();
    
    if (!citizen) {
      return NextResponse.json(
        { success: false, error: 'Citizen username is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching unread notification count for citizen: ${citizen}`);
    
    // Query the database for unread notifications count
    const unreadCount = await prisma.notification.count({
      where: {
        citizen: citizen,
        readAt: null
      }
    });
    
    console.log(`Found ${unreadCount} unread notifications for ${citizen}`);
    
    return NextResponse.json({
      success: true,
      unreadCount
    });
    
  } catch (error) {
    console.error('Error fetching unread notification count:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch unread notification count',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
