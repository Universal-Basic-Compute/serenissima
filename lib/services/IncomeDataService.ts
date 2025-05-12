import { eventBus, EventTypes } from '../eventBus';

export interface IncomeData {
  polygonId: string;
  income: number;
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
      maxIncome: this.maxIncome
    });
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
      const response = await fetch('/api/get-income-data');
      if (!response.ok) {
        throw new Error(`Failed to load income data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data && Array.isArray(data.incomeData)) {
        this.setIncomeData(data.incomeData);
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
   * Generate simulated income data for testing
   * @param polygons Optional array of polygons to generate data for
   */
  public generateLastIncomeData(polygons?: any[]): void {
    // If polygons are provided, generate data for them
    if (polygons && polygons.length > 0) {
      const simulatedData: IncomeData[] = polygons.map(polygon => ({
        polygonId: polygon.id,
        income: Math.random() * 1000 // Random income between 0 and 1000
      }));
      
      this.setIncomeData(simulatedData);
    } else {
      // Otherwise, generate random data for existing polygon IDs
      const simulatedData: IncomeData[] = Array.from(this.incomeData.keys()).map(polygonId => ({
        polygonId,
        income: Math.random() * 1000 // Random income between 0 and 1000
      }));
      
      if (simulatedData.length > 0) {
        this.setIncomeData(simulatedData);
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
      return;
    }
    
    const incomeValues = Array.from(this.incomeData.values());
    this.minIncome = Math.min(...incomeValues);
    this.maxIncome = Math.max(...incomeValues);
    
    // Ensure we have a reasonable range
    if (this.minIncome === this.maxIncome) {
      this.minIncome = Math.max(0, this.minIncome - 100);
      this.maxIncome = this.maxIncome + 100;
    }
  }
}

// Export a convenience function to get the service instance
export function getIncomeDataService(): IncomeDataService {
  return IncomeDataService.getInstance();
}
