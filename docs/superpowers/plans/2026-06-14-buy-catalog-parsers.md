# Buy Catalog Parser and Ship Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix buy-item location parsing, wire real ship career/role/size filters, and remove the broken ship chip controls.

**Architecture:** Normalize buy-item offer strings once, then have every catalog dropdown and detail panel read from those canonical parsers. Keep the item/shipping UI in `index.html`, but move the data shaping and filter-option generation into focused helpers in `app.js` so the catalog, detail pane, and select menus stay consistent. Use the existing `buy_items_data.js` and `buy_items_ships_data.js` payloads as the local data source and enrich ships from the dedicated ships payload instead of inventing static filter lists.

**Tech Stack:** Vanilla JavaScript, local static HTML/CSS, bundled `buy_items_data.js`, bundled `buy_items_ships_data.js`.

---

### Task 1: Normalize location parsing for buy entries

**Files:**
- Modify: `app.js:381-446`

- [ ] **Step 1: Replace the current offer parsing helpers with canonical location helpers**

```javascript
function splitOfferLocation(rawLocation) {
  return String(rawLocation || "")
    .split(/\s*-\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function offerSystem(offer) {
  const systemText = String(offer?.system || "").trim();
  if (systemText.includes(">")) {
    return systemText.split(/\s*>\s*/)[0]?.trim() || "Other";
  }
  const parts = splitOfferLocation(offer?.location);
  return parts[0] || "Other";
}

function offerArea(offer) {
  const parts = splitOfferLocation(offer?.location);
  if (parts.length >= 3) return parts[1];
  const areaText = String(offer?.area || "").trim();
  return areaText || "Other";
}

function offerLocationName(offer) {
  const parts = splitOfferLocation(offer?.location);
  if (parts.length >= 2) return parts[parts.length - 1];
  return String(offer?.locationLabel || offer?.location || offer?.locationName || "Unknown location").trim();
}
```

- [ ] **Step 2: Repoint buy filtering and summaries to the canonical helpers**

```javascript
function buyOfferMatches(offer, system, area, location) {
  if (!offer) return false;
  if (system !== "All" && offerSystem(offer) !== system) return false;
  if (area !== "All" && offerArea(offer) !== area) return false;
  if (location !== "All" && offerLocationName(offer) !== location) return false;
  return true;
}

function buyAreas(system = state.buySystem) {
  const areas = new Set();
  for (const entry of buyEntriesForTab()) {
    for (const offer of buyEntryOffers(entry)) {
      if (system !== "All" && offerSystem(offer) !== system) continue;
      areas.add(offerArea(offer));
    }
  }
  return ["All", ...[...areas].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyLocations(system = state.buySystem, area = state.buyArea) {
  const locations = new Set();
  for (const entry of buyEntriesForTab()) {
    for (const offer of buyEntryOffers(entry)) {
      if (system !== "All" && offerSystem(offer) !== system) continue;
      if (area !== "All" && offerArea(offer) !== area) continue;
      locations.add(offerLocationName(offer));
    }
  }
  return ["All", ...[...locations].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}
```

- [ ] **Step 3: Update the selected-detail panel to show business names in Location and planet/moon/station names in Area**

```javascript
const locationText = offerLocationName(offer);
const system = offerSystem(offer);
const area = offerArea(offer);
```

- [ ] **Step 4: Verify the buy catalog now filters Nyx/Pyro/Stanton correctly and no longer leaks cross-system shops**

Run the app and confirm:
- Nyx only returns Nyx shops in the system filter
- Area shows Levski / Pyro Gateway / Stanton Gateway / planets and stations
- Location shows the shop/business name such as Teach's Ship Shop

### Task 2: Add real ship career/role/size dropdown filters and remove the chip row

**Files:**
- Modify: `app.js:313-545, 1921-1967, 2476-2505`
- Modify: `index.html:289-305`

- [ ] **Step 1: Derive ship careers, roles, and sizes from the shipped ship data**

```javascript
function buyEntryShipCareer(entry) {
  return entry?.career || "unknown";
}

function buyEntryShipRole(entry) {
  return entry?.role || "unknown";
}

function buyEntryShipSize(entry) {
  const text = String(entry?.size || "").trim();
  const match = text.match(/^(Small|Medium|Large|Capital|Snub)\b/i);
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : "unknown";
}

function buyShipCareerOptions() {
  return ["All", ...new Set(buyEntriesForTab("ships").map((entry) => buyEntryShipCareer(entry)).filter(Boolean)).values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function buyShipRoleOptions() {
  return ["All", ...new Set(buyEntriesForTab("ships").map((entry) => buyEntryShipRole(entry)).filter(Boolean)).values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function buyShipSizeOptions() {
  return ["All", ...new Set(buyEntriesForTab("ships").map((entry) => buyEntryShipSize(entry)).filter(Boolean)).values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
```

- [ ] **Step 2: Load the ship data from `buy_items_ships_data.js` so the filters and detail panel can use actual `loadoutWeapons` and `loadoutComponents`**

```javascript
async function loadBuyData() {
  if (window.BUY_ITEMS_DATA) return window.BUY_ITEMS_DATA;
  if (window.BUY_ITEMS_DATA_PARTS?.ships?.ships || window.BUY_ITEMS_DATA_PARTS?.rentals?.rentals) {
    return {
      items: window.BUY_ITEMS_DATA_PARTS.items?.items || [],
      ships: window.BUY_ITEMS_DATA_PARTS.ships?.ships || [],
      rentals: window.BUY_ITEMS_DATA_PARTS.rentals?.rentals || [],
    };
  }
  const response = await fetch("./buy_items_data.js?v=20260614i", { cache: "no-store" });
  if (!response.ok) return { items: [], ships: [], rentals: [] };
  const text = await response.text();
  new Function(text)();
  if (window.BUY_ITEMS_DATA) return window.BUY_ITEMS_DATA;
  return { items: [], ships: [], rentals: [] };
}
```

- [ ] **Step 3: Replace the current ship filter block in the buy section with three dropdowns for Career, Role, and Size**

```html
<div class="buy-select-grid" id="buyShipFilters" hidden>
  <label class="field">
    <span>Career</span>
    <select id="buyShipCareerSelect"></select>
  </label>
  <label class="field">
    <span>Role</span>
    <select id="buyShipRoleSelect"></select>
  </label>
  <label class="field">
    <span>Size</span>
    <select id="buyShipSizeSelect"></select>
  </label>
</div>
```

- [ ] **Step 4: Remove the bottom ship size chip row and the chip click handler**

```javascript
if (els.buySizeChips) {
  els.buySizeChips.hidden = true;
  els.buySizeChips.innerHTML = "";
}

els.buySizeChips?.removeEventListener("click", ...);
```

- [ ] **Step 5: Filter ships by the three new dropdowns and keep the results sorted by name**

```javascript
if (state.buyTab === "ships" && state.buyShipCareer !== "All" && buyEntryShipCareer(entry) !== state.buyShipCareer) return false;
if (state.buyTab === "ships" && state.buyShipRole !== "All" && buyEntryShipRole(entry) !== state.buyShipRole) return false;
if (state.buyTab === "ships" && state.buyShipSize !== "All" && buyEntryShipSize(entry) !== state.buyShipSize) return false;
```

- [ ] **Step 6: Verify the ship detail panel still shows career, role, size, loadout weapons, and loadout components**

Run the app and confirm:
- cargo does not collapse into a single vehicle
- career options include Combat, Industrial, Transport, Exploration, Support, Competition, Ground, Multi-role
- role options include the real roles from the ship data
- size options are limited to Small, Medium, Large, Capital, Snub

### Task 3: Update event wiring and persistence for the new filters

**Files:**
- Modify: `app.js:73-81, 191-230, 2345-2505`

- [ ] **Step 1: Add `buyShipCareer` and `buyShipSize` to default state, serialization, and reset logic**

```javascript
buyShipCareer: "All",
buyShipRole: "All",
buyShipSize: "All",
```

- [ ] **Step 2: Wire the new selects in the render and change handlers**

```javascript
els.buyShipCareerSelect?.addEventListener("change", (event) => {
  state.buyShipCareer = event.target.value || "All";
  state.buySelectedId = "";
  renderBuy();
  saveState();
});
```

- [ ] **Step 3: Confirm the old ship chips no longer appear anywhere in the buy page**

Run the app and confirm the ship filter section only shows the three dropdowns and no bottom chip buttons.

### Task 4: Add item blueprint backlinks and rank progression details

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Show the blueprint name on items that have one and link it back to the Blueprint section**
- [ ] **Step 2: Add faction/company rank progress details with points needed to reach each rank**
- [ ] **Step 3: Add mission count guidance for each rank so users can see how many missions they need to run**

### Task 5: Add mission unlock guidance to the missions section

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Show prerequisite missions, required faction/company rank, and the target rank for each mission**
- [ ] **Step 2: Show the region/system range where a mission can appear so users know where to be**
- [ ] **Step 3: Explain that some missions are unlocked by different factions/companies than the one a player is currently grinding**
- [ ] **Step 4: Surface example routes such as `do X missions in Pyro for Y faction to unlock Z mission` when the data is available**
