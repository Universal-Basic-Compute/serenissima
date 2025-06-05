'use client';

import React, { useState, useEffect } from 'react';
import { weatherService, WeatherData, WeatherCondition } from '@/lib/services/WeatherService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { 
  WiDaySunny, WiNightClear, WiDayCloudy, WiNightAltCloudy, WiCloud, WiCloudy, 
  WiDayShowers, WiNightAltShowers, WiDayRain, WiNightAltRain, WiDayThunderstorm, WiNightAltThunderstorm,
  WiDaySnow, WiNightAltSnow, WiDayFog, WiNightFog, WiStrongWind
} from 'weather-icons-react'; // Removed WiNa

const WeatherTimeDisplay: React.FC = () => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [timeZone, setTimeZone] = useState<string>('Europe/Rome'); // Default to Venice time

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      try {
        setCurrentTime(now.toLocaleTimeString('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        // Fallback if timezone is invalid
        console.warn(`Invalid timeZone: ${timeZone}, falling back to local time.`);
        setCurrentTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      }
    };

    updateDateTime();
    const timerId = setInterval(updateDateTime, 1000 * 30); // Update every 30 seconds

    const handleWeatherUpdate = (data: WeatherData) => {
      setCurrentWeather(data);
    };

    // Get initial weather data if already fetched
    const initialWeather = weatherService.getCurrentWeather();
    if (initialWeather) {
      setCurrentWeather(initialWeather);
    }

    const weatherSubscription = eventBus.subscribe(EventTypes.WEATHER_UPDATED, handleWeatherUpdate);

    return () => {
      clearInterval(timerId);
      weatherSubscription.unsubscribe();
    };
  }, [timeZone]);

  const getWeatherIcon = (weather: WeatherData | null): JSX.Element => {
    const size = 24;
    const defaultColor = "#ccc"; // Color for the fallback icon

    if (!weather || !weather.icon) {
      // Use WiCloud as a generic fallback if no weather data or icon code
      return <WiCloud size={size} color={defaultColor} />;
    }

    const iconCode = weather.icon;
    const color = weather.isDay ? '#FFD700' : '#B0E0E6'; // Gold for day, PowderBlue for night

    // Mapping OpenWeatherMap icon codes to weather-icons-react components
    // See: https://openweathermap.org/weather-conditions
    switch (iconCode) {
      case '01d': return <WiDaySunny size={size} color={color} />;
      case '01n': return <WiNightClear size={size} color={color} />;
      case '02d': return <WiDayCloudy size={size} color={color} />;
      case '02n': return <WiNightAltCloudy size={size} color={color} />;
      case '03d': case '03n': return <WiCloud size={size} color={color} />; // Scattered clouds
      case '04d': case '04n': return <WiCloudy size={size} color={color} />; // Broken clouds, Overcast clouds
      case '09d': return <WiDayShowers size={size} color={color} />;
      case '09n': return <WiNightAltShowers size={size} color={color} />;
      case '10d': return <WiDayRain size={size} color={color} />;
      case '10n': return <WiNightAltRain size={size} color={color} />;
      case '11d': return <WiDayThunderstorm size={size} color={color} />;
      case '11n': return <WiNightAltThunderstorm size={size} color={color} />;
      case '13d': return <WiDaySnow size={size} color={color} />;
      case '13n': return <WiNightAltSnow size={size} color={color} />;
      case '50d': return <WiDayFog size={size} color={color} />;
      case '50n': return <WiNightFog size={size} color={color} />;
      default:
        // Fallback based on condition if icon code is unknown
        if (weather.condition === 'windy') return <WiStrongWind size={size} color={color} />;
        if (weather.condition === 'rainy') return weather.isDay ? <WiDayRain size={size} color={color} /> : <WiNightAltRain size={size} color={color} />;
        return weather.isDay ? <WiDaySunny size={size} color={color} /> : <WiNightClear size={size} color={color} />;
    }
  };
  
  const getWeatherDescription = (weather: WeatherData | null): string => {
    if (!weather) return "Loading weather...";
    if (weather.stale && weather.error) return `Weather data stale: ${weather.error.substring(0,30)}...`;
    if (weather.stale) return "Weather data may be outdated";
    
    let baseText = `${Math.round(weather.temperature || 0)}°C, ${weather.description}`;
    if (weather.condition === 'windy') {
        baseText += ` (Wind: ${weather.windSpeed.toFixed(1)} m/s)`;
    }
    if (weather.condition === 'rainy' && weather.rainVolumeLastHour > 0) {
        baseText += ` (Rain: ${weather.rainVolumeLastHour.toFixed(1)}mm/h)`;
    }
    return baseText;
  }

  return (
    <div 
        className="fixed bottom-4 left-[130px] bg-black/70 text-white px-3 py-2 rounded-lg shadow-md flex items-center space-x-2 text-xs z-40"
        title={getWeatherDescription(currentWeather)}
    >
      {getWeatherIcon(currentWeather)}
      <span>{currentTime}</span>
      {currentWeather?.stale && <span className="text-yellow-400 ml-1" title="Weather data might be outdated due to API issues.">(Stale)</span>}
    </div>
  );
};

export default WeatherTimeDisplay;
