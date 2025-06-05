
import { eventBus, EventTypes } from '../utils/eventBus';
import { WeatherData, WeatherCondition, weatherService } from './WeatherService'; // Import WeatherService and types

const AUDIO_BASE_PATH = '/sounds/';

export const WEATHER_AUDIO_CONFIG = {
  trackDuration: 22000,
  crossfadeStartOffset: 2000, // trackDuration - crossfadeStart (22000 - 20000 = 2000)
  crossfadeDuration: 4000,
  weatherTransitionDuration: 2000,
  zoomTransitionCrossfadeDuration: 1500, // Renamed from zoomTransitionDuration for clarity
  
  birdMinInterval: 45000,
  birdMaxInterval: 90000,
  zoomDebounceTime: 300,
  windLayerOffset: 5000,

  // Volume levels
  waterBaseVolume: 0.8, // Keeping current adjusted value, spec was 1.0
  windBaseVolume: 0.45, // Adjusted from spec 0.6, will be further modulated by wind speed
  rainOverlayVolume: 0.3,
  birdVolume: 0.25, // Base volume for birds, can be reduced by rain

  // Zoom thresholds (percentage)
  zoomHighToMidGeneral: 40, // General threshold for layers

  // Weather specific
  windyThresholdMPS: 5.0, // m/s wind speed to consider 'windy' for audio adjustment
  // precipitationThreshold not directly used here, WeatherService determines 'rainy' state
};

export const weatherAudioAssets = {
  water: {
    high: { // Zoom category
      clear: ['atmospheric_water_high_clear_1.mp3'],
      rainy: ['atmospheric_water_high_rainy_1.mp3'],
      windy: ['atmospheric_water_high_windy_1.mp3']
    },
    mid: { // Zoom category
      clear: ['atmospheric_water_mid_clear_1.mp3', 'atmospheric_water_mid_clear_2.mp3'],
      rainy: ['atmospheric_water_mid_rainy_1.mp3', 'atmospheric_water_mid_rainy_2.mp3'],
      windy: ['atmospheric_water_mid_windy_1.mp3']
    }
  },
  wind: {
    high: {
      clear: ['atmospheric_wind_high_clear_1.mp3'],
      rainy: ['atmospheric_wind_high_rainy_2.mp3'], // Using specific rainy track for high zoom
      windy: ['atmospheric_wind_high_windy_1.mp3']
    },
    mid: {
      clear: ['atmospheric_wind_mid_clear_2.mp3'],
      rainy: ['atmospheric_wind_mid_clear_2.mp3'], // Mid zoom rainy uses clear tracks as per spec
      windy: ['atmospheric_wind_mid_windy_1.mp3']
    }
  },
  rain: ['atmospheric_rain_mid_1.mp3', 'atmospheric_rain_mid_2.mp3'],
  birds: { // Bird assets remain, their volume will be affected by weather
    low: ['birds_low_1.mp3', 'birds_low_2.mp3'],
    mid: ['birds_mid_1.mp3']
  }
};

interface ManagedAudioSource {
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode;
  buffer: AudioBuffer | null;
  url: string | null;
  isPlaying: boolean;
  isFading: boolean;
}

class AudioBufferPool {
  private buffers: Map<string, AudioBuffer> = new Map();
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(url)) {
      return this.buffers.get(url)!;
    }
    try {
      const response = await fetch(AUDIO_BASE_PATH + url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio buffer: ${url}, status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.buffers.set(url, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.error(`Error loading audio buffer ${url}:`, error);
      return null;
    }
  }

  getBuffer(url: string): AudioBuffer | null {
    return this.buffers.get(url) || null;
  }

  async preloadAssets(assetList: string[]): Promise<void> {
    await Promise.all(assetList.map(url => this.loadBuffer(url)));
  }
}

abstract class AudioLayer {
  protected audioContext: AudioContext;
  protected bufferPool: AudioBufferPool;
  protected masterGain: GainNode;
  protected layerVolume: number = 1.0;
  protected globalVolume: number = 1.0;
  protected currentZoomCategory: 'high' | 'mid' = 'high'; // Simplified zoom categories

  constructor(audioContext: AudioContext, bufferPool: AudioBufferPool, initialVolume: number) {
    this.audioContext = audioContext;
    this.bufferPool = bufferPool;
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.layerVolume = initialVolume;
    this.updateGain();
  }

  protected updateGain(): void {
    this.masterGain.gain.value = Math.max(0, Math.min(1, this.layerVolume * this.globalVolume));
  }

  setLayerVolume(volume: number): void {
    this.layerVolume = Math.max(0, Math.min(1, volume));
    this.updateGain();
  }
  
  setGlobalVolume(volume: number): void {
    this.globalVolume = Math.max(0, Math.min(1, volume));
    this.updateGain();
  }

  abstract start(): void;
  abstract stop(): void;
  abstract updateZoom(zoomPercent: number, weatherCondition: WeatherCondition): void;
  // Add method for weather transitions if needed by specific layer types
}

type WeatherTrackSet = {
  [key in WeatherCondition]?: string[];
};
type ZoomWeatherTrackSet = {
  high: WeatherTrackSet;
  mid: WeatherTrackSet;
};

class CrossfadeAudioLayer extends AudioLayer {
  private trackSet: ZoomWeatherTrackSet;
  private zoomThreshold: number;
  private currentWeatherData: WeatherCondition = 'clear';

  private currentSource: ManagedAudioSource;
  private nextSource: ManagedAudioSource;
  
  private nextTrackTimeoutId: NodeJS.Timeout | null = null;
  private crossfadeTimeoutId: NodeJS.Timeout | null = null;
  private isTransitioning: boolean = false; // General transition flag (zoom or weather)
  private lastPlayedUrl: string | null = null;

  constructor(
    audioContext: AudioContext,
    bufferPool: AudioBufferPool,
    trackSet: ZoomWeatherTrackSet,
    zoomThreshold: number,
    initialVolume: number
  ) {
    super(audioContext, bufferPool, initialVolume);
    this.trackSet = trackSet;
    this.zoomThreshold = zoomThreshold;
    this.currentSource = this.createManagedSource();
    this.nextSource = this.createManagedSource();
  }

  private createManagedSource(): ManagedAudioSource {
    const gainNode = this.audioContext.createGain();
    gainNode.connect(this.masterGain);
    return { sourceNode: null, gainNode, buffer: null, url: null, isPlaying: false, isFading: false };
  }

  private getVariationsForCurrentState(): string[] {
    const zoomTracks = this.trackSet[this.currentZoomCategory];
    let weatherSpecificTracks = zoomTracks[this.currentWeatherData];

    // Fallback logic: if specific weather tracks are not defined, use 'clear' tracks for that zoom level
    if (!weatherSpecificTracks || weatherSpecificTracks.length === 0) {
      // console.warn(`${this.constructor.name}: No tracks for ${this.currentZoomCategory}/${this.currentWeatherData}, falling back to 'clear'`);
      weatherSpecificTracks = zoomTracks.clear;
    }
    // If 'clear' tracks are also undefined or empty, fallback to any available track in the zoom category
    if (!weatherSpecificTracks || weatherSpecificTracks.length === 0) {
        // console.warn(`${this.constructor.name}: No 'clear' tracks for ${this.currentZoomCategory}, trying any available.`);
        for (const conditionKey in zoomTracks) {
            const tracks = zoomTracks[conditionKey as WeatherCondition];
            if (tracks && tracks.length > 0) {
                weatherSpecificTracks = tracks;
                break;
            }
        }
    }
    return weatherSpecificTracks || [];
  }

  private selectNextTrackUrl(): string | null {
    const availableTracks = this.getVariationsForCurrentState();
    if (availableTracks.length === 0) {
        // console.warn(`${this.constructor.name}: No tracks available for ${this.currentZoomCategory}/${this.currentWeatherData}`);
        return null;
    }
    if (availableTracks.length === 1) return availableTracks[0];

    let nextUrl;
    do {
      nextUrl = availableTracks[Math.floor(Math.random() * availableTracks.length)];
    } while (nextUrl === this.lastPlayedUrl && availableTracks.length > 1);
    return nextUrl;
  }

  async playTrack(managedSource: ManagedAudioSource, url: string, startTimeInTrack: number = 0): Promise<void> {
    if (managedSource.isPlaying) {
      managedSource.sourceNode?.stop();
      managedSource.isPlaying = false;
    }

    const buffer = await this.bufferPool.loadBuffer(url);
    if (!buffer || !this.audioContext) return;

    managedSource.sourceNode = this.audioContext.createBufferSource();
    managedSource.sourceNode.buffer = buffer;
    managedSource.sourceNode.connect(managedSource.gainNode);
    managedSource.buffer = buffer;
    managedSource.url = url;
    
    const trackDurationSec = buffer.duration;
    const offset = Math.max(0, Math.min(startTimeInTrack, trackDurationSec));

    managedSource.sourceNode.start(this.audioContext.currentTime, offset);
    managedSource.isPlaying = true;
    this.lastPlayedUrl = url;

    // Schedule next track (if not already transitioning)
    if (managedSource === this.currentSource && !this.isTransitioning) {
      this.scheduleNextRegularCrossfade(trackDurationSec - offset);
    }
  }

  private scheduleNextRegularCrossfade(currentTrackRemainingDurationSec: number): void {
    if (this.nextTrackTimeoutId) clearTimeout(this.nextTrackTimeoutId);
    
    const crossfadeStartTimeMs = (currentTrackRemainingDurationSec * 1000) - WEATHER_AUDIO_CONFIG.crossfadeStartOffset - WEATHER_AUDIO_CONFIG.crossfadeDuration;

    if (crossfadeStartTimeMs <=0) {
        this.initiateCrossfade(WEATHER_AUDIO_CONFIG.crossfadeDuration);
        return;
    }

    this.nextTrackTimeoutId = setTimeout(() => {
      if (!this.isTransitioning) {
        this.initiateCrossfade(WEATHER_AUDIO_CONFIG.crossfadeDuration);
      }
    }, crossfadeStartTimeMs);
  }

  private async initiateCrossfade(durationMs: number, forceTrackUrl?: string): Promise<void> {
    if (this.nextSource.isPlaying || this.currentSource.isFading) {
      // console.warn(`${this.constructor.name}: Crossfade already in progress or next source playing during initiateCrossfade.`);
      return;
    }
    
    const nextUrl = forceTrackUrl || this.selectNextTrackUrl();
    if (!nextUrl) {
      // console.warn(`${this.constructor.name}: No next track to play for ${this.currentZoomCategory}/${this.currentWeatherData}.`);
      if (this.currentSource.url && this.currentSource.buffer && !forceTrackUrl) { // Only reschedule if not a forced transition
        this.scheduleNextRegularCrossfade(this.currentSource.buffer.duration);
      }
      return;
    }

    // console.log(`${this.constructor.name}: Initiating crossfade to ${nextUrl} (current state: ${this.currentZoomCategory}/${this.currentWeatherData}) over ${durationMs}ms`);

    const nextBuffer = await this.bufferPool.loadBuffer(nextUrl);
    if (!nextBuffer) {
        // console.error(`${this.constructor.name}: Failed to load buffer for ${nextUrl}`);
        return;
    }

    // Swap current and next sources conceptually
    const tempSource = this.currentSource;
    this.currentSource = this.nextSource; // The one that was 'next' becomes 'current'
    this.nextSource = tempSource;       // The one that was 'current' will be faded out

    // Play the new 'current' track (which was 'nextSource' conceptually)
    this.currentSource.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    await this.playTrack(this.currentSource, nextUrl);
    this.currentSource.gainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + durationMs / 1000);
    this.currentSource.isFading = false;


    // Fade out the 'nextSource' (which was the old 'current' track)
    if (this.nextSource.isPlaying && this.nextSource.buffer) {
      this.nextSource.isFading = true;
      this.nextSource.gainNode.gain.setValueAtTime(this.nextSource.gainNode.gain.value, this.audioContext.currentTime);
      this.nextSource.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + durationMs / 1000);

      if (this.crossfadeTimeoutId) clearTimeout(this.crossfadeTimeoutId);
      this.crossfadeTimeoutId = setTimeout(() => {
        if (this.nextSource.sourceNode && this.nextSource.isFading) {
          this.nextSource.sourceNode.stop();
          this.nextSource.isPlaying = false;
          this.nextSource.isFading = false;
          this.nextSource.url = null;
          this.nextSource.buffer = null;
        }
      }, durationMs + 50); // Stop a bit after fade
    }
  }

  async start(): Promise<void> {
    // console.log(`${this.constructor.name}: Starting layer.`);
    const initialUrl = this.selectNextTrackUrl();
    if (initialUrl) {
      this.currentSource.gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
      await this.playTrack(this.currentSource, initialUrl);
    }
  }

  stop(): void {
    // console.log(`${this.constructor.name}: Stopping layer.`);
    [this.currentSource, this.nextSource].forEach(src => {
      if (src.isPlaying) {
        src.sourceNode?.stop();
        src.isPlaying = false;
      }
      src.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      src.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      src.url = null;
      src.buffer = null;
    });
    if (this.nextTrackTimeoutId) clearTimeout(this.nextTrackTimeoutId);
    if (this.crossfadeTimeoutId) clearTimeout(this.crossfadeTimeoutId);
    this.isTransitioning = false;
  }

  async updateZoom(zoomPercent: number, weatherCondition: WeatherCondition): Promise<void> {
    const newZoomCategory = zoomPercent < this.zoomThreshold ? 'high' : 'mid';
    const newWeatherCondition = weatherCondition;

    if (newZoomCategory !== this.currentZoomCategory || newWeatherCondition !== this.currentWeatherData) {
      // console.log(`${this.constructor.name}: State changed. Zoom: ${this.currentZoomCategory}->${newZoomCategory}, Weather: ${this.currentWeatherData}->${newWeatherCondition}. Transitioning.`);
      this.currentZoomCategory = newZoomCategory;
      this.currentWeatherData = newWeatherCondition;
      this.isTransitioning = true;

      if (this.nextTrackTimeoutId) clearTimeout(this.nextTrackTimeoutId);
      if (this.crossfadeTimeoutId) clearTimeout(this.crossfadeTimeoutId);
      
      const transitionDuration = newWeatherCondition !== this.currentWeatherData 
                                  ? WEATHER_AUDIO_CONFIG.weatherTransitionDuration
                                  : WEATHER_AUDIO_CONFIG.zoomTransitionCrossfadeDuration;
      
      await this.initiateCrossfade(transitionDuration);
      
      setTimeout(() => {
        this.isTransitioning = false;
        if (this.currentSource.isPlaying && this.currentSource.buffer) {
            this.scheduleNextRegularCrossfade(this.currentSource.buffer.duration);
        }
      }, transitionDuration);
    }
  }

  async transitionToWeather(newWeather: WeatherCondition, durationMs: number): Promise<void> {
    if (this.currentWeatherData === newWeather && !this.isTransitioning) return; // No change or already handling a transition

    // console.log(`${this.constructor.name}: Transitioning to weather ${newWeather} from ${this.currentWeatherData}`);
    this.currentWeatherData = newWeather;
    this.isTransitioning = true;

    if (this.nextTrackTimeoutId) clearTimeout(this.nextTrackTimeoutId);
    if (this.crossfadeTimeoutId) clearTimeout(this.crossfadeTimeoutId);

    await this.initiateCrossfade(durationMs);

    setTimeout(() => {
        this.isTransitioning = false;
        if (this.currentSource.isPlaying && this.currentSource.buffer) {
            this.scheduleNextRegularCrossfade(this.currentSource.buffer.duration);
        }
    }, durationMs);
  }
}

class RainOverlayLayer extends AudioLayer {
  private variations: string[];
  private currentSource: ManagedAudioSource;
  private lastPlayedUrl: string | null = null;
  private playIntervalId: NodeJS.Timeout | null = null;
  private isFadingOut: boolean = false;

  constructor(
    audioContext: AudioContext,
    bufferPool: AudioBufferPool,
    variations: string[],
    initialVolume: number
  ) {
    super(audioContext, bufferPool, initialVolume);
    this.variations = variations;
    this.currentSource = this.createManagedSource();
    this.masterGain.gain.value = 0; // Start silent
  }

  private createManagedSource(): ManagedAudioSource {
    const gainNode = this.audioContext.createGain();
    gainNode.connect(this.masterGain); // Connect to layer's masterGain
    return { sourceNode: null, gainNode, buffer: null, url: null, isPlaying: false, isFading: false };
  }

  private selectNextTrackUrl(): string | null {
    if (this.variations.length === 0) return null;
    if (this.variations.length === 1) return this.variations[0];
    let nextUrl;
    do {
      nextUrl = this.variations[Math.floor(Math.random() * this.variations.length)];
    } while (nextUrl === this.lastPlayedUrl);
    return nextUrl;
  }

  private async playLoop(): Promise<void> {
    if (this.isFadingOut) return; // Don't start new sound if fading out
    if (this.currentSource.isPlaying) {
        this.currentSource.sourceNode?.stop();
        this.currentSource.isPlaying = false;
    }

    const url = this.selectNextTrackUrl();
    if (!url) return;

    const buffer = await this.bufferPool.loadBuffer(url);
    if (!buffer || !this.audioContext) return;

    this.currentSource.sourceNode = this.audioContext.createBufferSource();
    this.currentSource.sourceNode.buffer = buffer;
    this.currentSource.sourceNode.connect(this.currentSource.gainNode);
    this.currentSource.gainNode.gain.value = 1; // Play at full layer volume (masterGain handles actual volume)
    
    this.currentSource.sourceNode.onended = () => {
      this.currentSource.isPlaying = false;
      if (!this.isFadingOut) { // Only loop if not fading out
        this.playLoop();
      }
    };

    this.currentSource.sourceNode.start(this.audioContext.currentTime);
    this.currentSource.isPlaying = true;
    this.lastPlayedUrl = url;
  }

  fadeIn(durationMs: number): void {
    // console.log(`${this.constructor.name}: Fading in over ${durationMs}ms`);
    this.isFadingOut = false;
    this.masterGain.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.audioContext.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(this.layerVolume * this.globalVolume, this.audioContext.currentTime + durationMs / 1000);
    if (!this.currentSource.isPlaying) {
      this.playLoop();
    }
  }

  fadeOut(durationMs: number): void {
    // console.log(`${this.constructor.name}: Fading out over ${durationMs}ms`);
    this.isFadingOut = true;
    this.masterGain.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.audioContext.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + durationMs / 1000);
    
    // Stop the source after fade out
    if (this.playIntervalId) clearTimeout(this.playIntervalId);
    this.playIntervalId = setTimeout(() => {
      if (this.currentSource.isPlaying && this.isFadingOut) { // Check isFadingOut again in case fadeIn was called quickly
        this.currentSource.sourceNode?.stop();
        this.currentSource.isPlaying = false;
      }
    }, durationMs + 50);
  }

  start(): void { /* Managed by fadeIn */ }
  stop(): void {
    this.isFadingOut = true;
    if (this.playIntervalId) clearTimeout(this.playIntervalId);
    if (this.currentSource.isPlaying) {
      this.currentSource.sourceNode?.stop();
      this.currentSource.isPlaying = false;
    }
    this.masterGain.gain.value = 0;
  }
  updateZoom(zoomPercent: number, weatherCondition: WeatherCondition): void { /* Rain is not zoom dependent */ }
}


class TriggerAudioLayer extends AudioLayer {
  private variationsLow: string[];
  private variationsMid: string[];
  private zoomThreshold: number;
  private triggerTimeoutId: NodeJS.Timeout | null = null;
  private source: ManagedAudioSource;

  constructor(
    audioContext: AudioContext,
    bufferPool: AudioBufferPool,
    variationsLow: string[],
    variationsMid: string[],
    zoomThreshold: number,
    initialVolume: number
  ) {
    super(audioContext, bufferPool, initialVolume);
    this.variationsLow = variationsLow;
    this.variationsMid = variationsMid;
    this.zoomThreshold = zoomThreshold; // This is WEATHER_AUDIO_CONFIG.zoomHighToMidGeneral
    this.source = this.createManagedSource();
  }

  private createManagedSource(): ManagedAudioSource {
    const gainNode = this.audioContext.createGain();
    gainNode.connect(this.masterGain);
    return { sourceNode: null, gainNode, buffer: null, url: null, isPlaying: false, isFading: false };
  }

  private selectTrackUrl(): string | null {
    let selectedTracks;
    // currentZoomCategory is 'high' or 'mid'
    if (this.currentZoomCategory === 'high') { // Corresponds to birds_low
      selectedTracks = this.variationsLow;
    } else { // Corresponds to mix of birds_low and birds_mid
      const useMid = Math.random() < 0.4; // 40% chance for mid
      selectedTracks = useMid && this.variationsMid.length > 0 ? this.variationsMid : this.variationsLow;
    }
    if (!selectedTracks || selectedTracks.length === 0) return null;
    return selectedTracks[Math.floor(Math.random() * selectedTracks.length)];
  }

  private async playTriggeredSound(): Promise<void> {
    if (this.source.isPlaying) return; // Don't overlap

    const url = this.selectTrackUrl();
    if (!url) return;

    const buffer = await this.bufferPool.loadBuffer(url);
    if (!buffer || !this.audioContext) return;

    this.source.sourceNode = this.audioContext.createBufferSource();
    this.source.sourceNode.buffer = buffer;
    this.source.sourceNode.connect(this.source.gainNode);
    this.source.gainNode.gain.setValueAtTime(1, this.audioContext.currentTime); // Play at full layer volume
    
    this.source.sourceNode.onended = () => {
      this.source.isPlaying = false;
      this.source.url = null;
      this.source.buffer = null;
      // Check if still active before scheduling next
      if (this.masterGain.gain.value > 0) { // A simple check if layer is supposed to be audible
          this.scheduleNextTrigger();
      }
    };

    this.source.sourceNode.start(this.audioContext.currentTime);
    this.source.isPlaying = true;
    this.source.url = url;
    this.source.buffer = buffer;
  }

  private scheduleNextTrigger(): void {
    if (this.triggerTimeoutId) clearTimeout(this.triggerTimeoutId);
    const interval = WEATHER_AUDIO_CONFIG.birdMinInterval + Math.random() * (WEATHER_AUDIO_CONFIG.birdMaxInterval - WEATHER_AUDIO_CONFIG.birdMinInterval);
    this.triggerTimeoutId = setTimeout(() => {
        if (this.masterGain.gain.value > 0) { // Check again before playing
            this.playTriggeredSound();
        } else {
            // If volume is 0, don't play, but reschedule to check later
            this.scheduleNextTrigger();
        }
    }, interval);
  }

  start(): void {
    // console.log(`${this.constructor.name}: Starting layer.`);
    if (this.masterGain.gain.value > 0) { // Only start scheduling if audible
        this.scheduleNextTrigger();
    }
  }

  stop(): void {
    // console.log(`${this.constructor.name}: Stopping layer.`);
    if (this.triggerTimeoutId) clearTimeout(this.triggerTimeoutId);
    if (this.source.isPlaying && this.source.sourceNode) {
      this.source.sourceNode.onended = null; // Remove onended to prevent rescheduling
      this.source.sourceNode.stop();
      this.source.isPlaying = false;
    }
    this.source.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.source.url = null;
    this.source.buffer = null;
  }

  updateZoom(zoomPercent: number, weatherCondition: WeatherCondition): void { // WeatherCondition might not be used by birds directly but good for signature consistency
    const newZoomCategory = zoomPercent < this.zoomThreshold ? 'high' : 'mid';
    if (newZoomCategory !== this.currentZoomCategory) {
        this.currentZoomCategory = newZoomCategory;
        // No immediate sound change, selection happens at trigger time.
        // If it was silent and becomes audible due to volume change, schedule trigger.
        if (this.masterGain.gain.value > 0 && !this.triggerTimeoutId && !this.source.isPlaying) {
            this.scheduleNextTrigger();
        }
    }
  }
}


export class AmbientAudioManager {
  private audioContext: AudioContext | null = null;
  private bufferPool: AudioBufferPool | null = null;
  private masterVolume: number = 0.5;
  private isInitialized: boolean = false;
  private isPlaying: boolean = false;
  private currentWeatherData: WeatherData | null = null;

  public waterLayer: CrossfadeAudioLayer | null = null;
  public windLayer: CrossfadeAudioLayer | null = null;
  public birdLayer: TriggerAudioLayer | null = null;
  public rainLayer: RainOverlayLayer | null = null;

  private lastZoomPercent: number = -1;
  private zoomUpdateTimeoutId: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
        eventBus.subscribe(EventTypes.AUDIO_SETTINGS_CHANGED, this.handleGlobalAudioSettings.bind(this));
        eventBus.subscribe(EventTypes.WEATHER_UPDATED, this.handleWeatherUpdate.bind(this));
        
        const savedSettings = localStorage.getItem('citizenSettings');
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                if (settings.masterVolume !== undefined && settings.ambientVolume !== undefined && settings.isMuted !== undefined) {
                    this.masterVolume = settings.isMuted ? 0 : (settings.ambientVolume / 100) * (settings.masterVolume / 100);
                } else if (settings.ambientVolume !== undefined) {
                    this.masterVolume = settings.ambientVolume / 100;
                }
            } catch (e) {
                console.error("AmbientAudioManager: Error parsing citizenSettings for initial volume", e);
            }
        }
    }
  }

  private handleGlobalAudioSettings(detail: any): void {
    const { masterVolume, ambientVolume, isMuted } = detail;
    let newCalculatedVolume = this.masterVolume;
    if (masterVolume !== undefined && ambientVolume !== undefined && isMuted !== undefined) {
      newCalculatedVolume = isMuted ? 0 : (ambientVolume / 100) * (masterVolume / 100);
    } else if (ambientVolume !== undefined) {
      newCalculatedVolume = ambientVolume / 100;
    }
    this.setMasterVolume(newCalculatedVolume);
  }

  private handleWeatherUpdate(weatherData: WeatherData): void {
    if (!this.isInitialized || !this.isPlaying) return;
    // console.log('[AmbientAudioManager] Weather updated:', weatherData);
    this.currentWeatherData = weatherData;

    const weatherCondition = weatherData.condition || 'clear';

    this.waterLayer?.transitionToWeather(weatherCondition, WEATHER_AUDIO_CONFIG.weatherTransitionDuration);
    this.windLayer?.transitionToWeather(weatherCondition, WEATHER_AUDIO_CONFIG.weatherTransitionDuration);

    // Adjust wind layer volume based on actual wind speed
    let windSpeedFactor = 1.0;
    if (weatherCondition === 'windy') {
        // Scale volume between 1.0 and 1.5 for wind speeds from WINDY_THRESHOLD_MPS to e.g. 15 m/s
        const maxWindSpeedEffect = 15.0; // Max wind speed that further increases volume
        windSpeedFactor = 1.0 + 0.5 * Math.min(1, (weatherData.windSpeed - WEATHER_AUDIO_CONFIG.windyThresholdMPS) / (maxWindSpeedEffect - WEATHER_AUDIO_CONFIG.windyThresholdMPS));
    }
    const baseWindVolume = this.lastZoomPercent < WEATHER_AUDIO_CONFIG.zoomHighToMidGeneral 
                            ? WEATHER_AUDIO_CONFIG.windBaseVolume * 1.1 // Slightly louder for high zoom wind
                            : WEATHER_AUDIO_CONFIG.windBaseVolume;
    this.windLayer?.setLayerVolume(Math.min(1.0, baseWindVolume * windSpeedFactor));


    if (weatherCondition === 'rainy') {
      this.rainLayer?.fadeIn(WEATHER_AUDIO_CONFIG.weatherTransitionDuration);
      this.birdLayer?.setLayerVolume(WEATHER_AUDIO_CONFIG.birdVolume * 0.3); // Reduce bird volume by 70%
      // If birds were silent and now should be audible (even if reduced), ensure they start scheduling
      if (this.birdLayer && this.masterVolume > 0 && WEATHER_AUDIO_CONFIG.birdVolume * 0.3 > 0) {
        this.birdLayer.start(); 
      }
    } else {
      this.rainLayer?.fadeOut(WEATHER_AUDIO_CONFIG.weatherTransitionDuration);
      this.birdLayer?.setLayerVolume(WEATHER_AUDIO_CONFIG.birdVolume);
       // If birds were silent and now should be audible, ensure they start scheduling
      if (this.birdLayer && this.masterVolume > 0 && WEATHER_AUDIO_CONFIG.birdVolume > 0) {
        this.birdLayer.start();
      }
    }
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;
    if (typeof window === 'undefined') return false;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await this.audioContext.resume(); // Required for autoplay policy
      
      this.bufferPool = new AudioBufferPool(this.audioContext);

      const assetsToPreload = [
        ...(weatherAudioAssets.water.high.clear || []),
        ...(weatherAudioAssets.water.mid.clear || []),
        ...(weatherAudioAssets.wind.high.clear || []),
        ...(weatherAudioAssets.wind.mid.clear || []),
        ...(weatherAudioAssets.birds.low || []),
        ...(weatherAudioAssets.rain || []),
      ].slice(0,1); // Preload first of each category initially
      await this.bufferPool.preloadAssets(assetsToPreload);

      this.waterLayer = new CrossfadeAudioLayer(
        this.audioContext, this.bufferPool,
        weatherAudioAssets.water,
        WEATHER_AUDIO_CONFIG.zoomHighToMidGeneral, WEATHER_AUDIO_CONFIG.waterBaseVolume
      );
      this.windLayer = new CrossfadeAudioLayer(
        this.audioContext, this.bufferPool,
        weatherAudioAssets.wind,
        WEATHER_AUDIO_CONFIG.zoomHighToMidGeneral, WEATHER_AUDIO_CONFIG.windBaseVolume // Base volume, will be adjusted by zoom/weather
      );
      this.birdLayer = new TriggerAudioLayer(
        this.audioContext, this.bufferPool,
        weatherAudioAssets.birds.low, weatherAudioAssets.birds.mid,
        WEATHER_AUDIO_CONFIG.zoomHighToMidGeneral, WEATHER_AUDIO_CONFIG.birdVolume
      );
      this.rainLayer = new RainOverlayLayer(
        this.audioContext, this.bufferPool,
        weatherAudioAssets.rain,
        WEATHER_AUDIO_CONFIG.rainOverlayVolume
      );
      
      this.setMasterVolume(this.masterVolume); 

      // Get initial weather state
      this.currentWeatherData = weatherService.getCurrentWeather();
      if (this.currentWeatherData) {
        this.handleWeatherUpdate(this.currentWeatherData); // Apply initial weather effects (silently if not playing yet)
      } else {
        // console.warn("[AmbientAudioManager] No initial weather data available on init.");
        // Default to clear weather audio setup if needed, though handleWeatherUpdate should do this with null data
        this.handleWeatherUpdate(this.currentWeatherData || { condition: 'clear', windSpeed: 0 } as WeatherData);
      }


      this.isInitialized = true;
      // console.log("AmbientAudioManager initialized successfully.");
      return true;
    } catch (error) {
      console.error("Failed to initialize AmbientAudioManager:", error);
      this.isInitialized = false;
      return false;
    }
  }

  start(): void {
    if (!this.isInitialized || this.isPlaying || !this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        // console.log("AudioContext resumed, starting layers.");
        this.actuallyStartLayers();
      });
    } else {
      this.actuallyStartLayers();
    }
  }

  private actuallyStartLayers(): void {
    this.waterLayer?.start();
    
    setTimeout(() => {
        this.windLayer?.start();
    }, WEATHER_AUDIO_CONFIG.windLayerOffset);

    this.birdLayer?.start();
    // Rain layer is started by weather conditions via fadeIn
    
    this.isPlaying = true;
    // console.log("AmbientAudioManager started with all layers.");
    // Apply current weather conditions actively now that we are playing
    if (this.currentWeatherData) {
        this.handleWeatherUpdate(this.currentWeatherData);
    }
  }

  stop(): void {
    if (!this.isInitialized || !this.isPlaying) return;
    this.waterLayer?.stop();
    this.windLayer?.stop();
    this.birdLayer?.stop();
    this.rainLayer?.stop();
    this.isPlaying = false;
    // console.log("AmbientAudioManager stopped.");
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    // console.log(`AmbientAudioManager: Master volume set to ${this.masterVolume}`);
    if (!this.isInitialized) return;
    
    this.waterLayer?.setGlobalVolume(this.masterVolume);
    this.windLayer?.setGlobalVolume(this.masterVolume); 
    this.birdLayer?.setGlobalVolume(this.masterVolume);
    this.rainLayer?.setGlobalVolume(this.masterVolume);

    // If volume was 0 and now it's > 0, and birds were supposed to play, restart their scheduling
    if (this.masterVolume > 0 && this.birdLayer && WEATHER_AUDIO_CONFIG.birdVolume > 0) {
        const currentBirdLayerVolume = this.currentWeatherData?.condition === 'rainy' 
            ? WEATHER_AUDIO_CONFIG.birdVolume * 0.3 
            : WEATHER_AUDIO_CONFIG.birdVolume;
        if (currentBirdLayerVolume > 0) {
            this.birdLayer.start(); // Will internally check if already scheduling
        }
    }
  }

  updateZoom(zoomPercent: number): void {
    if (!this.isInitialized || !this.isPlaying) return;

    if (this.zoomUpdateTimeoutId) clearTimeout(this.zoomUpdateTimeoutId);

    this.zoomUpdateTimeoutId = setTimeout(() => {
        if (Math.abs(zoomPercent - this.lastZoomPercent) < 1 && this.lastZoomPercent !== -1) return; 
        this.lastZoomPercent = zoomPercent;

        const weatherCond = this.currentWeatherData?.condition || 'clear';
        // console.log(`AmbientAudioManager: Updating zoom to ${zoomPercent.toFixed(1)}% with weather ${weatherCond}`);
        
        this.waterLayer?.updateZoom(zoomPercent, weatherCond);
        this.windLayer?.updateZoom(zoomPercent, weatherCond);
        this.birdLayer?.updateZoom(zoomPercent, weatherCond);
        // Rain layer is not zoom dependent

        // Adjust wind layer's base volume based on zoom (before weather modulation)
        const baseWindVolume = zoomPercent < WEATHER_AUDIO_CONFIG.zoomHighToMidGeneral 
                                ? WEATHER_AUDIO_CONFIG.windBaseVolume * 1.1 // Slightly louder for high zoom wind
                                : WEATHER_AUDIO_CONFIG.windBaseVolume;
        // Re-apply weather modulation for wind
        let windSpeedFactor = 1.0;
        if (this.currentWeatherData && this.currentWeatherData.condition === 'windy') {
            const maxWindSpeedEffect = 15.0;
            windSpeedFactor = 1.0 + 0.5 * Math.min(1, (this.currentWeatherData.windSpeed - WEATHER_AUDIO_CONFIG.windyThresholdMPS) / (maxWindSpeedEffect - WEATHER_AUDIO_CONFIG.windyThresholdMPS));
        }
        this.windLayer?.setLayerVolume(Math.min(1.0, baseWindVolume * windSpeedFactor));


    }, WEATHER_AUDIO_CONFIG.zoomDebounceTime);
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }
}

export const ambientAudioManager = new AmbientAudioManager();
