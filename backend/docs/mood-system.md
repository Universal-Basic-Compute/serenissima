# Mood System

The mood system is designed to calculate the emotional state of a citizen based on their ledger data. This document explains the architecture and functioning of this system.

## General Architecture

- **API Endpoint**: `app/api/calculate-mood/route.ts` exposes a POST endpoint that receives the citizen's username and optionally ledger data.
- **Calculation Engine**: `backend/engine/utils/mood_helper.py` contains the main logic for calculating mood.
- **Caching**: Results are cached for 20 minutes to avoid repeated calculations.

## Mood Calculation Process

1. **Data Collection**: The API receives the username and retrieves ledger data if not provided.
2. **Basic Emotion Calculation**: The system assigns points to 6 basic emotions (happy, sad, angry, fearful, surprised, disgusted).
3. **Normalization**: Points are normalized to a total of 25 points (10 base points + 15 random points).
4. **Personality Trait Influence**: The citizen's personality traits modify the emotional scores.
5. **Complex Mood Determination**: The system combines dominant emotions to determine a complex mood.
6. **Intensity Calculation**: Emotional intensity (1-10) is calculated based on point concentration.

## Factors Influencing Mood

The system takes into account numerous factors:
- Financial situation (ducats)
- Basic needs (housing, work)
- Social relationships
- Owned properties
- Recent activities and their success
- Active problems
- Stratagems targeting the citizen
- Social class
- Personality traits

## Types of Moods

- **Basic Emotions**: happy, sad, angry, fearful, surprised, disgusted
- **Intense Emotions**: Stronger versions of basic emotions (e.g., ecstatic, devastated)
- **Complex Emotions**: Combinations of two basic emotions (e.g., nostalgic = happy + sad)
- **Emotional Triads**: Combinations of three strong emotions (e.g., desperate = angry + sad + fearful)

## Final Result

The system returns a JSON object containing:
- Scores for basic emotions
- Primary emotion (strongest)
- Calculated complex mood
- Mood description (if available)
- Emotional intensity
- Percentage distribution of emotions
- Identified personality traits

## Usage Example

```typescript
// Example API call
const response = await fetch('/api/calculate-mood', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    citizenUsername: 'ExampleCitizen',
    forceRefresh: false
  }),
});

const result = await response.json();
// result.mood contains the mood information
```

## Personality Trait System

Personality traits are extracted from the citizen's profile data and influence emotional responses:

- **Calculating/Methodical Traits**: Reduce anger, fear, and surprise
- **Paranoid/Suspicious Traits**: Increase fear, anger, and disgust
- **Ambitious/Driven Traits**: Increase happiness and anger, reduce sadness
- **Resentful/Vindictive Traits**: Increase anger and sadness, reduce happiness
- **Adaptable/Resourceful Traits**: Reduce sadness, fear, and surprise
- **Obsessive/Perfectionist Traits**: Increase anger, fear, and disgust
- **Impulsive/Restless Traits**: Increase anger and surprise, reduce sadness
- **Reserved/Secretive Traits**: Reduce all emotional expressions

This system generates nuanced and realistic moods for citizens, reflecting their current situation in the game.
