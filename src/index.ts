#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import dotenv from "dotenv";

import { USDAApi } from "./services/usda-api.js";
import {
  getDb,
  getGoals,
  updateGoals,
  logFood,
  getDailyLog,
  getLogsByDateRange,
  deleteEntry,
  calculateTotals,
  closeDb,
} from "./services/database.js";
import type { NutritionInfo } from "./types.js";

// Load environment variables
dotenv.config();

const USDA_API_KEY = process.env.USDA_API_KEY;
if (!USDA_API_KEY) {
  console.error("Error: USDA_API_KEY environment variable is required");
  console.error("Get your free API key at: https://fdc.nal.usda.gov/api-key-signup/");
  process.exit(1);
}

const usdaApi = new USDAApi(USDA_API_KEY);

// Initialize database
getDb();

// Helper to get today's date in YYYY-MM-DD format
function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

// Tool input schemas
const SearchFoodSchema = z.object({
  query: z.string().describe("Food name or description to search for"),
  limit: z.number().optional().default(10).describe("Number of results to return (default: 10)"),
});

const LogFoodSchema = z.object({
  food_name: z.string().describe("Name of the food"),
  serving_size: z.number().describe("Amount of the serving"),
  serving_unit: z.string().describe("Unit of measurement (e.g., 'g', 'oz', 'cup', 'piece')"),
  calories: z.number().describe("Calories for this serving"),
  protein_g: z.number().optional().describe("Protein in grams"),
  carbs_g: z.number().optional().describe("Carbohydrates in grams"),
  fat_g: z.number().optional().describe("Fat in grams"),
  fiber_g: z.number().optional().describe("Fiber in grams"),
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional().describe("Meal type"),
  date: z.string().optional().describe("Date in YYYY-MM-DD format (default: today)"),
  fdc_id: z.number().optional().describe("USDA FDC ID if from search"),
  notes: z.string().optional().describe("Optional notes"),
});

const GetDailyLogSchema = z.object({
  date: z.string().optional().describe("Date in YYYY-MM-DD format (default: today)"),
});

const SetGoalsSchema = z.object({
  daily_calories: z.number().optional().describe("Daily calorie goal"),
  protein_g: z.number().optional().describe("Daily protein goal in grams"),
  carbs_g: z.number().optional().describe("Daily carbohydrate goal in grams"),
  fat_g: z.number().optional().describe("Daily fat goal in grams"),
});

const GetSummarySchema = z.object({
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
  period: z.enum(["week", "month"]).optional().describe("Preset period instead of date range"),
});

const DeleteEntrySchema = z.object({
  entry_id: z.number().describe("ID of the food log entry to delete"),
});

// Create server
const server = new Server(
  {
    name: "food-tracker-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_food",
        description:
          "Search the USDA FoodData Central database for foods. Returns nutrition information per 100g serving.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Food name or description to search for" },
            limit: { type: "number", description: "Number of results (default: 10)" },
          },
          required: ["query"],
        },
      },
      {
        name: "log_food",
        description:
          "Log a food entry to your daily food diary. Include nutrition info from search or estimate.",
        inputSchema: {
          type: "object",
          properties: {
            food_name: { type: "string", description: "Name of the food" },
            serving_size: { type: "number", description: "Amount of the serving" },
            serving_unit: { type: "string", description: "Unit (g, oz, cup, piece, etc.)" },
            calories: { type: "number", description: "Calories for this serving" },
            protein_g: { type: "number", description: "Protein in grams" },
            carbs_g: { type: "number", description: "Carbs in grams" },
            fat_g: { type: "number", description: "Fat in grams" },
            fiber_g: { type: "number", description: "Fiber in grams" },
            meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
            date: { type: "string", description: "Date YYYY-MM-DD (default: today)" },
            fdc_id: { type: "number", description: "USDA FDC ID if from search" },
            notes: { type: "string", description: "Optional notes" },
          },
          required: ["food_name", "serving_size", "serving_unit", "calories"],
        },
      },
      {
        name: "get_daily_log",
        description:
          "Get all food entries for a specific day with totals and comparison to goals.",
        inputSchema: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date YYYY-MM-DD (default: today)" },
          },
        },
      },
      {
        name: "set_goals",
        description: "Set your daily nutrition goals for calories and macros.",
        inputSchema: {
          type: "object",
          properties: {
            daily_calories: { type: "number", description: "Daily calorie goal" },
            protein_g: { type: "number", description: "Daily protein goal (g)" },
            carbs_g: { type: "number", description: "Daily carb goal (g)" },
            fat_g: { type: "number", description: "Daily fat goal (g)" },
          },
        },
      },
      {
        name: "get_summary",
        description: "Get nutrition summary and averages for a date range or period.",
        inputSchema: {
          type: "object",
          properties: {
            start_date: { type: "string", description: "Start date YYYY-MM-DD" },
            end_date: { type: "string", description: "End date YYYY-MM-DD" },
            period: { type: "string", enum: ["week", "month"], description: "Preset period" },
          },
        },
      },
      {
        name: "delete_entry",
        description: "Delete a food log entry by its ID.",
        inputSchema: {
          type: "object",
          properties: {
            entry_id: { type: "number", description: "ID of the entry to delete" },
          },
          required: ["entry_id"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_food": {
        const { query, limit } = SearchFoodSchema.parse(args);
        const results = await usdaApi.searchFoods(query, limit);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No foods found matching "${query}". Try a different search term.`,
              },
            ],
          };
        }

        const formatted = results
          .map(
            (food, i) =>
              `${i + 1}. **${food.description}**${food.brandOwner ? ` (${food.brandOwner})` : ""}\n` +
              `   FDC ID: ${food.fdcId} | Type: ${food.dataType}\n` +
              `   Per 100g: ${food.nutrition.calories} cal | ` +
              `P: ${food.nutrition.protein_g}g | C: ${food.nutrition.carbs_g}g | F: ${food.nutrition.fat_g}g`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} foods matching "${query}":\n\n${formatted}\n\n` +
                `*Nutrition values are per 100g. Scale accordingly when logging.*`,
            },
          ],
        };
      }

      case "log_food": {
        const input = LogFoodSchema.parse(args);
        const date = input.date || getToday();

        const entry = logFood({
          date,
          meal: input.meal || null,
          food_name: input.food_name,
          fdc_id: input.fdc_id || null,
          serving_size: input.serving_size,
          serving_unit: input.serving_unit,
          calories: input.calories,
          protein_g: input.protein_g ?? null,
          carbs_g: input.carbs_g ?? null,
          fat_g: input.fat_g ?? null,
          fiber_g: input.fiber_g ?? null,
          notes: input.notes || null,
        });

        // Get updated daily totals
        const dailyEntries = getDailyLog(date);
        const totals = calculateTotals(dailyEntries);
        const goals = getGoals();

        let response = `Logged: **${entry.food_name}** (${entry.serving_size} ${entry.serving_unit})\n`;
        response += `${entry.calories} cal`;
        if (entry.protein_g) response += ` | P: ${entry.protein_g}g`;
        if (entry.carbs_g) response += ` | C: ${entry.carbs_g}g`;
        if (entry.fat_g) response += ` | F: ${entry.fat_g}g`;
        if (entry.meal) response += `\nMeal: ${entry.meal}`;
        response += `\n\n**Daily Total (${date}):** ${totals.calories} cal`;

        if (goals?.daily_calories) {
          const remaining = goals.daily_calories - totals.calories;
          response += ` | ${remaining > 0 ? remaining + " remaining" : Math.abs(remaining) + " over goal"}`;
        }

        return { content: [{ type: "text", text: response }] };
      }

      case "get_daily_log": {
        const { date } = GetDailyLogSchema.parse(args);
        const targetDate = date || getToday();
        const entries = getDailyLog(targetDate);
        const goals = getGoals();

        if (entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No food entries for ${targetDate}. Start logging with the log_food tool!`,
              },
            ],
          };
        }

        const totals = calculateTotals(entries);

        // Group by meal
        const byMeal: Record<string, typeof entries> = {};
        for (const entry of entries) {
          const meal = entry.meal || "unspecified";
          if (!byMeal[meal]) byMeal[meal] = [];
          byMeal[meal].push(entry);
        }

        let response = `## Food Log for ${targetDate}\n\n`;

        for (const [meal, mealEntries] of Object.entries(byMeal)) {
          response += `### ${meal.charAt(0).toUpperCase() + meal.slice(1)}\n`;
          for (const entry of mealEntries) {
            response += `- **${entry.food_name}** (${entry.serving_size} ${entry.serving_unit}) - `;
            response += `${entry.calories} cal`;
            if (entry.protein_g) response += ` | P: ${entry.protein_g}g`;
            response += ` [ID: ${entry.id}]\n`;
          }
          response += "\n";
        }

        response += `### Daily Totals\n`;
        response += `- Calories: ${totals.calories}`;
        if (goals?.daily_calories) {
          const pct = Math.round((totals.calories / goals.daily_calories) * 100);
          response += ` / ${goals.daily_calories} (${pct}%)`;
        }
        response += `\n- Protein: ${totals.protein_g}g`;
        if (goals?.protein_g) response += ` / ${goals.protein_g}g`;
        response += `\n- Carbs: ${totals.carbs_g}g`;
        if (goals?.carbs_g) response += ` / ${goals.carbs_g}g`;
        response += `\n- Fat: ${totals.fat_g}g`;
        if (goals?.fat_g) response += ` / ${goals.fat_g}g`;
        response += `\n- Fiber: ${totals.fiber_g}g`;

        return { content: [{ type: "text", text: response }] };
      }

      case "set_goals": {
        const input = SetGoalsSchema.parse(args);

        if (!input.daily_calories && !input.protein_g && !input.carbs_g && !input.fat_g) {
          const current = getGoals();
          return {
            content: [
              {
                type: "text",
                text: `**Current Goals:**\n` +
                  `- Calories: ${current?.daily_calories || "not set"}\n` +
                  `- Protein: ${current?.protein_g || "not set"}g\n` +
                  `- Carbs: ${current?.carbs_g || "not set"}g\n` +
                  `- Fat: ${current?.fat_g || "not set"}g`,
              },
            ],
          };
        }

        const updated = updateGoals(input);

        return {
          content: [
            {
              type: "text",
              text: `**Goals Updated:**\n` +
                `- Calories: ${updated.daily_calories}\n` +
                `- Protein: ${updated.protein_g}g\n` +
                `- Carbs: ${updated.carbs_g}g\n` +
                `- Fat: ${updated.fat_g}g`,
            },
          ],
        };
      }

      case "get_summary": {
        const input = GetSummarySchema.parse(args);

        let startDate: string;
        let endDate: string;

        if (input.period === "week") {
          const today = new Date();
          const weekAgo = new Date(today);
          weekAgo.setDate(today.getDate() - 7);
          startDate = weekAgo.toISOString().split("T")[0];
          endDate = today.toISOString().split("T")[0];
        } else if (input.period === "month") {
          const today = new Date();
          const monthAgo = new Date(today);
          monthAgo.setMonth(today.getMonth() - 1);
          startDate = monthAgo.toISOString().split("T")[0];
          endDate = today.toISOString().split("T")[0];
        } else if (input.start_date && input.end_date) {
          startDate = input.start_date;
          endDate = input.end_date;
        } else {
          // Default to last 7 days
          const today = new Date();
          const weekAgo = new Date(today);
          weekAgo.setDate(today.getDate() - 7);
          startDate = weekAgo.toISOString().split("T")[0];
          endDate = today.toISOString().split("T")[0];
        }

        const entries = getLogsByDateRange(startDate, endDate);
        const goals = getGoals();

        if (entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No food entries found between ${startDate} and ${endDate}.`,
              },
            ],
          };
        }

        // Group by date
        const byDate: Record<string, typeof entries> = {};
        for (const entry of entries) {
          if (!byDate[entry.date]) byDate[entry.date] = [];
          byDate[entry.date].push(entry);
        }

        const dailyTotals = Object.entries(byDate).map(([date, dayEntries]) => ({
          date,
          ...calculateTotals(dayEntries),
        }));

        const numDays = dailyTotals.length;
        const avgCalories = Math.round(
          dailyTotals.reduce((sum, d) => sum + d.calories, 0) / numDays
        );
        const avgProtein = Math.round(
          (dailyTotals.reduce((sum, d) => sum + d.protein_g, 0) / numDays) * 10
        ) / 10;
        const avgCarbs = Math.round(
          (dailyTotals.reduce((sum, d) => sum + d.carbs_g, 0) / numDays) * 10
        ) / 10;
        const avgFat = Math.round(
          (dailyTotals.reduce((sum, d) => sum + d.fat_g, 0) / numDays) * 10
        ) / 10;

        let response = `## Nutrition Summary: ${startDate} to ${endDate}\n\n`;
        response += `**${numDays} days tracked** | ${entries.length} total entries\n\n`;

        response += `### Daily Averages\n`;
        response += `- Calories: ${avgCalories}`;
        if (goals?.daily_calories) {
          const pct = Math.round((avgCalories / goals.daily_calories) * 100);
          response += ` (${pct}% of ${goals.daily_calories} goal)`;
        }
        response += `\n- Protein: ${avgProtein}g`;
        if (goals?.protein_g) response += ` / ${goals.protein_g}g goal`;
        response += `\n- Carbs: ${avgCarbs}g`;
        if (goals?.carbs_g) response += ` / ${goals.carbs_g}g goal`;
        response += `\n- Fat: ${avgFat}g`;
        if (goals?.fat_g) response += ` / ${goals.fat_g}g goal`;

        response += `\n\n### Daily Breakdown\n`;
        for (const day of dailyTotals) {
          response += `- ${day.date}: ${day.calories} cal | P: ${day.protein_g}g | C: ${day.carbs_g}g | F: ${day.fat_g}g\n`;
        }

        return { content: [{ type: "text", text: response }] };
      }

      case "delete_entry": {
        const { entry_id } = DeleteEntrySchema.parse(args);
        const deleted = deleteEntry(entry_id);

        if (deleted) {
          return {
            content: [{ type: "text", text: `Entry ${entry_id} deleted successfully.` }],
          };
        } else {
          return {
            content: [{ type: "text", text: `Entry ${entry_id} not found.` }],
          };
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDb();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Food Tracker MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
