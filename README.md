# D&D Beyond Archivist Sync

Chrome Extension (Manifest V3) that synchronizes D&D Beyond Player Characters, Magic Items, and Equipment directly into your [Archivist AI](https://myarchivist.ai) campaigns.

---

## Features

- **One-Click Character Import**: Imports a complete character sheet from D&D Beyond into your selected Archivist campaign, setting up the character name, avatar image, structured attribute/ability summary, and backstory.
- **Bi-Directional Matching & Sync**: Automatically checks if a character or item already exists in the selected campaign (by name or aliases) and updates the existing entity without duplicates.
- **Magic Item Sync**: Syncs individual magic items from item detail pages, or bulk-imports equipped magic items from a character's inventory directly into the campaign compendium.
- **Secure API Key Storage**: Stores your Archivist API key in `chrome.storage.sync` so it stays synchronized across your browser sessions without exposing credentials.

---

## Development & Building

### Prerequisites

Node.js 18+ and npm.

### Setup & Build

```bash
npm install
npm run build
```

This compiles the extension into the `dist/` directory using Vite.

### Loading in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `dist/` folder inside this directory (`dndbeyond-archivist-sync/dist`).
5. Open the extension popup, enter your Archivist API key (from Account Settings → API Keys), and select your target campaign.
6. Navigate to any D&D Beyond character sheet or magic item page and click **Sync / Import**!

---

## Architecture

This extension brings together two packages:
- [`@astermoe/dndbeyond-parser`](https://github.com/astermoline/dndbeyond-parser): Universal extractor for D&D Beyond character and item data.
- [`@astermoe/archivist-sdk`](https://github.com/astermoline/archivist-sdk): TypeScript client library for the Archivist REST API.

---

## License

MIT © [Aster Moline](https://aster.quest) ([@astermoline](https://github.com/astermoline))
