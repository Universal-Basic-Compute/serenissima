import { eventBus, EventTypes } from '../utils/eventBus';

// Add the missing event type if it doesn't exist in EventTypes
declare module '../utils/eventBus' {
  interface EventTypes {
    INCOME_DATA_SIMULATED: string;
  }
}

export interface IncomeData {
  polygonId: string;
  income: number;
  rawIncome?: number;
  buildingPointsCount?: number;
}

export class IncomeDataService {
  private static instance: IncomeDataService;
  private incomeData: Map<string, number> = new Map();
  private minIncome: number = 0;
  private maxIncome: number = 1000; // Default max income
  private isLoading: boolean = false;
  
  private constructor() {}
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): IncomeDataService {
    if (!IncomeDataService.instance) {
      IncomeDataService.instance = new IncomeDataService();
    }
    return IncomeDataService.instance;
  }
  
  /**
   * Get income data for a specific polygon
   * @param polygonId The polygon ID
   * @returns The income value or undefined if not found
   */
  public getIncome(polygonId: string): number | undefined {
    return this.incomeData.get(polygonId);
  }
  
  /**
   * Get all income data
   * @returns A Map of polygon IDs to income values
   */
  public getAllIncomeData(): Map<string, number> {
    return new Map(this.incomeData);
  }
  
  /**
   * Get the minimum income value
   */
  public getMinIncome(): number {
    return this.minIncome;
  }
  
  /**
   * Get the maximum income value
   */
  public getMaxIncome(): number {
    return this.maxIncome;
  }
  
  /**
   * Check if data is currently loading
   */
  public isDataLoading(): boolean {
    return this.isLoading;
  }
  
  /**
   * Set income data for multiple polygons
   * @param data Array of income data objects
   */
  public setIncomeData(data: IncomeData[]): void {
    // Update the income data map
    data.forEach(item => {
      this.incomeData.set(item.polygonId, item.income);
    });
    
    // Recalculate min and max income
    this.calculateMinMaxIncome();
    
    // Notify listeners that income data has changed
    eventBus.emit(EventTypes.INCOME_DATA_UPDATED, {
      minIncome: this.minIncome,
      maxIncome: this.maxIncome,
      dataCount: this.incomeData.size,
      timestamp: Date.now()
    });
    
    console.log(`Income data updated: ${this.incomeData.size} entries, min=${this.minIncome}, max=${this.maxIncome}`);
  }
  
  /**
   * Set income for a specific polygon
   * @param polygonId The polygon ID
   * @param income The income value
   */
  public setIncome(polygonId: string, income: number): void {
    this.incomeData.set(polygonId, income);
    
    // Recalculate min and max income
    this.calculateMinMaxIncome();
    
    // Notify listeners that income data has changed
    eventBus.emit(EventTypes.POLYGON_INCOME_UPDATED, {
      polygonId,
      income,
      minIncome: this.minIncome,
      maxIncome: this.maxIncome
    });
  }
  
  /**
   * Load income data from the server
   * @returns A promise that resolves when data is loaded
   */
  public async loadIncomeData(): Promise<void> {
    this.isLoading = true;
    
    try {
      console.log('IncomeDataService: Fetching income data from API...');
      const response = await fetch('/api/get-income-data');
      if (!response.ok) {
        throw new Error(`Failed to load income data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data && Array.isArray(data.incomeData)) {
        console.log(`IncomeDataService: Received ${data.incomeData.length} income data points`);
        this.setIncomeData(data.incomeData);
      } else {
        console.warn('IncomeDataService: No income data received from API');
        // Use simulated data as fallback
        this.generateLastIncomeData();
      }
    } catch (error) {
      console.error('Error loading income data:', error);
      // Use simulated data as fallback
      this.generateLastIncomeData();
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * Generate last income data for testing
   * @param polygons Optional array of polygons to generate data for
   */
  public generateLastIncomeData(polygons?: any[]): void {
    console.log(`Generating last income data. Polygons provided: ${polygons ? polygons.length : 'none'}`);
    
    // If polygons are provided, generate data for them
    if (polygons && polygons.length > 0) {
      const simulatedData: IncomeData[] = polygons.map(polygon => {
        // Generate a more varied range of incomes for better visualization
        // Use a distribution that ensures we have low, medium, and high values
        let income: number;
        const rand = Math.random();
        
        if (rand < 0.3) {
          // 30% chance of low income (0-300)
          income = Math.random() * 300;
        } else if (rand < 0.7) {
          // 40% chance of medium income (300-700)
          income = 300 + Math.random() * 400;
        } else {
          // 30% chance of high income (700-1000)
          income = 700 + Math.random() * 300;
        }
        
        return {
          polygonId: polygon.id,
          income: income
        };
      });
      
      console.log(`Generated ${simulatedData.length} income data points`);
      console.log('Sample of generated data:', simulatedData.slice(0, 5));
      
      this.setIncomeData(simulatedData);
      
      // Emit a specific event for simulated data
      eventBus.emit(EventTypes.INCOME_DATA_UPDATED, {
        count: simulatedData.length,
        minIncome: this.minIncome,
        maxIncome: this.maxIncome,
        timestamp: Date.now()
      });
    } else {
      // Otherwise, generate random data for existing polygon IDs
      const simulatedData: IncomeData[] = Array.from(this.incomeData.keys()).map(polygonId => {
        // Use the same varied distribution as above
        let income: number;
        const rand = Math.random();
        
        if (rand < 0.3) {
          income = Math.random() * 300;
        } else if (rand < 0.7) {
          income = 300 + Math.random() * 400;
        } else {
          income = 700 + Math.random() * 300;
        }
        
        return {
          polygonId,
          income: income
        };
      });
      
      if (simulatedData.length > 0) {
        console.log(`Generated ${simulatedData.length} income data points from existing keys`);
        console.log('Sample of generated data:', simulatedData.slice(0, 5));
        this.setIncomeData(simulatedData);
        
        // Emit a specific event for simulated data
        eventBus.emit(EventTypes.INCOME_DATA_UPDATED, {
          count: simulatedData.length,
          minIncome: this.minIncome,
          maxIncome: this.maxIncome,
          timestamp: Date.now()
        });
      } else {
        console.warn('No existing income data keys to generate from');
      }
    }
  }
  
  /**
   * Calculate the minimum and maximum income values
   */
  private calculateMinMaxIncome(): void {
    if (this.incomeData.size === 0) {
      this.minIncome = 0;
      this.maxIncome = 1000;
      console.log('No income data, using default min/max: 0/1000');
      return;
    }
    
    const incomeValues = Array.from(this.incomeData.values());
    this.minIncome = Math.min(...incomeValues);
    this.maxIncome = Math.max(...incomeValues);
    
    console.log(`Calculated min income: ${this.minIncome}, max income: ${this.maxIncome}`);
    
    // Ensure we have a reasonable range
    if (this.minIncome === this.maxIncome) {
      this.minIncome = Math.max(0, this.minIncome - 100);
      this.maxIncome = this.maxIncome + 100;
      console.log(`Min equals max, adjusted to: min=${this.minIncome}, max=${this.maxIncome}`);
    }
    
    // Ensure the range isn't too small for effective visualization
    if (this.maxIncome - this.minIncome < 100) {
      const midPoint = (this.maxIncome + this.minIncome) / 2;
      this.minIncome = Math.max(0, midPoint - 50);
      this.maxIncome = midPoint + 50;
      console.log(`Range too small, adjusted to: min=${this.minIncome}, max=${this.maxIncome}`);
    }
  }
}

// Export a convenience function to get the service instance
export function getIncomeDataService(): IncomeDataService {
  return IncomeDataService.getInstance();
}
