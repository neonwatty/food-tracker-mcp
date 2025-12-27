import type {
  USDASearchResponse,
  USDAFood,
  NutritionInfo,
  FoodSearchResult,
} from "../types.js";

const USDA_API_BASE = "https://api.nal.usda.gov/fdc/v1";

// Nutrient IDs in USDA database
const NUTRIENT_IDS = {
  ENERGY: 1008, // Calories (kcal)
  PROTEIN: 1003,
  CARBS: 1005, // Carbohydrate, by difference
  FAT: 1004, // Total lipid (fat)
  FIBER: 1079, // Fiber, total dietary
};

export class USDAApi {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchFoods(
    query: string,
    pageSize: number = 10
  ): Promise<FoodSearchResult[]> {
    const url = `${USDA_API_BASE}/foods/search?api_key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        pageSize,
        dataType: ["Foundation", "SR Legacy", "Branded"],
      }),
    });

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status} ${response.statusText}`);
    }

    const data: USDASearchResponse = await response.json();

    return data.foods.map((food) => ({
      fdcId: food.fdcId,
      description: food.description,
      brandOwner: food.brandOwner,
      dataType: food.dataType,
      nutrition: this.extractNutrition(food),
      servingSize: food.servingSize,
      servingSizeUnit: food.servingSizeUnit,
    }));
  }

  async getFoodDetails(fdcId: number): Promise<USDAFood | null> {
    const url = `${USDA_API_BASE}/food/${fdcId}?api_key=${this.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`USDA API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getNutrition(fdcId: number): Promise<NutritionInfo | null> {
    const food = await this.getFoodDetails(fdcId);
    if (!food) return null;
    return this.extractNutrition(food);
  }

  private extractNutrition(food: USDAFood): NutritionInfo {
    const getNutrientValue = (nutrientId: number): number => {
      const nutrient = food.foodNutrients.find(
        (n) => n.nutrientId === nutrientId
      );
      return nutrient?.value ?? 0;
    };

    return {
      calories: Math.round(getNutrientValue(NUTRIENT_IDS.ENERGY)),
      protein_g: Math.round(getNutrientValue(NUTRIENT_IDS.PROTEIN) * 10) / 10,
      carbs_g: Math.round(getNutrientValue(NUTRIENT_IDS.CARBS) * 10) / 10,
      fat_g: Math.round(getNutrientValue(NUTRIENT_IDS.FAT) * 10) / 10,
      fiber_g: Math.round(getNutrientValue(NUTRIENT_IDS.FIBER) * 10) / 10,
    };
  }

  // Scale nutrition values based on serving size
  scaleNutrition(
    nutrition: NutritionInfo,
    servingSize: number,
    baseServingSize: number = 100 // USDA values are typically per 100g
  ): NutritionInfo {
    const scale = servingSize / baseServingSize;
    return {
      calories: Math.round(nutrition.calories * scale),
      protein_g: Math.round(nutrition.protein_g * scale * 10) / 10,
      carbs_g: Math.round(nutrition.carbs_g * scale * 10) / 10,
      fat_g: Math.round(nutrition.fat_g * scale * 10) / 10,
      fiber_g: Math.round(nutrition.fiber_g * scale * 10) / 10,
    };
  }
}
