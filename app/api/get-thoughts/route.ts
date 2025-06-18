import { NextResponse } from 'next/server';

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
    console.log('[API GetThoughts] Fetching thoughts from messages API...');

    // Use the messages API to fetch the last 200 messages
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.messages) {
      throw new Error('Invalid response from messages API');
    }

    console.log(`[API GetThoughts] Fetched ${data.messages.length} messages`);

    // Filter for thought-like message types
    /*const thoughtTypes = [
      'thought_log', 
      'unguided_run_log', 
      'autonomous_run_log',
      'encounter_reflection',
      'ai_initiative_reasoning',
      'kinos_daily_reflection',
      'kinos_theater_reflection',
      'kinos_public_bath_reflection'
    ];*/

    const thoughts = data.messages
      // Only include messages where sender equals receiver (actual thoughts)
      .filter((message: any) => message.sender === message.receiver)
      .map((message: any) => ({
        messageId: message.messageId,
        citizenUsername: message.sender,
        originalContent: message.content,
        mainThought: extractMainThought(message.content),
        createdAt: message.createdAt,
        sender: message.sender,
        receiver: message.receiver
      }));

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
