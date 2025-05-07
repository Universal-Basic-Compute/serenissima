import * as THREE from 'three';

export interface ColorScaleConfig {
  minIncome: number;
  maxIncome: number;
  lowIncomeColor: THREE.Color;
  midIncomeColor: THREE.Color;
  highIncomeColor: THREE.Color;
}

// Default configuration
export const DEFAULT_COLOR_SCALE: ColorScaleConfig = {
  minIncome: 0,
  maxIncome: 1000,
  lowIncomeColor: new THREE.Color(0x33cc33),  // Rich green
  midIncomeColor: new THREE.Color(0xffcc00),  // Golden yellow
  highIncomeColor: new THREE.Color(0xff3300)   // Bright orange-red
};

/**
 * Calculate color based on income value using a three-point color scale
 * @param income The income value to map to a color
 * @param config Optional configuration for the color scale
 * @returns A THREE.Color representing the income value
 */
export function getIncomeBasedColor(income: number, config: Partial<ColorScaleConfig> = {}): THREE.Color {
  // Merge provided config with defaults
  const fullConfig: ColorScaleConfig = {
    ...DEFAULT_COLOR_SCALE,
    ...config
  };
  
  const { minIncome, maxIncome, lowIncomeColor, midIncomeColor, highIncomeColor } = fullConfig;
  
  // Normalize income to a 0-1 scale
  const normalizedIncome = Math.min(Math.max((income - minIncome) / (maxIncome - minIncome), 0), 1);
  
  // Map the normalized income to our color scale
  const resultColor = new THREE.Color();
  
  if (normalizedIncome >= 0.5) {
    // Map from yellow to red
    const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1.0 to 0-1
    return resultColor.lerpColors(midIncomeColor, highIncomeColor, t);
  } else {
    // Map from green to yellow
    const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
    return resultColor.lerpColors(lowIncomeColor, midIncomeColor, t);
  }
}
