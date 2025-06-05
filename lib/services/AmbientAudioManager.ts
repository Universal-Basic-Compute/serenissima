
import { eventBus, EventTypes } from '../utils/eventBus'; // Assuming eventBus is available for settings

const AUDIO_BASE_PATH = '/sounds/';

export const AUDIO_CONFIG = {
  trackDuration: 22000,         // Track length in ms
  crossfadeStartOffset: 2000,   // How long before track end to start crossfade (ms) (22s - 2s = 20s)
  crossfadeDuration: 4000,      // Total crossfade time (ms)
  zoomTransitionCrossfadeDuration: 1500, // Zoom level change crossfade (ms)
  birdMinInterval: 45000,       // Minimum bird trigger interval (ms)
  birdMaxInterval: 90000,       // Maximum bird trigger interval (ms)
  zoomDebounceTime: 300,        // Debounce time for zoom updates affecting audio
  
  // Volume levels (0.0 to 1.0)
  waterBaseVolume: 0.8, // Adjusted from 1.0 for better mixing
  windHighVolume: 0.5,  // Adjusted from 0.7
  windMidVolume: 0.35, // Adjusted from 0.5
  birdVolume: 0.25,

  // Zoom thresholds (0-100%)
  waterZoomThreshold: 40, // Percentage
  windZoomThreshold: 40,  // Percentage
  birdZoomThreshold: 40,  // Percentage

  // Wind layer crossfade offset from water layer
  windLayerOffset: 5000, // ms
};

export const audioAssets = {
  water_high: [
    'atmospheric_water_high_1.mp3', 
    'atmospheric_water_high_2.mp3', 
    'atmospheric_water_high_3.mp3'
  ],
  water_mid: [
    'atmospheric_water_mid_1.mp3', 
    'atmospheric_water_mid_2.mp3', 
    'atmospheric_water_mid_3.mp3', 
    'atmospheric_water_mid_4.mp3'
  ],
  wind_high: ['wind_high_1.mp3', 'wind_high_2.mp3'],
  wind_mid: ['wind_mid_1.mp3', 'wind_mid_2.mp3'],
  birds_low: ['birds_low_1.mp3', 'birds_low_2.mp3'],
  birds_mid: ['birds_mid_1.mp3']
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
  protected layerVolume: number = 1.0; // Specific volume for this layer
  protected globalVolume: number = 1.0; // Master volume affecting this layer
  protected currentZoomCategory: 'high' | 'mid' | 'low' = 'high'; // Generic, can be adapted

  constructor(audioContext: AudioContext, bufferPool: AudioBufferPool, initialVolume: number) {
    this.audioContext = audioContext;
    this.bufferPool = bufferPool;
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.layerVolume = initialVolume;
    this.updateGain();
  }

  protected updateGain(): void {
    this.masterGain.gain.value = this.layerVolume * this.globalVolume;
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
  abstract updateZoom(zoomPercent: number): void;
}

class CrossfadeAudioLayer extends AudioLayer {
  private variationsHigh: string[];
  private variationsMid: string[];
  private zoomThreshold: number;

  private currentSource: ManagedAudioSource;
  private nextSource: ManagedAudioSource;
  
  private currentTrackUrl: string | null = null;
  private nextTrackTimeoutId: NodeJS.Timeout | null = null;
  private crossfadeTimeoutId: NodeJS.Timeout | null = null;
  private isTransitioningZoom: boolean = false;
  private lastPlayedUrl: string | null = null;

  constructor(
    audioContext: AudioContext,
    bufferPool: AudioBufferPool,
    variationsHigh: string[],
    variationsMid: string[],
    zoomThreshold: number,
    initialVolume: number
  ) {
    super(audioContext, bufferPool, initialVolume);
    this.variationsHigh = variationsHigh;
    this.variationsMid = variationsMid;
    this.zoomThreshold = zoomThreshold;

    this.currentSource = this.createManagedSource();
    this.nextSource = this.createManagedSource();
  }

  private createManagedSource(): ManagedAudioSource {
    const gainNode = this.audioContext.createGain();
    gainNode.connect(this.masterGain);
    return { sourceNode: null, gainNode, buffer: null, url: null, isPlaying: false, isFading: false };
  }

  private getVariationsForCurrentZoom(): string[] {
    return this.currentZoomCategory === 'high' ? this.variationsHigh : this.variationsMid;
  }

  private selectNextTrackUrl(): string | null {
    const availableTracks = this.getVariationsForCurrentZoom();
    if (availableTracks.length === 0) return null;
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

    // Schedule next track (if not already transitioning for zoom)
    if (managedSource === this.currentSource && !this.isTransitioningZoom) {
      this.scheduleNextRegularCrossfade(trackDurationSec - offset);
    }
  }

  private scheduleNextRegularCrossfade(currentTrackRemainingDurationSec: number): void {
    if (this.nextTrackTimeoutId) clearTimeout(this.nextTrackTimeoutId);
    
    const crossfadeStartTimeMs = (currentTrackRemainingDurationSec * 1000) - AUDIO_CONFIG.crossfadeStartOffset - AUDIO_CONFIG.crossfadeDuration;

    if (crossfadeStartTimeMs <=0) { // If track is too short or already past the point
        this.initiateCrossfade(AUDIO_CONFIG.crossfadeDuration);
        return;
    }

    this.nextTrackTimeoutId = setTimeout(() => {
      if (!this.isTransitioningZoom) { // Don't start regular crossfade if a zoom transition is happening
        this.initiateCrossfade(AUDIO_CONFIG.crossfadeDuration);
      }
    }, crossfadeStartTimeMs);
  }

  private async initiateCrossfade(durationMs: number): Promise<void> {
    if (this.nextSource.isPlaying || this.currentSource.isFading) {
      // console.warn(`${this.constructor.name}: Crossfade already in progress or next source playing.`);
      return;
    }
    
    const nextUrl = this.selectNextTrackUrl();
    if (!nextUrl) {
      // console.warn(`${this.constructor.name}: No next track to play.`);
      // Optionally, replay current if no other option
      if (this.currentSource.url && this.currentSource.buffer) {
        this.scheduleNextRegularCrossfade(this.currentSource.buffer.duration);
      }
      return;
    }

    // console.log(`${this.constructor.name}: Initiating crossfade to ${nextUrl} over ${durationMs}ms`);

    const nextBuffer = await this.bufferPool.loadBuffer(nextUrl);
    if (!nextBuffer) return;

    // Swap current and next sources
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
    this.isTransitioningZoom = false;
  }

  async updateZoom(zoomPercent: number): Promise<void> {
    const newCategory = zoomPercent < this.zoomThreshold ? 'high' : 'mid';
    if (newCategory !== this.currentZoomCategory) {
      // console.log(`${this.constructor.name}: Zoom category changed from ${this.currentZoomCategory} to ${newCategory}. Transitioning.`);
      this.currentZoomCategory = newCategory;
      this.isTransitioningZoom = true;

      if (this.nextTrackTimeoutId) clearTimeout(this.nextTrackTimeoutId);
      if (this.crossfadeTimeoutId) clearTimeout(this.crossfadeTimeoutId);
      
      // Start immediate crossfade to a track from the new category
      await this.initiateCrossfade(AUDIO_CONFIG.zoomTransitionCrossfadeDuration);
      
      // After zoom transition, allow regular crossfades again
      // Schedule this to happen after the zoom crossfade completes
      setTimeout(() => {
        this.isTransitioningZoom = false;
        // If currentSource is playing and has a buffer, schedule its next regular crossfade
        if (this.currentSource.isPlaying && this.currentSource.buffer) {
            const elapsedTime = this.audioContext.currentTime - (this.currentSource.sourceNode?.context.currentTime ?? this.audioContext.currentTime); // This needs refinement
            // A simpler way: just use the full duration for scheduling next, as we just started a new track.
            this.scheduleNextRegularCrossfade(this.currentSource.buffer.duration);
        }
      }, AUDIO_CONFIG.zoomTransitionCrossfadeDuration);
    }
  }
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
    this.zoomThreshold = zoomThreshold;
    this.source = this.createManagedSource();
  }

  private createManagedSource(): ManagedAudioSource {
    const gainNode = this.audioContext.createGain();
    gainNode.connect(this.masterGain);
    return { sourceNode: null, gainNode, buffer: null, url: null, isPlaying: false, isFading: false };
  }

  private selectTrackUrl(): string | null {
    let selectedTracks;
    if (this.currentZoomCategory === 'high') { // Corresponds to birds_low
      selectedTracks = this.variationsLow;
    } else { // Corresponds to mix of birds_low and birds_mid
      const useMid = Math.random() < 0.4; // 40% chance for mid
      selectedTracks = useMid ? this.variationsMid : this.variationsLow;
    }
    if (selectedTracks.length === 0) return null;
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
      this.scheduleNextTrigger(); // Schedule next bird sound after this one finishes
    };

    this.source.sourceNode.start(this.audioContext.currentTime);
    this.source.isPlaying = true;
    this.source.url = url;
    this.source.buffer = buffer;
  }

  private scheduleNextTrigger(): void {
    if (this.triggerTimeoutId) clearTimeout(this.triggerTimeoutId);
    const interval = AUDIO_CONFIG.birdMinInterval + Math.random() * (AUDIO_CONFIG.birdMaxInterval - AUDIO_CONFIG.birdMinInterval);
    this.triggerTimeoutId = setTimeout(() => {
      this.playTriggeredSound();
    }, interval);
  }

  start(): void {
    // console.log(`${this.constructor.name}: Starting layer.`);
    this.scheduleNextTrigger();
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

  updateZoom(zoomPercent: number): void {
    this.currentZoomCategory = zoomPercent < this.zoomThreshold ? 'high' : 'mid';
    // No immediate action on zoom change, selection happens at trigger time
  }
}


export class AmbientAudioManager {
  private audioContext: AudioContext | null = null;
  private bufferPool: AudioBufferPool | null = null;
  private masterVolume: number = 0.5; // Overall master volume for ambient sounds
  private isInitialized: boolean = false;
  private isPlaying: boolean = false;

  public waterLayer: CrossfadeAudioLayer | null = null;
  public windLayer: CrossfadeAudioLayer | null = null;
  public birdLayer: TriggerAudioLayer | null = null;

  private lastZoomPercent: number = -1;
  private zoomUpdateTimeoutId: NodeJS.Timeout | null = null;

  constructor() {
    // Listen to global settings changes for master volume
    if (typeof window !== 'undefined') {
        eventBus.subscribe(EventTypes.AUDIO_SETTINGS_CHANGED, this.handleGlobalAudioSettings.bind(this));
        // Attempt to get initial settings
        const savedSettings = localStorage.getItem('citizenSettings');
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                if (settings.masterVolume !== undefined && settings.ambientVolume !== undefined && settings.isMuted !== undefined) {
                    this.masterVolume = settings.isMuted ? 0 : (settings.ambientVolume / 100) * (settings.masterVolume / 100);
                } else if (settings.ambientVolume !== undefined) {
                    this.masterVolume = settings.ambientVolume / 100; // Assume master 100% and not muted
                }
            } catch (e) {
                console.error("AmbientAudioManager: Error parsing citizenSettings for initial volume", e);
            }
        }
    }
  }

  private handleGlobalAudioSettings(detail: any): void {
    const { masterVolume, ambientVolume, isMuted } = detail;
    if (masterVolume !== undefined && ambientVolume !== undefined && isMuted !== undefined) {
      const newMasterAmbientVolume = isMuted ? 0 : (ambientVolume / 100) * (masterVolume / 100);
      this.setMasterVolume(newMasterAmbientVolume);
    } else if (ambientVolume !== undefined) {
      // Fallback if only ambientVolume is sent (less likely with current Settings.tsx)
      this.setMasterVolume(ambientVolume / 100);
    }
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;
    if (typeof window === 'undefined') return false;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await this.audioContext.resume(); // Required for autoplay policy
      
      this.bufferPool = new AudioBufferPool(this.audioContext);

      // Preload some initial assets
      const assetsToPreload = [
        ...audioAssets.water_high.slice(0,1),
        ...audioAssets.water_mid.slice(0,1),
        ...audioAssets.wind_high.slice(0,1),
        ...audioAssets.wind_mid.slice(0,1),
        ...audioAssets.birds_low.slice(0,1),
      ];
      await this.bufferPool.preloadAssets(assetsToPreload);

      this.waterLayer = new CrossfadeAudioLayer(
        this.audioContext, this.bufferPool,
        audioAssets.water_high, audioAssets.water_mid,
        AUDIO_CONFIG.waterZoomThreshold, AUDIO_CONFIG.waterBaseVolume
      );
      this.windLayer = new CrossfadeAudioLayer(
        this.audioContext, this.bufferPool,
        audioAssets.wind_high, audioAssets.wind_mid,
        AUDIO_CONFIG.windZoomThreshold, 1.0 // Wind layer volume is controlled by its own config
      );
      this.birdLayer = new TriggerAudioLayer(
        this.audioContext, this.bufferPool,
        audioAssets.birds_low, audioAssets.birds_mid,
        AUDIO_CONFIG.birdZoomThreshold, AUDIO_CONFIG.birdVolume
      );
      
      this.setMasterVolume(this.masterVolume); // Apply initial master volume

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
    
    // Offset wind layer start
    setTimeout(() => {
        this.windLayer?.start();
    }, AUDIO_CONFIG.windLayerOffset);

    this.birdLayer?.start();
    this.isPlaying = true;
    // console.log("AmbientAudioManager started.");
  }

  stop(): void {
    if (!this.isInitialized || !this.isPlaying) return;
    this.waterLayer?.stop();
    this.windLayer?.stop();
    this.birdLayer?.stop();
    this.isPlaying = false;
    // console.log("AmbientAudioManager stopped.");
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    // console.log(`AmbientAudioManager: Master volume set to ${this.masterVolume}`);
    if (!this.isInitialized) return;
    
    this.waterLayer?.setGlobalVolume(this.masterVolume);
    // Wind layer volume is a combination of its specific high/mid setting and master
    // This logic is now handled inside CrossfadeAudioLayer's setGlobalVolume and setLayerVolume
    this.windLayer?.setGlobalVolume(this.masterVolume); 
    this.birdLayer?.setGlobalVolume(this.masterVolume);
  }

  updateZoom(zoomPercent: number): void {
    if (!this.isInitialized || !this.isPlaying) return;

    if (this.zoomUpdateTimeoutId) clearTimeout(this.zoomUpdateTimeoutId);

    this.zoomUpdateTimeoutId = setTimeout(() => {
        if (Math.abs(zoomPercent - this.lastZoomPercent) < 1) return; // Ignore tiny changes
        this.lastZoomPercent = zoomPercent;

        // console.log(`AmbientAudioManager: Updating zoom to ${zoomPercent.toFixed(1)}%`);
        this.waterLayer?.updateZoom(zoomPercent);
        this.windLayer?.updateZoom(zoomPercent);
        this.birdLayer?.updateZoom(zoomPercent);

        // Adjust wind layer's specific volume based on zoom
        const windVolume = zoomPercent < AUDIO_CONFIG.windZoomThreshold ? AUDIO_CONFIG.windHighVolume : AUDIO_CONFIG.windMidVolume;
        this.windLayer?.setLayerVolume(windVolume);

    }, AUDIO_CONFIG.zoomDebounceTime);
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }
}

export const ambientAudioManager = new AmbientAudioManager();
