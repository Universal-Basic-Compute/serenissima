/**
 * IncomeService
 * Handles income data operations for land visualization
 */

import { eventBus, EventTypes } from '../utils/eventBus';

export class IncomeService {
  // State properties
  private incomeData: Map<string, number> = new Map();
  private minIncome: number = 0;
  private maxIncome: number = 1000;
  private isLoading: boolean = false;
  private isLoaded: boolean = false;

  /**
   * Load income data
   */
  public async loadIncomeData(): Promise<void> {
    if (this.isLoading) return;
    
    this.isLoading = true;
    
    try {
      console.log('Loading income data...');
      
      const response = await fetch('/api/get-income-data');
      if (!response.ok) {
        throw new Error(`Failed to load income data: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.incomeData && Array.isArray(data.incomeData)) {
        // Create a map of polygon ID to income
        const incomeMap = new Map<string, number>();
        let min = Infinity;
        let max = -Infinity;
        
        data.incomeData.forEach((item: any) => {
          if (item.polygonId && typeof item.income === 'number') {
            incomeMap.set(item.polygonId, item.income);
            min = Math.min(min, item.income);
            max = Math.max(max, item.income);
          }
        });
        
        // Set min/max income values (with reasonable defaults if needed)
        this.minIncome = min !== Infinity ? min : 0;
        this.maxIncome = max !== -Infinity ? max : 1000;
        this.incomeData = incomeMap;
        this.isLoaded = true;
        
        console.log(`Income data loaded: ${incomeMap.size} entries, min=${this.minIncome}, max=${this.maxIncome}`);
        
        // Emit event to notify other components
        eventBus.emit(EventTypes.INCOME_DATA_UPDATED, {
          incomeData: Object.fromEntries(this.incomeData),
          minIncome: this.minIncome,
          maxIncome: this.maxIncome
        });
      }
    } catch (error) {
      console.error('Error loading income data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get income for a polygon
   */
  public getIncome(polygonId: string): number | undefined {
    return this.incomeData.get(polygonId);
  }

  /**
   * Get income color for visualization
   */
  public getIncomeColor(income: number | undefined): string {
    if (income === undefined) return '#E8DCC0'; // Softer parchment color for no data
    
    // Normalize income to a 0-1 scale
    const normalizedIncome = Math.min(Math.max((income - this.minIncome) / (this.maxIncome - this.minIncome), 0), 1);
    
    // Create a gradient from soft blue (low) to muted gold (medium) to terracotta red (high)
    // These colors are more appropriate for Renaissance Venice
    if (normalizedIncome <= 0.5) {
      // Soft blue to muted gold (0-0.5)
      const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
      const r = Math.floor(102 + t * (204 - 102)); // 102 to 204
      const g = Math.floor(153 + t * (178 - 153)); // 153 to 178
      const b = Math.floor(204 - t * (204 - 102)); // 204 to 102
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Muted gold to terracotta red (0.5-1)
      const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1 to 0-1
      const r = Math.floor(204 + t * (165 - 204)); // 204 to 165
      const g = Math.floor(178 - t * (178 - 74)); // 178 to 74
      const b = Math.floor(102 - t * (102 - 42)); // 102 to 42
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  /**
   * Get min and max income values
   */
  public getIncomeRange(): { min: number, max: number } {
    return { min: this.minIncome, max: this.maxIncome };
  }

  /**
   * Check if income data is loaded
   */
  public isDataLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Check if income data is currently loading
   */
  public isDataLoading(): boolean {
    return this.isLoading;
  }
}

// Export a singleton instance
export const incomeService = new IncomeService();
