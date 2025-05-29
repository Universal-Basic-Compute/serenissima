/**
 * TimeDescriptionService - A service for generating immersive time descriptions
 * with colorful time of day descriptions and random selection with seed.
 */
export class TimeDescriptionService {
  private static instance: TimeDescriptionService;
  
  // Array of month names in Italian style
  private months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  
  // Colorful time of day descriptions
  private timeOfDayDescriptions = {
    // Before dawn (0-5)
    earlyMorning: [
      'before dawn, when only the night watchmen roam',
      'in the dark hours before sunrise',
      'as the stars still glittered in the night sky',
      'while the city slept under a blanket of stars',
      'in the hushed stillness before first light',
      'when the moon still claimed the sky',
      'as the night prepared to surrender to day',
      'in the quiet darkness before the roosters crow',
      'while lanterns still flickered in the darkness',
      'as the night watchmen made their final rounds'
    ],
    // Morning (6-11)
    morning: [
      'as the morning sun gilded the lagoon',
      'while merchants prepared their stalls for the day',
      'as the morning bells rang across the canals',
      'when the sun began warming the cobblestone streets',
      'as gondoliers readied their vessels for the day',
      'while the morning mist still clung to the water',
      'as the city awakened to a new day',
      'when the bakers filled the air with the scent of fresh bread',
      'as the morning light danced upon the Grand Canal',
      'while the dew still sparkled on the gardens of Venice'
    ],
    // Midday (12-14)
    midday: [
      'as the midday sun stood high above the Campanile',
      'while the Piazza San Marco bustled with activity',
      'as the shadows grew shortest beneath the summer sun',
      'when the heat of the day drove nobles to their shaded gardens',
      'as the contracts reached their peak of activity',
      'while the sun bathed the city in golden light',
      'as the church bells announced the midday hour',
      'when the canals reflected the brilliant blue sky',
      'as merchants sought refuge from the midday heat',
      'while the city paused briefly for the midday meal'
    ],
    // Afternoon (15-17)
    afternoon: [
      'as the afternoon sun cast long shadows across the piazzas',
      'while gondolas glided through the sun-dappled canals',
      'as the day\'s business began to slow in the counting houses',
      'when the afternoon light softened the city\'s marble facades',
      'as children played in the smaller campos and courtyards',
      'while the afternoon breeze carried the scent of the sea',
      'as nobles emerged for their afternoon promenades',
      'when the workshops of Murano glowed with molten glass',
      'as the tide shifted in the lagoon',
      'while merchants began tallying the day\'s earnings'
    ],
    // Evening (18-20)
    evening: [
      'as the evening light painted the buildings in hues of gold and amber',
      'while lanterns began to illuminate the darkening streets',
      'as the sunset set the western sky ablaze',
      'when families gathered for the evening meal',
      'as the evening bells called the faithful to vespers',
      'while the day\'s heat gave way to a gentle evening breeze',
      'as the first stars appeared in the twilight sky',
      'when the evening brought a welcome coolness to the air',
      'as the gondoliers lit their lanterns for evening journeys',
      'while the sunset reflected gloriously upon the waters'
    ],
    // Night (21-23)
    night: [
      'under a sky of countless stars',
      'while the moon cast silver light upon the sleeping city',
      'as masked revelers moved between palazzos',
      'when only the sound of lapping water broke the silence',
      'as the night watchmen began their rounds with lanterns held high',
      'while the distant sounds of music drifted across the water',
      'as the night wrapped the city in its velvet embrace',
      'when the canals became mirrors for the moon and stars',
      'as the nocturnal creatures of Venice emerged from shadow',
      'while the city\'s secrets were whispered in darkened corners'
    ]
  };
  
  // Format variants for date display
  private formatVariants = [
    (year: number, month: string, day: number, timeOfDay: string) => 
      `${year}, ${month} ${day}${this.getDaySuffix(day)}, ${timeOfDay}`,
    
    (year: number, month: string, day: number, timeOfDay: string) => 
      `${day} ${month} ${year}, ${timeOfDay}`,
    
    (year: number, month: string, day: number, timeOfDay: string) => 
      `The ${day}${this.getDaySuffix(day)} day of ${month}, ${year}, ${timeOfDay}`,
    
    (year: number, month: string, day: number, timeOfDay: string) => 
      `${year}, ${timeOfDay} on the ${day}${this.getDaySuffix(day)} of ${month}`,
    
    (year: number, month: string, day: number, timeOfDay: string) => 
      `${month} ${day}${this.getDaySuffix(day)} of the year ${year}, ${timeOfDay}`,
      
    // Add these new decorative variants:
    (year: number, month: string, day: number, timeOfDay: string) => 
      `✧ ${day} ${month} ${year} ✧ ${timeOfDay}`,
      
    (year: number, month: string, day: number, timeOfDay: string) => 
      `❧ ${month} ${day}${this.getDaySuffix(day)}, ${year} ❧ ${timeOfDay}`,
      
    (year: number, month: string, day: number, timeOfDay: string) => 
      `Anno Domini ${year}, ${timeOfDay}`
  ];
  
  private constructor() {}
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): TimeDescriptionService {
    if (!TimeDescriptionService.instance) {
      TimeDescriptionService.instance = new TimeDescriptionService();
    }
    return TimeDescriptionService.instance;
  }
  
  /**
   * Format a date string into an immersive description
   * @param dateString ISO date string to format
   * @param seed Optional seed for consistent random selection
   * @returns Formatted immersive date description
   */
  public formatDate(dateString: string, seed?: string): string {
    try {
      const date = new Date(dateString);
      // Subtract 500 years from the year for Renaissance setting
      date.setFullYear(date.getFullYear() - 500);
      
      // Get components for custom formatting
      const year = date.getFullYear();
      const day = date.getDate();
      const hour = date.getHours();
      const month = this.months[date.getMonth()];
      
      // Get time of day description
      const timeOfDay = this.getTimeOfDayDescription(hour, this.generateSeed(dateString, seed));
      
      // Select a format variant based on the seed
      const formatIndex = this.seededRandom(0, this.formatVariants.length - 1, this.generateSeed(dateString, seed));
      
      // Apply the selected format
      return this.formatVariants[formatIndex](year, month, day, timeOfDay);
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  }
  
  /**
   * Get a colorful description for the time of day
   * @param hour Hour of the day (0-23)
   * @param seed Seed for random selection
   * @returns Time of day description
   */
  private getTimeOfDayDescription(hour: number, seed: number): string {
    let descriptions: string[];
    
    if (hour < 6) {
      descriptions = this.timeOfDayDescriptions.earlyMorning;
    } else if (hour < 12) {
      descriptions = this.timeOfDayDescriptions.morning;
    } else if (hour < 15) {
      descriptions = this.timeOfDayDescriptions.midday;
    } else if (hour < 18) {
      descriptions = this.timeOfDayDescriptions.afternoon;
    } else if (hour < 21) {
      descriptions = this.timeOfDayDescriptions.evening;
    } else {
      descriptions = this.timeOfDayDescriptions.night;
    }
    
    // Use seeded random to select a description
    const index = this.seededRandom(0, descriptions.length - 1, seed);
    return descriptions[index];
  }
  
  /**
   * Generate a numeric seed from a string
   * @param dateString The date string to use as seed
   * @param additionalSeed Optional additional seed string
   * @returns Numeric seed
   */
  private generateSeed(dateString: string, additionalSeed?: string): number {
    const seedString = additionalSeed ? dateString + additionalSeed : dateString;
    let hash = 0;
    
    for (let i = 0; i < seedString.length; i++) {
      const char = seedString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash);
  }
  
  /**
   * Generate a random number between min and max using a seed
   * @param min Minimum value (inclusive)
   * @param max Maximum value (inclusive)
   * @param seed Seed for random generation
   * @returns Random integer between min and max
   */
  private seededRandom(min: number, max: number, seed: number): number {
    // Simple seeded random function
    const x = Math.sin(seed) * 10000;
    const rand = x - Math.floor(x); // Value between 0 and 1
    
    // Scale to range and round to integer
    return Math.floor(rand * (max - min + 1)) + min;
  }
  
  /**
   * Get the correct suffix for a day number
   * @param day Day of the month
   * @returns Suffix string (st, nd, rd, or th)
   */
  private getDaySuffix(day: number): string {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  /**
   * Format a date string into a time string (HH:MM)
   * @param dateString ISO date string to format
   * @returns Formatted time string (e.g., "14:30")
   */
  public formatTime(dateString?: string): string {
    if (!dateString) {
      return '--:--'; // Return placeholder if dateString is undefined
    }
    try {
      const date = new Date(dateString);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (error) {
      console.error('Error formatting time:', error);
      // Attempt to extract time from string if Date parsing fails (basic fallback)
      const match = dateString.match(/T(\d{2}:\d{2})/);
      if (match && match[1]) {
        return match[1];
      }
      return '--:--'; // Fallback for invalid date string
    }
  }
}

// Export a singleton instance
export const timeDescriptionService = TimeDescriptionService.getInstance();
