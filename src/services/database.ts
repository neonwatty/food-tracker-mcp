import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import type { FoodLogEntry, Goals, NutritionInfo } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../data.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initializeSchema();
  }
  return db;
}

function initializeSchema(): void {
  const database = db!;

  database.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY DEFAULT 1,
      daily_calories INTEGER,
      protein_g INTEGER,
      carbs_g INTEGER,
      fat_g INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS food_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logged_at TEXT DEFAULT CURRENT_TIMESTAMP,
      date TEXT NOT NULL,
      meal TEXT,
      food_name TEXT NOT NULL,
      fdc_id INTEGER,
      serving_size REAL NOT NULL,
      serving_unit TEXT NOT NULL,
      calories REAL NOT NULL,
      protein_g REAL,
      carbs_g REAL,
      fat_g REAL,
      fiber_g REAL,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);
  `);

  // Insert default goals row if not exists
  const goalsExist = database
    .prepare("SELECT COUNT(*) as count FROM goals")
    .get() as { count: number };
  if (goalsExist.count === 0) {
    database
      .prepare(
        "INSERT INTO goals (id, daily_calories, protein_g, carbs_g, fat_g) VALUES (1, 2000, 150, 250, 65)"
      )
      .run();
  }
}

// Goals operations
export function getGoals(): Goals | null {
  const db = getDb();
  return db.prepare("SELECT * FROM goals WHERE id = 1").get() as Goals | null;
}

export function updateGoals(goals: Partial<Goals>): Goals {
  const db = getDb();
  const current = getGoals();

  const newGoals = {
    daily_calories: goals.daily_calories ?? current?.daily_calories,
    protein_g: goals.protein_g ?? current?.protein_g,
    carbs_g: goals.carbs_g ?? current?.carbs_g,
    fat_g: goals.fat_g ?? current?.fat_g,
  };

  db.prepare(
    `UPDATE goals SET
      daily_calories = ?,
      protein_g = ?,
      carbs_g = ?,
      fat_g = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1`
  ).run(
    newGoals.daily_calories,
    newGoals.protein_g,
    newGoals.carbs_g,
    newGoals.fat_g
  );

  return getGoals()!;
}

// Food log operations
export function logFood(entry: Omit<FoodLogEntry, "id" | "logged_at">): FoodLogEntry {
  const db = getDb();

  const result = db
    .prepare(
      `INSERT INTO food_logs
        (date, meal, food_name, fdc_id, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.date,
      entry.meal,
      entry.food_name,
      entry.fdc_id,
      entry.serving_size,
      entry.serving_unit,
      entry.calories,
      entry.protein_g,
      entry.carbs_g,
      entry.fat_g,
      entry.fiber_g,
      entry.notes
    );

  return db
    .prepare("SELECT * FROM food_logs WHERE id = ?")
    .get(result.lastInsertRowid) as FoodLogEntry;
}

export function getDailyLog(date: string): FoodLogEntry[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM food_logs WHERE date = ? ORDER BY logged_at")
    .all(date) as FoodLogEntry[];
}

export function getLogsByDateRange(startDate: string, endDate: string): FoodLogEntry[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM food_logs WHERE date >= ? AND date <= ? ORDER BY date, logged_at"
    )
    .all(startDate, endDate) as FoodLogEntry[];
}

export function deleteEntry(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM food_logs WHERE id = ?").run(id);
  return result.changes > 0;
}

export function calculateTotals(entries: FoodLogEntry[]): NutritionInfo {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + (entry.calories || 0),
      protein_g: totals.protein_g + (entry.protein_g || 0),
      carbs_g: totals.carbs_g + (entry.carbs_g || 0),
      fat_g: totals.fat_g + (entry.fat_g || 0),
      fiber_g: totals.fiber_g + (entry.fiber_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
  );
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
