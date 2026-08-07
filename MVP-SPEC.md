# TorchTrack MVP specification

## The simple idea

TorchTrack is a separate companion dashboard for Torchlight: Infinite. It helps a player answer one question: **“Was this farming strategy worth my time?”** The player records drops and map costs; TorchTrack calculates revenue, investment, net profit, FE per map, and FE per hour.

It never controls the game. It does not press keys, read game memory, inject code, hide automation, or bypass anti-cheat.

## What this starter includes

- A live session timer with pause/resume
- A “map complete” counter
- Manual loot and cost entry
- Automatic revenue, cost, net profit, FE/map, and FE/hour math
- Strategy history with a useful performance insight
- Responsive desktop/mobile dashboard
- A data setup explainer showing the safe ingestion roadmap

The dashboard begins with realistic sample data so the product is easy to understand immediately. Data resets when the page is refreshed in this prototype.

## How the numbers work

- **Revenue** = sum of `(drop price in FE × quantity)`
- **Investment** = sum of `(map cost in FE × quantity)`
- **Net profit** = revenue − investment
- **Profit per map** = net profit ÷ maps completed
- **Profit per hour** = net profit ÷ elapsed hours

## Safe ingestion roadmap

### 1. Manual entry — MVP

The player clicks “Add loot or cost.” It is universally safe because the companion only knows what the player tells it.

### 2. Log-file adapter — only if officially supported

Add a small local desktop service that watches a user-selected, plain-text game log. Before building this, confirm that the current game version exposes relevant events and that reading the file complies with the game’s current terms. The parser should accept copied test fixtures during development and request read-only access to one chosen file.

Recommended interface: `LogAdapter → normalized events → SessionEngine`. A normalized event might be `map_started`, `map_ended`, `item_looted`, or `currency_spent`. If the log does not reliably contain one of these, leave that event manual.

### 3. Screenshot OCR — optional future import

Let the player choose a screenshot. OCR proposes item names and quantities, and the player confirms them before they affect totals. No live screen capture is needed for the first version.

### 4. Price database — future

Keep prices separate from loot events: an item has a name and quantity; a price quote has item, FE value, source, and timestamp. Show when a quote is old and always allow a manual override. Do not scrape or automate the Trade House unless explicitly permitted.

## Suggested product structure

- `SessionEngine`: owns time, map count, and calculations
- `EntryStore`: loot and investment records
- `LogAdapter`: optional text-log parsing behind a feature flag
- `OcrAdapter`: optional screenshot-to-draft-entry flow
- `PriceProvider`: manual prices first, external source later
- `LocalStore`: device-local sessions; add export/import before cloud sync

## Next build milestone

Make sessions persist on the device, add create/name/end session flows, editable entries, CSV export, strategy filters, and an import screen for copied log samples. Only after testing real supported logs should automatic parsing be enabled.
