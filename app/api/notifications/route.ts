import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the directory where notifications will be stored
const NOTIFICATIONS_DIR = path.join(process.cwd(), 'data', 'notifications');

// Ensure the notifications directory exists
function ensureNotificationsDirExists() {
  if (!fs.existsSync(NOTIFICATIONS_DIR)) {
    fs.mkdirSync(NOTIFICATIONS_DIR, { recursive: true });
  }
  return NOTIFICATIONS_DIR;
}

// Get notifications for a user
export async function POST(request: Request) {
  try {
    // Parse the request body
    const { user, since } = await request.json();
    
    if (!user) {
      console.log('\x1b[35m%s\x1b[0m', '[DEBUG] Error: User is required');
      return NextResponse.json(
        { success: false, error: 'User is required' },
        { status: 400 }
      );
    }
    
    console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Fetching notifications for user: ${user}, since: ${since}`);
    
    // Ensure the notifications directory exists
    ensureNotificationsDirExists();
    console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Notifications directory: ${NOTIFICATIONS_DIR}`);
    
    // Get the user's notification file path
    const userNotificationsPath = path.join(NOTIFICATIONS_DIR, `${user}.json`);
    console.log('\x1b[35m%s\x1b[0m', `[DEBUG] User notifications path: ${userNotificationsPath}`);
    
    // Check if the user has any notifications
    if (!fs.existsSync(userNotificationsPath)) {
      console.log('\x1b[35m%s\x1b[0m', `[DEBUG] No notifications file found, creating sample notifications`);
      // Create some sample notifications for the user
      const sampleNotifications = [
        {
          notificationId: `${user}-notification-1`,
          type: 'System',
          user: user,
          content: 'Welcome to La Serenissima! Explore the city and discover its wonders.',
          createdAt: new Date().toISOString(),
          readAt: null
        },
        {
          notificationId: `${user}-notification-2`,
          type: 'Market',
          user: user,
          content: 'A new land parcel is available for purchase in San Marco district.',
          createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          readAt: null
        },
        {
          notificationId: `${user}-notification-3`,
          type: 'Governance',
          user: user,
          content: 'The Council of Ten has issued a new decree regarding building regulations.',
          createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
          readAt: null
        }
      ];
      
      // Save the sample notifications
      fs.writeFileSync(userNotificationsPath, JSON.stringify(sampleNotifications, null, 2));
      console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Created and saved ${sampleNotifications.length} sample notifications`);
      
      return NextResponse.json({
        success: true,
        notifications: sampleNotifications
      });
    }
    
    // Read the user's notifications
    const notificationsData = fs.readFileSync(userNotificationsPath, 'utf8');
    const notifications = JSON.parse(notificationsData);
    console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Found ${notifications.length} existing notifications`);
    
    // Filter notifications based on the 'since' parameter if provided
    let filteredNotifications = notifications;
    if (since) {
      filteredNotifications = notifications.filter(
        (notification: any) => new Date(notification.createdAt).getTime() > since
      );
      console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Filtered to ${filteredNotifications.length} notifications since ${new Date(since).toISOString()}`);
    }
    
    console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Returning ${filteredNotifications.length} notifications`);
    return NextResponse.json({
      success: true,
      notifications: filteredNotifications
    });
    
  } catch (error) {
    console.error('\x1b[35m%s\x1b[0m', '[DEBUG] Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
