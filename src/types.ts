// Food item from USDA API
export interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  ingredients?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: USDANutrient[];
}

export interface USDANutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

export interface USDASearchResponse {
  totalHits: number;
  currentPage: number;
  totalPages: number;
  foods: USDAFood[];
}

// Parsed nutrition data
export interface NutritionInfo {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

// Food log entry
export interface FoodLogEntry {
  id: number;
  logged_at: string;
  date: string;
  meal: string | null;
  food_name: string;
  fdc_id: number | null;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  notes: string | null;
}

// User goals
export interface Goals {
  id: number;
  daily_calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  updated_at: string;
}

// Daily summary
export interface DailySummary {
  date: string;
  entries: FoodLogEntry[];
  totals: NutritionInfo;
  goals: Goals | null;
  remaining: NutritionInfo | null;
}

// Search result for display
export interface FoodSearchResult {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType: string;
  nutrition: NutritionInfo;
  servingSize?: number;
  servingSizeUnit?: string;
}
