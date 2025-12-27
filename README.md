# Food Tracker MCP Server

A Model Context Protocol (MCP) server for tracking food intake and nutrition using the USDA FoodData Central database.

## Features

- **Search Foods**: Query the USDA FoodData Central database for nutritional information
- **Log Meals**: Record food intake with calories, macros, and serving sizes
- **Track Progress**: View daily logs with totals compared to your goals
- **Set Goals**: Define daily targets for calories, protein, carbs, and fat
- **Get Summaries**: View nutrition averages over days, weeks, or months

## Installation

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "food-tracker": {
      "command": "npx",
      "args": ["-y", "@neonwatty/food-tracker-mcp"],
      "env": {
        "USDA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add food-tracker -e USDA_API_KEY=your_api_key -- npx -y @neonwatty/food-tracker-mcp
```

Or add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "food-tracker": {
      "command": "npx",
      "args": ["-y", "@neonwatty/food-tracker-mcp"],
      "env": {
        "USDA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Requirements

### USDA API Key

Get your free API key at: https://fdc.nal.usda.gov/api-key-signup/

## Available Tools

### search_food
Search the USDA FoodData Central database for foods.

```
"Search for chicken breast"
```

Returns nutrition information per 100g serving including calories, protein, carbs, and fat.

### log_food
Log a food entry to your daily food diary.

```
"Log 200g of grilled salmon for lunch with 400 calories, 40g protein, 0g carbs, 22g fat"
```

Parameters:
- `food_name` (required): Name of the food
- `serving_size` (required): Amount of the serving
- `serving_unit` (required): Unit (g, oz, cup, piece, etc.)
- `calories` (required): Calories for this serving
- `protein_g`: Protein in grams
- `carbs_g`: Carbohydrates in grams
- `fat_g`: Fat in grams
- `fiber_g`: Fiber in grams
- `meal`: breakfast, lunch, dinner, or snack
- `date`: Date in YYYY-MM-DD format (defaults to today)

### get_daily_log
Get all food entries for a specific day with totals and goal comparison.

```
"What have I eaten today?"
"Show me my food log for 2025-01-15"
```

### set_goals
Set your daily nutrition goals.

```
"Set my daily goal to 2000 calories with 150g protein, 200g carbs, and 65g fat"
```

### get_summary
Get nutrition summary and averages for a date range.

```
"Show me my nutrition summary for this week"
"Get my monthly nutrition averages"
```

### delete_entry
Delete a food log entry by its ID.

```
"Delete entry 5"
```

## Data Storage

Food logs are stored locally in a SQLite database at `~/.food-tracker/food.db`. Your data never leaves your machine.

## Example Conversation

**You**: Search for oatmeal
**Claude**: Found 10 foods matching "oatmeal"...

**You**: Log 1 cup of oatmeal for breakfast
**Claude**: Logged: Oatmeal (1 cup) - 150 cal | P: 5g | C: 27g | F: 3g

**You**: What have I eaten today?
**Claude**: Food Log for 2025-01-15...

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/neonwatty/food-tracker-mcp).
