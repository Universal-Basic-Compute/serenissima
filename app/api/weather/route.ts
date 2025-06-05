import { NextResponse } from 'next/server';

const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const VENICE_LAT = 45.4408;
const VENICE_LON = 12.3155;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface WeatherCache {
  timestamp: number;
  data: any;
}

let weatherCache: WeatherCache | null = null;

export async function GET() {
  if (!OPENWEATHERMAP_API_KEY) {
    console.error('OpenWeatherMap API key is not set.');
    return NextResponse.json({ success: false, error: 'Weather service misconfigured' }, { status: 500 });
  }

  const now = Date.now();

  // Check cache
  if (weatherCache && (now - weatherCache.timestamp < CACHE_DURATION_MS)) {
    console.log('Returning cached weather data for Venice.');
    return NextResponse.json({ success: true, ...weatherCache.data });
  }

  console.log('Fetching new weather data for Venice from OpenWeatherMap.');
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${VENICE_LAT}&lon=${VENICE_LON}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`OpenWeatherMap API error: ${response.status}`, errorData);
      // If API fails, return cached data if available and not too old (e.g., < 6 hours)
      if (weatherCache && (now - weatherCache.timestamp < 6 * 60 * 60 * 1000)) {
        console.warn('OpenWeatherMap API error, returning stale cached data.');
        return NextResponse.json({ success: true, ...weatherCache.data, stale: true });
      }
      return NextResponse.json({ success: false, error: `Failed to fetch weather data: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();

    // Extract relevant information
    const weatherMain = data.weather && data.weather.length > 0 ? data.weather[0].main.toLowerCase() : 'unknown';
    const weatherDescription = data.weather && data.weather.length > 0 ? data.weather[0].description.toLowerCase() : 'unknown';
    const windSpeed = data.wind ? data.wind.speed : 0; // m/s
    const rainVolumeLastHour = data.rain && data.rain['1h'] ? data.rain['1h'] : 0; // mm
    const temperature = data.main ? data.main.temp : null; // Celsius
    const sunrise = data.sys ? data.sys.sunrise * 1000 : null; // Convert to ms
    const sunset = data.sys ? data.sys.sunset * 1000 : null; // Convert to ms
    
    let condition = 'clear';
    // Prioritize rain
    if (rainVolumeLastHour > 0.1 || weatherMain.includes('rain') || weatherDescription.includes('rain') || weatherMain.includes('drizzle') || weatherDescription.includes('drizzle') || weatherMain.includes('thunderstorm')) {
      condition = 'rainy';
    } else if (windSpeed > 5.0) { // 5 m/s threshold for windy
      condition = 'windy';
    }
    // Other conditions like 'clouds', 'snow', 'mist' could be mapped to 'clear' or specific states if needed.

    const processedData = {
      condition, // 'clear', 'rainy', 'windy'
      rawCondition: weatherMain,
      description: weatherDescription,
      windSpeed, // m/s
      rainVolumeLastHour, // mm
      temperature, // Celsius
      sunrise, // timestamp ms
      sunset, // timestamp ms
      city: data.name,
      icon: data.weather && data.weather.length > 0 ? data.weather[0].icon : null, // OpenWeatherMap icon code
      fetchedAt: now,
    };

    // Update cache
    weatherCache = {
      timestamp: now,
      data: processedData,
    };

    return NextResponse.json({ success: true, ...processedData });
  } catch (error) {
    console.error('Error fetching or processing weather data:', error);
    // If any error, return cached data if available and not too old
    if (weatherCache && (now - weatherCache.timestamp < 6 * 60 * 60 * 1000)) {
        console.warn('Error fetching weather, returning stale cached data.');
        return NextResponse.json({ success: true, ...weatherCache.data, stale: true, error: (error as Error).message });
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
