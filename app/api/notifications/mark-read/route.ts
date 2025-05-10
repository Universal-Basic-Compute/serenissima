import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the directory where notifications will be stored
const NOTIFICATIONS_DIR = path.join(process.cwd(), 'data', 'notifications');

export async function POST(request: Request) {
  try {
    // Parse the request body
    const { user, notificationIds } = await request.json();
    
    if (!user || !notificationIds || !Array.isArray(notificationIds)) {
      return NextResponse.json(
        { success: false, error: 'User and notification IDs array are required' },
        { status: 400 }
      );
    }
    
    console.log(`Marking notifications as read for user: ${user}, notifications: ${notificationIds.join(', ')}`);
    
    // Get the user's notification file path
    const userNotificationsPath = path.join(NOTIFICATIONS_DIR, `${user}.json`);
    
    // Check if the user has any notifications
    if (!fs.existsSync(userNotificationsPath)) {
      return NextResponse.json(
        { success: false, error: 'No notifications found for this user' },
        { status: 404 }
      );
    }
    
    // Read the user's notifications
    const notificationsData = fs.readFileSync(userNotificationsPath, 'utf8');
    const notifications = JSON.parse(notificationsData);
    
    // Mark the specified notifications as read
    const updatedNotifications = notifications.map((notification: any) => {
      if (notificationIds.includes(notification.notificationId) && !notification.readAt) {
        return {
          ...notification,
          readAt: new Date().toISOString()
        };
      }
      return notification;
    });
    
    // Save the updated notifications
    fs.writeFileSync(userNotificationsPath, JSON.stringify(updatedNotifications, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Notifications marked as read successfully'
    });
    
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}
