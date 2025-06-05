import { eventBus, EventTypes } from '../utils/eventBus';

export type WeatherCondition = 'clear' | 'rainy' | 'windy' | 'unknown';

export interface WeatherData {
  condition: WeatherCondition;
  rawCondition: string; // e.g., "Clouds", "Rain"
  description: string; // e.g., "scattered clouds"
  windSpeed: number; // m/s
  rainVolumeLastHour: number; // mm
  temperature: number | null; // Celsius
  sunrise: number | null; // timestamp ms UTC
  sunset: number | null; // timestamp ms UTC
  city: string;
  icon: string | null; // OpenWeatherMap icon code
  fetchedAt: number; // timestamp ms
  isDay: boolean;
  stale?: boolean; // Indicates if data is from fallback cache due to API error
  error?: string; // Error message if fetching failed
}

const WEATHER_UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const WEATHER_API_TIMEOUT_MS = 10000; // 10 seconds
const WINDY_THRESHOLD_MPS = 5.0; // m/s
const PRECIPITATION_THRESHOLD_MM = 0.1; // mm/hour

class WeatherService {
  private currentWeatherData: WeatherData | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isFetching: boolean = false;

  constructor() {
    // No immediate fetch on construction, wait for initialize call
  }

  public async initialize(): Promise<void> {
    if (this.intervalId) {
      // Already initialized
      return;
    }
    console.log('[WeatherService] Initializing...');
    await this.fetchWeather(); // Initial fetch
    this.intervalId = setInterval(() => this.fetchWeather(), WEATHER_UPDATE_INTERVAL_MS);
  }

  private async fetchWeather(): Promise<void> {
    if (this.isFetching) {
      console.log('[WeatherService] Fetch already in progress.');
      return;
    }
    this.isFetching = true;
    console.log('[WeatherService] Fetching weather data...');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WEATHER_API_TIMEOUT_MS);

      const response = await fetch('/api/weather', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch weather from API: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      if (data.success) {
        const now = Date.now();
        const isDay = data.sunrise && data.sunset ? (now > data.sunrise && now < data.sunset) : true; // Default to day if no sunrise/sunset

        this.currentWeatherData = {
          condition: data.condition as WeatherCondition,
          rawCondition: data.rawCondition,
          description: data.description,
          windSpeed: data.windSpeed,
          rainVolumeLastHour: data.rainVolumeLastHour,
          temperature: data.temperature,
          sunrise: data.sunrise,
          sunset: data.sunset,
          city: data.city,
          icon: data.icon,
          fetchedAt: data.fetchedAt,
          isDay: isDay,
          stale: data.stale,
          error: data.error,
        };
        console.log('[WeatherService] Weather data updated:', this.currentWeatherData);
        eventBus.emit(EventTypes.WEATHER_UPDATED, this.currentWeatherData);
      } else {
        throw new Error(data.error || 'Unknown error fetching weather data');
      }
    } catch (error) {
      console.error('[WeatherService] Error fetching weather:', error);
      // Optionally, implement more robust error handling, e.g., retry logic or using older cache
      if (!this.currentWeatherData) { // If no data at all, set to unknown/default
        this.currentWeatherData = this.getDefaultWeatherData((error as Error).message);
      } else { // If there was previous data, mark it as potentially stale and keep it
        this.currentWeatherData.stale = true;
        this.currentWeatherData.error = (error as Error).message;
      }
      eventBus.emit(EventTypes.WEATHER_UPDATED, this.currentWeatherData); // Emit even on error so UI can reflect
    } finally {
      this.isFetching = false;
    }
  }

  public getCurrentWeather(): WeatherData | null {
    return this.currentWeatherData;
  }
  
  private getDefaultWeatherData(errorMessage?: string): WeatherData {
    const now = Date.now();
    // Simplified default: assume day, clear weather
    return {
      condition: 'clear',
      rawCondition: 'default',
      description: 'default weather',
      windSpeed: 1,
      rainVolumeLastHour: 0,
      temperature: 20, // Default temp
      sunrise: now - 6 * 3600 * 1000, // Assume sunrise 6 hours ago
      sunset: now + 6 * 3600 * 1000,  // Assume sunset 6 hours from now
      city: 'Venice (Default)',
      icon: '01d', // Default clear day icon
      fetchedAt: now,
      isDay: true,
      stale: true,
      error: errorMessage || "Failed to fetch initial weather data.",
    };
  }

  public stopService(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[WeatherService] Service stopped.');
    }
  }
}

export const weatherService = new WeatherService();
