import * as THREE from 'three';

export interface ColorScaleConfig {
  minIncome: number;
  maxIncome: number;
  lowIncomeColor: THREE.Color;
  midIncomeColor: THREE.Color;
  highIncomeColor: THREE.Color;
}

// Default configuration with Venetian-themed colors
export const DEFAULT_COLOR_SCALE: ColorScaleConfig = {
  minIncome: 0,
  maxIncome: 1000,
  lowIncomeColor: new THREE.Color(0x1E5799),  // Venetian Blue
  midIncomeColor: new THREE.Color(0xDAA520),  // Venetian Gold
  highIncomeColor: new THREE.Color(0x8B0000)   // Venetian Red
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
  
  // Add debug logging
  //console.log(`getIncomeBasedColor: income=${income}, minIncome=${minIncome}, maxIncome=${maxIncome}`);
  
  // Normalize income to a 0-1 scale
  const normalizedIncome = Math.min(Math.max((income - minIncome) / (maxIncome - minIncome), 0), 1);
  
  //console.log(`Normalized income: ${normalizedIncome}`);
  
  // Map the normalized income to our color scale
  const resultColor = new THREE.Color();
  
  if (normalizedIncome >= 0.5) {
    // Map from yellow to red
    const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1.0 to 0-1
    const color = resultColor.lerpColors(midIncomeColor, highIncomeColor, t);
    //console.log(`Using yellow to red scale with t=${t}, resulting color:`, color);
    return color;
  } else {
    // Map from green to yellow
    const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
    const color = resultColor.lerpColors(lowIncomeColor, midIncomeColor, t);
    //console.log(`Using blue to yellow scale with t=${t}, resulting color:`, color);
    return color;
  }
}
