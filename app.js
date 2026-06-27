const STORAGE_KEY = "sc-blueprint-tracker-v1";
const WATCH_KEY = "sc-blueprint-tracker-watch-v1";
const USERS_KEY = "sc-blueprint-tracker-users-v1";
const USER_PREFIX = "sc-blueprint-tracker-user-v1-";
const SCMINERSDB_MANIFEST_URL_KEY = "scminersdb-manifest-url-v1";
const SCMINERSDB_DEFAULT_MANIFEST_URL = "https://gringonaranjito.github.io/scminersdb/runs/latest.json";
const BUY_DATA_SCRIPT_VERSION = "20260618a";
const BUY_DATA_SCRIPT_URLS = Object.freeze([
  `./buy_items_data.js?v=${BUY_DATA_SCRIPT_VERSION}`,
  `./scminersdb_dismantle_returns_data.js?v=20260624a`,
  `./buy_items_dismantle_append.js?v=20260624a`,
]);

const ownedSeed = [
  "P4-AR Magazine",
  "Paralex Rifle Battery",
  "Pulse Laser Pistol Battery",
  "R97 Shotgun Magazine",
  "S-38 Magazine",
  "Antium Arms Moss Camo",
  "Field Recon Suit Arms",
  "Monde Arms",
  "Monde Arms Hiro",
  "ORC-mkV Arms",
  "Testudo Arms Combustion",
  "Testudo Backpack Combustion",
  "Antium Core Maroon Camo",
  "Antium Core Moss Camo",
  "Field Recon Suit Core",
  "Monde Core",
  "Monde Core Hiro",
  "Testudo Core Combustion",
  "Antium Helmet Jet",
  "Antium Helmet Maroon Camo",
  "Antium Helmet Moss Camo",
  "Field Recon Suit Helmet",
  "Monde Helmet",
  "Monde Helmet Hiro",
  "Testudo Helmet Combustion",
  "Testudo Helmet Nightveil",
  "Antium Legs Jet",
  "Antium Legs Maroon",
  "Antium Legs Moss Camo",
  "Field Recon Suit Legs",
  "Monde Legs",
  "Monde Legs Hiro",
  "Testudo Legs Combustion",
  "Testudo Legs Nightveil",
  "Abrade Scraper Module",
  "Cinch Scraper Module",
  "Trawler Scraper Module",
  'Pulse "Rogue" Pistol',
  'Pulse "Rouge" Pistol',
  "S-38 Pistol",
  "P4-AR Rifle",
  'Parallax "Sunstone" Energy Assault Rifle',
  "S71 Rifle",
];

const state = {
  data: null,
  buyData: null,
  users: [],
  currentUserId: "",
  owned: new Set(),
  logs: [],
  view: "missions",
  collectionMode: "owned",
  search: "",
  blueprintSearch: "",
  missionSearch: "",
  missionScriptOnly: false,
  missionFilterType: "All",
  missionFilterPoints: "All",
  missionFilterReputation: "All",
  missionFilterLocation: "All",
  missionFilterDifficulty: "All",
  missionFilterMoney: "All",
  chip: "All",
  missionType: "",
  company: "",
  mission: "",
  reward: "",
  customReward: "",
  selectedItem: null,
  buyTab: "items",
  buySearch: "",
  buySystem: "All",
  buyOrbit: "All",
  buyArea: "All",
  buyType: "All",
  buySubtype: "All",
  buyItemCategory: "All",
  buyShipCareer: "All",
  buyShipSize: "All",
  buyShipRole: "All",
  buyShipWeapon: "All",
  buyShipComponent: "All",
  buySelectedId: "",
  rail: "dashboard",
  progressFocus: { kind: "", value: "" },
  watch: {
    handle: null,
    name: "",
    lastText: "",
    timer: null,
  },
  lastSavedSnapshot: "",
  hideUnrankedCompanies: false,
  liveMissions: [],
  liveMissionsStatus: "",
  scminersDb: {
    available: false,
    manifestUrl: SCMINERSDB_DEFAULT_MANIFEST_URL,
    files: [],
    exports: {},
    fileIndex: {},
    status: "",
  },
  scminersDbManifestUrl: localStorage.getItem(SCMINERSDB_MANIFEST_URL_KEY) || SCMINERSDB_DEFAULT_MANIFEST_URL,
  appReady: false,
  scminersDbRefreshTimer: null,
  scminersDbCategory: "1h",
};

const els = {};
let scminersDbMissionCache = {
  signature: "",
  entries: [],
  rewardById: new Map(),
  prereqById: new Map(),
};
let buyDataLoadPromise = null;
let buyDataScriptsLoadPromise = null;
let buyDataProgressRenderTimer = null;
let buyDataWorker = null;
let liveMissionLoadPromise = null;
let bundledScminersDbDataCache = null;

let missionLookupCache = {
  dataItemsRef: null,
  dataItemsLength: -1,
  liveMissionsRef: null,
  liveMissionsLength: -1,
  scminersDbSignature: "",
  allItems: [],
  missionItems: [],
  combinedRecords: [],
  missionCatalog: [],
  missionCatalogReady: false,
  rewardsIndex: new Map(),
  missionSearchIndex: new Map(),
  missionMatchIndex: new Map(),
};
let blueprintCraftingCache = {
  signature: "",
  recipeByBlueprint: new Map(),
  recipeByName: new Map(),
  recipeByResultPath: new Map(),
  dismantleBySourceId: new Map(),
  dismantleBySourceName: new Map(),
  dismantleByResultPath: new Map(),
};
const buyOfferFieldCache = new WeakMap();

function invalidateMissionLookupCache() {
  missionLookupCache = {
    dataItemsRef: null,
    dataItemsLength: -1,
    liveMissionsRef: null,
    liveMissionsLength: -1,
    scminersDbSignature: "",
    allItems: [],
    missionItems: [],
    combinedRecords: [],
    missionCatalog: [],
    missionCatalogReady: false,
    rewardsIndex: new Map(),
    missionSearchIndex: new Map(),
    missionMatchIndex: new Map(),
  };
}

function ensureMissionLookupCache() {
  const dataItems = Array.isArray(state.data?.items) ? state.data.items : [];
  const liveMissions = Array.isArray(state.liveMissions) ? state.liveMissions : [];
  const scminersDbSignature = state.scminersDb?.signature || "";

  if (
    missionLookupCache.dataItemsRef === dataItems &&
    missionLookupCache.dataItemsLength === dataItems.length &&
    missionLookupCache.liveMissionsRef === liveMissions &&
    missionLookupCache.liveMissionsLength === liveMissions.length &&
    missionLookupCache.scminersDbSignature === scminersDbSignature
  ) {
    return missionLookupCache;
  }

  const all = dataItems.map((item) => {
    const rawMissions = Array.isArray(item.missions) ? item.missions : [];
    const missions = rawMissions
      .map((m) => repairMissionLabels(augmentMissionWithStructuredData({ ...m, source: "local", itemName: item.name })))
      .filter((mission) => !isBadLabel(missionTitle(mission)) && !isBadLabel(mission.type) && !isBadLabel(mission.faction));

    return {
      ...item,
      missions,
    };
  });

  const missionOnly = all.filter((item) => item.name && (item.missions || []).length);
  const combinedMap = new Map();

  for (const mission of missionOnly.flatMap((item) => item.missions || [])) {
    combinedMap.set(missionRecordKey(mission), mission);
  }

  for (const mission of liveMissions) {
    const key = missionRecordKey(mission);
    const existing = combinedMap.get(key);
    if (existing) {
      const mergedMission = repairMissionLabels({
        ...repairMissionLabels(augmentMissionWithStructuredData(existing)),
        ...repairMissionLabels(augmentMissionWithStructuredData(mission)),
        source: existing.source || mission.source,
        rewards: Array.isArray(existing.rewards) && existing.rewards.length ? existing.rewards : mission.rewards,
        rewardCount: existing.rewardCount || mission.rewardCount || 0,
        moneyReward: mission.moneyReward ?? existing.moneyReward ?? null,
        scriptReward: mission.scriptReward ?? existing.scriptReward ?? null,
      });
      combinedMap.set(key, mergedMission);
      continue;
    }
    combinedMap.set(key, repairMissionLabels(augmentMissionWithStructuredData(mission)));
  }

  for (const mission of missionRewardOverrideRecords()) {
    const key = missionRecordKey(mission);
    const existing = combinedMap.get(key);
    if (existing) {
      combinedMap.set(key, repairMissionLabels(augmentMissionWithRewardOverride(existing)));
      continue;
    }
    combinedMap.set(key, repairMissionLabels(augmentMissionWithStructuredData(mission)));
  }

  const combinedRecords = [...combinedMap.values()].map((mission) => repairMissionLabels(augmentMissionWithRewardOverride(mission)));
  const rewardsIndex = new Map();

  for (const item of missionOnly) {
    for (const mission of item.missions || []) {
      const key = [
        norm(mission?.type || ""),
        norm(mission?.faction || ""),
        missionTitleKey(mission?.title || mission?.name || mission?.mission || ""),
      ].join("::");
      if (!rewardsIndex.has(key)) rewardsIndex.set(key, new Map());
      const bucket = rewardsIndex.get(key);
      if (!bucket.has(item.name)) bucket.set(item.name, item);
    }
  }

  missionLookupCache = {
    dataItemsRef: dataItems,
    dataItemsLength: dataItems.length,
    liveMissionsRef: liveMissions,
    liveMissionsLength: liveMissions.length,
    scminersDbSignature,
    allItems: all,
    missionItems: missionOnly,
    combinedRecords,
    missionCatalog: [],
    missionCatalogReady: false,
    rewardsIndex,
    missionSearchIndex: new Map(),
    missionMatchIndex: new Map(),
  };
  return missionLookupCache;
}

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeText(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

function fileStem(v) {
  return cleanDisplayText(String(v || "").split(/[\\/]/).pop().replace(/\.[^.]+$/, ""));
}

function sourcePathLookupKeys(value) {
  const raw = cleanDisplayText(value);
  if (!raw) return [];
  const basename = cleanDisplayText(String(raw).split(/[\\/]/).pop() || "");
  const trimmed = cleanDisplayText(raw.replace(/^starbreaker[\\/]/i, "").replace(/^libs[\\/]/i, ""));
  const stem = fileStem(raw);
  return [...new Set([norm(raw), norm(trimmed), norm(basename), norm(stem)].filter(Boolean))];
}

function buyOfferFields(offer) {
  if (!offer || typeof offer !== "object") return null;
  if (buyOfferFieldCache.has(offer)) return buyOfferFieldCache.get(offer);
  const fields = deriveBuyOfferFields(offer);
  buyOfferFieldCache.set(offer, fields);
  return fields;
}

function escapeRegExp(v) {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CLEAN_DISPLAY_TEXT_REPLACEMENTS = Object.freeze({
  "\u00a0": " ",
  "Ã‚Â": "",
  "Ã‚": "",
  "â€‹": "",
  "â€Œ": "",
  "â€": "",
  "â€": "-",
  "â€": '"',
  "â€œ": '"',
  "â€˜": "'",
  "â€™": "'",
  "â€“": "–",
  "â€”": "—",
  "â€¦": "…",
  "Ã¢â‚¬â€œ": "–",
  "Ã¢â‚¬â€": "—",
  "Ã¢â‚¬Ëœ": "'",
  "Ã¢â‚¬â„¢": "'",
  "Ã¢â‚¬Å“": '"',
  "Ã¢â‚¬Â": '"',
  "Â·": "·",
  "Â": "",
  "ï¿½": "",
  "_": " ",
});

const CLEAN_DISPLAY_TEXT_REGEX = new RegExp(
  Object.keys(CLEAN_DISPLAY_TEXT_REPLACEMENTS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|"),
  "g",
);

const cleanDisplayTextCache = new Map();

function cleanDisplayText(v) {
  const input = String(v || "");
  if (!input) return "";
  if (cleanDisplayTextCache.has(input)) return cleanDisplayTextCache.get(input);

  if (!/[ÃâÂï¿½_\u00a0]/.test(input) && !/\s{2,}/.test(input)) {
    const fast = input.trim();
    if (cleanDisplayTextCache.size > 5000) cleanDisplayTextCache.clear();
    cleanDisplayTextCache.set(input, fast);
    return fast;
  }

  const cleaned = input
    .replace(CLEAN_DISPLAY_TEXT_REGEX, (match) => CLEAN_DISPLAY_TEXT_REPLACEMENTS[match] ?? match)
    .replace(/\s+/g, " ")
    .trim();

  if (cleanDisplayTextCache.size > 5000) cleanDisplayTextCache.clear();
  cleanDisplayTextCache.set(input, cleaned);
  return cleaned;
}

const BUY_SYSTEM_NAMES = Object.freeze(["Nyx", "Pyro", "Stanton"]);

const BUY_KNOWN_ORBITS = Object.freeze([
  "ArcCorp",
  "ARC-L1",
  "ARC-L2",
  "ARC-L3",
  "ARC-L4",
  "ARC-L5",
  "Bloom",
  "Crusader",
  "CRU-L1",
  "CRU-L2",
  "CRU-L3",
  "CRU-L4",
  "CRU-L5",
  "Delamar",
  "Deep Space & Jump Points",
  "Glaciem Ring Orbit",
  "Hurston",
  "HUR-L1",
  "HUR-L2",
  "HUR-L3",
  "HUR-L4",
  "HUR-L5",
  "Keeger Belt Orbit",
  "Lagrange Points & Deep Space",
  "MIC-L1",
  "MIC-L2",
  "MIC-L3",
  "MIC-L4",
  "MIC-L5",
  "microTech",
  "Monox",
  "Nyx",
  "Nyx I",
  "Nyx II",
  "Nyx III",
  "Pyro",
  "Pyro I",
  "Pyro II",
  "Pyro III",
  "Pyro IV",
  "Pyro V",
  "Pyro VI",
  "Space Orbits & L-Points",
  "Terminus",
  "Yela",
]);

const BUY_KNOWN_ORBITS_BY_LENGTH = Object.freeze([...BUY_KNOWN_ORBITS].sort((a, b) => b.length - a.length));
const BUY_KNOWN_ORBIT_SET = new Set(BUY_KNOWN_ORBITS.map((value) => norm(value)));

const BUY_KNOWN_AREAS = Object.freeze([
  "Area 18",
  "Area18",
  "Baijini Point",
  "Checkmate",
  "Dudley & Daughters",
  "Endgame",
  "Everus Harbor",
  "Gaslight",
  "Grim Hex",
  "HUR-L1",
  "HUR-L2",
  "HUR-L3",
  "HUR-L4",
  "HUR-L5",
  "Levski",
  "Lorville",
  "MIC-L1",
  "MIC-L2",
  "MIC-L3",
  "MIC-L4",
  "MIC-L5",
  "New Babbage",
  "Nyx Gateway",
  "Orbituary",
  "Orison",
  "Port Tressler",
  "Pyro Gateway",
  "Pyro I",
  "Pyro II",
  "Pyro III",
  "Pyro IV",
  "Pyro V",
  "Pyro VI",
  "PYR2-L4",
  "PYR3-L1",
  "PYR3-L3",
  "PYR5-L2",
  "PYR5-L4",
  "PYR5-L5",
  "PYR6-L3",
  "PYR6-L4",
  "PYR6-L5",
  "People's Service Stations",
  "RAB-Alpha",
  "Rat's Nest",
  "Ruin Station",
  "Seraphim Station",
  "Shallow Frontier Station",
  "Shallow Fields",
  "Stanton Gateway",
  "Starlight Service Station",
  "Teasa Spaceport",
  "The Commons",
  "Traveler Rentals",
  "Wide Forest Station",
  "Ambitious Dream",
  "Beautiful Glen",
]);

const BUY_KNOWN_AREAS_BY_LENGTH = Object.freeze([...BUY_KNOWN_AREAS].sort((a, b) => b.length - a.length));
const BUY_KNOWN_AREA_SET = new Set(BUY_KNOWN_AREAS.map((value) => norm(value)));

const BUY_AREA_TO_ORBIT = Object.freeze({
  nyx: Object.freeze({
    levski: "Delamar",
    "nyx gateway": "Nyx",
  }),
  pyro: Object.freeze({
    bloom: "Bloom",
    checkmate: "Pyro",
    "dudley & daughters": "Pyro",
    endgame: "Pyro",
    gaslight: "Pyro",
    monox: "Pyro",
    orbituary: "Pyro",
    "pyr2-l4": "Pyro",
    "pyr3-l1": "Pyro",
    "pyr3-l3": "Pyro",
    "pyr5-l2": "Pyro",
    "pyr5-l4": "Pyro",
    "pyr5-l5": "Pyro",
    "pyr6-l3": "Pyro",
    "pyr6-l4": "Pyro",
    "pyr6-l5": "Pyro",
    "pyro gateway": "Pyro",
    "pyro i": "Pyro",
    "pyro ii": "Pyro",
    "pyro iii": "Pyro",
    "pyro iv": "Pyro",
    "pyro v": "Pyro",
    "pyro vi": "Pyro",
    "rat's nest": "Pyro",
    "ruin station": "Terminus",
    "starlight service station": "Pyro",
    terminus: "Pyro",
  }),
  stanton: Object.freeze({
    "area 18": "ArcCorp",
    area18: "ArcCorp",
    "astro armada": "ArcCorp",
    "baijini point": "ArcCorp",
    "crusader showroom": "Crusader",
    "dumper's depot": "ArcCorp",
    "everus harbor": "Hurston",
    galleria: "Stanton",
    "grim hex": "Crusader",
    hurston: "Hurston",
    lorville: "Hurston",
    microtech: "microTech",
    "new babbage": "microTech",
    "new deal": "Hurston",
    "port tressler": "microTech",
    "platinum bay": "Stanton",
    "seraphim station": "Crusader",
    "tammany and sons": "Hurston",
    "teach's ship shop": "Delamar",
    "teasa spaceport": "Hurston",
    "the commons": "microTech",
  }),
});

const BUY_BUSINESS_TO_AREA = Object.freeze({
  "astro armada": "Area 18",
  "buy and fly": "",
  "covalex shipping office": "Orison",
  "cordy's armor & more": "Levski",
  "center mass": "New Babbage",
  "conscientious objects": "Levski",
  "cousin crows": "Orison",
  "dumper's depot": "Area 18",
  "fly and buy": "",
  "fps armor": "",
  "galleria": "",
  "hats & more": "",
  "hidden tigerscawl shop": "Levski",
  "kel-to": "New Babbage",
  "new deal": "Lorville",
  "omega pro": "New Babbage",
  "platinum bay": "",
  "shop_terminal": "",
  "tammany and sons": "Lorville",
  "teach's ship shop": "Levski",
});

const BUY_BUSINESS_LABELS = Object.freeze(Object.keys(BUY_BUSINESS_TO_AREA));
const BUY_BUSINESS_LABELS_BY_LENGTH = Object.freeze([...BUY_BUSINESS_LABELS].sort((a, b) => b.length - a.length));

const BUY_LOCATION_LABELS = Object.freeze([
  "astro armada",
  "buy and fly",
  "cafe musain",
  "cordy's armor & more",
  "covalex shipping office",
  "center mass",
  "conscientious objects",
  "cousin crows",
  "dumper's depot",
  "fly and buy",
  "fps armor",
  "galleria",
  "hats & more",
  "hidden tigerscawl shop",
  "kel-to",
  "new deal",
  "omega pro",
  "platinum bay",
  "shop_terminal",
  "shopping galleria",
  "tammany and sons",
  "teach's ship shop",
]);

const BUY_LOCATION_LABEL_SET = new Set(BUY_LOCATION_LABELS);

const BUY_GENERIC_SHOP_LABELS = Object.freeze([
  "ammo",
  "arcade",
  "armor",
  "bar",
  "bazaar",
  "cargo center",
  "cargo deck",
  "cargo services",
  "cargo shop",
  "cafe",
  "clinic",
  "aparelli",
  "concourse",
  "con store",
  "convenience",
  "buy and fly",
  "covalex shipping office",
  "crew quarters",
  "center mass",
  "centermass",
  "casaba outlet",
  "commissary",
  "cubby blast",
  "diner",
  "dumper's depot",
  "dock",
  "depot",
  "deck",
  "fps armor",
  "gear up",
  "general rest",
  "goods",
  "hangar transit",
  "hangars&habs",
  "good as new",
  "galleria",
  "hospital",
  "habs",
  "kel-to",
  "kiosk",
  "lobby",
  "main concourse",
  "main hall",
  "market",
  "marketplace",
  "item shop",
  "medical",
  "medical_shop",
  "moonshine",
  "outlet",
  "omega pro",
  "pharmacy",
  "pizza",
  "plaza",
  "platinum bay",
  "purchasing",
  "rental",
  "rentals",
  "refinery",
  "refinery shop",
  "repair",
  "retail bridges",
  "retail plaza",
  "service",
  "services",
  "shubin interstellar",
  "shop",
  "shop_terminal",
  "shops",
  "ship shop",
  "ship rentals",
  "showroom",
  "store",
  "the commons",
  "tammany and sons",
  "teach's ship shop",
  "terminal",
  "trade",
  "trash",
  "supplies",
  "weapon",
  "wear & tear",
  "weapons",
  "workwear",
  "xian",
]);

const BUY_GENERIC_SHOP_LABEL_SET = new Set(BUY_GENERIC_SHOP_LABELS);
const BUY_GENERIC_SHOP_LABELS_BY_LENGTH = Object.freeze([...BUY_GENERIC_SHOP_LABELS].sort((a, b) => b.length - a.length));

const BUY_DATA_BATCH_SIZE = 50;
const BUY_DATA_PROGRESS_RENDER_DELAY_MS = 120;

function yieldToMainThread(timeout = 0) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

function scheduleBuyLoadingRender() {
  if (!state.appReady || state.view !== "buy-items") return;
  if (buyDataProgressRenderTimer) return;
  buyDataProgressRenderTimer = setTimeout(() => {
    buyDataProgressRenderTimer = null;
    if (state.appReady && state.view === "buy-items") renderBuy();
  }, BUY_DATA_PROGRESS_RENDER_DELAY_MS);
}

async function chunkMap(items, mapper, { batchSize = BUY_DATA_BATCH_SIZE, onProgress } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  if (list.length <= batchSize) return list.map(mapper);
  const result = new Array(list.length);
  for (let index = 0; index < list.length; index += 1) {
    result[index] = mapper(list[index], index, list);
    if (index > 0 && index % batchSize === 0) {
      onProgress?.(index, list.length);
      await yieldToMainThread();
    }
  }
  onProgress?.(list.length, list.length);
  return result;
}

async function mergeByKeyAsync(sources, { batchSize = BUY_DATA_BATCH_SIZE, onProgress } = {}) {
  const map = new Map();
  const chunks = Array.isArray(sources) ? sources : [];
  let total = 0;
  for (const source of chunks) total += Array.isArray(source) ? source.length : 0;
  let processed = 0;
  for (const source of chunks) {
    for (const entry of Array.isArray(source) ? source : []) {
      const key = normalizeKey(entry);
      if (!key) {
        processed += 1;
        if (processed % batchSize === 0) {
          onProgress?.(processed, total);
          await yieldToMainThread();
        }
        continue;
      }
      map.set(key, map.has(key) ? mergeRecord(map.get(key) || {}, entry) : entry);
      processed += 1;
      if (processed % batchSize === 0) {
        onProgress?.(processed, total);
        await yieldToMainThread();
      }
    }
  }
  onProgress?.(processed, total || processed);
  return [...map.values()];
}

function normalizeKey(entry) {
  return norm(entry?.id || entry?.name || entry?.title || "");
}

function mergeRecord(primary = {}, secondary = {}) {
  const merged = { ...primary, ...secondary };
  merged.offers = Array.isArray(secondary.offers) && secondary.offers.length ? secondary.offers : Array.isArray(primary.offers) ? primary.offers : [];
  merged.loadoutCategories = Array.isArray(secondary.loadoutCategories) && secondary.loadoutCategories.length ? secondary.loadoutCategories : Array.isArray(primary.loadoutCategories) ? primary.loadoutCategories : [];
  merged.loadoutWeapons = Array.isArray(secondary.loadoutWeapons) && secondary.loadoutWeapons.length ? secondary.loadoutWeapons : Array.isArray(primary.loadoutWeapons) ? primary.loadoutWeapons : [];
  merged.loadoutComponents = Array.isArray(secondary.loadoutComponents) && secondary.loadoutComponents.length ? secondary.loadoutComponents : Array.isArray(primary.loadoutComponents) ? primary.loadoutComponents : [];
  merged.prices = secondary.prices || primary.prices || merged.prices || {};
  merged.status = secondary.status || primary.status || merged.status || "";
  return merged;
}

function buyIsBusinessLabel(value) {
  const label = norm(value);
  if (!label || label === "all") return false;
  return BUY_BUSINESS_LABELS_BY_LENGTH.some((prefix) => label.startsWith(prefix));
}

function isKnownBuyArea(value) {
  const label = norm(value);
  return !!label && BUY_KNOWN_AREA_SET.has(label);
}

function isKnownBuyOrbit(value) {
  const label = norm(value);
  return !!label && BUY_KNOWN_ORBIT_SET.has(label);
}

function isKnownBuyLocation(value) {
  const label = norm(value);
  if (!label) return false;
  return BUY_LOCATION_LABELS.some((entry) => label.includes(entry));
}

function orbitFromArea(system, area) {
  const map = BUY_AREA_TO_ORBIT[norm(system)] || {};
  return cleanDisplayText(map[norm(area)] || "");
}

function areaFromBusiness(value) {
  return cleanDisplayText(BUY_BUSINESS_TO_AREA[norm(value)] || "");
}

function businessMatch(text) {
  const hay = norm(text);
  if (!hay) return "";
  return cleanDisplayText(BUY_BUSINESS_LABELS_BY_LENGTH.find((label) => label && hay.includes(label)) || "");
}

function splitKnownTail(text) {
  const value = cleanDisplayText(text);
  const lower = norm(value);
  for (const label of BUY_KNOWN_AREAS_BY_LENGTH) {
    const needle = norm(label);
    if (!needle) continue;
    if (lower === needle) return { prefix: "", tail: cleanDisplayText(label) };
    if (lower.endsWith(` ${needle}`)) {
      return {
        prefix: cleanDisplayText(value.slice(0, value.length - label.length)).replace(/[->\s]+$/g, ""),
        tail: cleanDisplayText(label),
      };
    }
  }
  return null;
}

function splitBuySegments(text) {
  return cleanDisplayText(text)
    .split(/\s*-\s*|\s*>\s*/)
    .map((part) => cleanDisplayText(part))
    .filter(Boolean);
}

function extractBuySystem(...values) {
  for (const value of values) {
    const text = cleanDisplayText(value);
    if (!text) continue;
    const match = text.match(/\b(Nyx|Pyro|Stanton)\b/i);
    if (match) return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  }
  return "";
}

function isGenericBuyShopLabel(value) {
  const label = norm(value);
  if (!label) return false;
  return BUY_GENERIC_SHOP_LABEL_SET.has(label) || BUY_GENERIC_SHOP_LABELS_BY_LENGTH.some((entry) => label.includes(entry));
}

function firstMeaningfulPoi(segments, orbit, area) {
  const orbitLabel = cleanDisplayText(orbit);
  const areaLabel = cleanDisplayText(area);
  for (const segment of segments) {
    if (!segment) continue;
    const label = cleanDisplayText(segment);
    if (!label) continue;
    if (orbitLabel && norm(label) === norm(orbitLabel)) continue;
    if (areaLabel && norm(label) === norm(areaLabel) && norm(orbitLabel) !== norm(areaLabel)) return label;
    if (buyIsBusinessLabel(label) || isGenericBuyShopLabel(label)) continue;
    return label;
  }
  return "";
}

function lastMeaningfulShop(segments) {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const label = cleanDisplayText(segments[index]);
    if (!label) continue;
    if (isKnownBuyOrbit(label) || isKnownBuyArea(label)) continue;
    if (buyIsBusinessLabel(label) || isKnownBuyLocation(label)) return label;
  }
  return "";
}

function deriveBuyOfferFields(offer) {
  const raw = cleanDisplayText(offer?.locationLabel || offer?.locationPath || offer?.location || "");
  const fullPath = splitBuySegments(offer?.location || raw);
  const pathSegments = fullPath.length > 1 ? fullPath.slice(1) : splitBuySegments(offer?.locationPath || raw);
  const system = extractBuySystem(offer?.system, offer?.location, raw, fullPath[0]) || "";
  const localOrbit = cleanDisplayText(window.SC_ITEMS_API?.resolveOrbit?.(offer) || "");
  const localLocation = cleanDisplayText(window.SC_ITEMS_API?.resolveLocation?.(offer) || "");
  const fallbackOrbitRaw = cleanDisplayText(offer?.area || offer?.orbit || pathSegments[0] || "");
  const fallbackOrbit = orbitFromArea(system, fallbackOrbitRaw) || fallbackOrbitRaw;
  const fallbackLocation =
    fullPath.length > 2
      ? fullPath.slice(2).join(" - ")
      : cleanDisplayText(offer?.locationPath || pathSegments.slice(1).join(" - ") || "");
  const rawArea = cleanDisplayText(offer?.area || "");
  const orbitHint = orbitFromArea(system, rawArea);
  const explicitOrbit = cleanDisplayText(offer?.orbit || offer?.planet || offer?.body || "");
  const orbit = localOrbit || explicitOrbit || orbitHint || fallbackOrbit || (pathSegments[0] && !buyIsBusinessLabel(pathSegments[0]) ? pathSegments[0] : "");
  const business = businessMatch([raw, offer?.locationPath || "", offer?.location || "", rawArea].join(" "));
  const locationPath = localLocation || fallbackLocation || "";
  const poiFromPath = firstMeaningfulPoi(splitBuySegments(locationPath || rawArea || ""), orbit, rawArea);
  const rawAreaLooksLikeOrbit = isKnownBuyOrbit(rawArea);
  const rawAreaLooksLikePoi = isKnownBuyArea(rawArea) && !rawAreaLooksLikeOrbit;
  const resolvedPoi =
    (rawAreaLooksLikePoi ? rawArea : "") ||
    poiFromPath ||
    areaFromBusiness(business) ||
    (rawArea && norm(rawArea) !== norm(orbit) && !buyIsBusinessLabel(rawArea) ? rawArea : "");
  const resolvedShop = business || lastMeaningfulShop(pathSegments) || "";
  const haystack = [raw, resolvedPoi, resolvedShop, orbit].join(" ").toLowerCase();
  let resolvedSystem = system;
  if (!BUY_SYSTEM_NAMES.includes(system)) {
    if (haystack.includes("levski")) resolvedSystem = "Nyx";
    else if (haystack.includes("orbituary") || haystack.includes("checkmate") || haystack.includes("ruin station") || haystack.includes("pyro gateway") || haystack.includes("pyro v") || haystack.includes("pyro i") || haystack.includes("monox") || haystack.includes("terminus") || haystack.includes("gaslight") || haystack.includes("rat's nest") || haystack.includes("endgame") || haystack.includes("dudley & daughters") || haystack.includes("megumi refueling") || haystack.includes("bloom")) resolvedSystem = "Pyro";
    else if (haystack.includes("area 18") || haystack.includes("lorville") || haystack.includes("orison") || haystack.includes("new babbage") || haystack.includes("teasa") || haystack.includes("arccorp") || haystack.includes("crusader") || haystack.includes("hurston") || haystack.includes("microtech") || haystack.includes("riker memorial") || haystack.includes("new deal") || haystack.includes("astro armada") || haystack.includes("teach's ship shop") || haystack.includes("buy and fly") || haystack.includes("port tressler") || haystack.includes("everus harbor") || haystack.includes("baijini point") || haystack.includes("seraphim station") || haystack.includes("tammany and sons") || haystack.includes("covalex shipping office") || haystack.includes("dumper's depot") || haystack.includes("kel-to")) resolvedSystem = "Stanton";
  }

  return {
    raw,
    system: resolvedSystem || "",
    orbit: orbit || "",
    area: resolvedPoi || "",
    locationPath: locationPath || raw || "",
    locationName: resolvedShop || "",
    locationLabel: resolvedShop || "",
  };
}

function normalizeRecord(entry) {
  return {
    ...entry,
    offers: Array.isArray(entry?.offers)
      ? entry.offers.map((offer) => {
          const fields = deriveBuyOfferFields(offer);
          return {
            ...offer,
            system: fields.system,
            orbit: fields.orbit,
            area: fields.area,
            locationPath: fields.locationPath,
            locationLabel: fields.locationLabel,
            locationName: fields.locationName,
          };
        })
      : [],
  };
}

function dismantleSourceName(entry) {
  const source = entry?.source_item || {};
  return cleanDisplayText(
    source.item_name ||
      source.item_record_name ||
      source.name ||
      source.label ||
      source.display_name ||
      source.item_class_name ||
      source.class_name ||
      entry?.name ||
      entry?.source_id ||
      "",
  );
}

function dismantleSourceType(entry) {
  const name = dismantleSourceName(entry).toLowerCase();
  if (!name) return { type: "Miscellaneous", subtype: "Miscellaneous" };
  if (/battery\b/.test(name)) return { type: "Ammo", subtype: "Energy" };
  if (/magazine|clip|cap\b/.test(name)) return { type: "Ammo", subtype: "Ballistic" };
  if (/beam|tool|salvage|repair|mining|tractor/.test(name)) return { type: "Utility", subtype: "Utility" };
  return { type: "Miscellaneous", subtype: "Miscellaneous" };
}

function syntheticDismantleItems(items) {
  const sourceItems = bundledDismantleReturnsPayload().length ? bundledDismantleReturnsPayload() : scminersDbExportRecords("dismantle_returns.json");
  if (!Array.isArray(sourceItems) || !sourceItems.length) return Array.isArray(items) ? items : [];
  const existingKeys = new Set(
    (Array.isArray(items) ? items : [])
      .flatMap((item) => [
        norm(item?.name),
        norm(item?.record_name),
        norm(item?.item_name),
        norm(item?.source_path),
        norm(item?.sourcePath),
      ])
      .filter(Boolean),
  );
  const additions = [];
  const seenSources = new Set();
  for (const entry of sourceItems) {
    const name = dismantleSourceName(entry);
    if (!name) continue;
    const sourceKey = norm(name);
    if (!sourceKey || seenSources.has(sourceKey) || existingKeys.has(sourceKey)) continue;
    seenSources.add(sourceKey);
    const sourcePath = cleanDisplayText(entry?.source_item_source_path || entry?.source_item?.source_path || "");
    const sourceId = cleanDisplayText(entry?.source_id || entry?.source_item?.item_id || entry?.source_item?.item_class_id || "");
    const { type, subtype } = dismantleSourceType(entry);
    additions.push({
      id: sourceId || sourcePath || name,
      name,
      type,
      subtype,
      missions: [],
      craftable: false,
      blueprint: "",
      craftTime: 0,
      materials: [],
      offers: [],
      source_path: sourcePath,
      source_id: sourceId,
      source_item: entry?.source_item || null,
      synthetic: true,
    });
  }
  return Array.isArray(items) ? [...items, ...additions] : additions;
}

function isMalformedBuyEntry(entry) {
  const name = String(entry?.name || entry?.title || "");
  const type = norm(entry?.type || "");
  const subtype = norm(entry?.subtype || "");
  const offers = Array.isArray(entry?.offers) ? entry.offers.length : 0;
  return name.length > 1000 || (offers === 0 && type === "unknown" && subtype === "unknown" && name.length > 200);
}

function isMissingDisplayText(value) {
  const text = cleanDisplayText(value).toLowerCase();
  return !text || text === "unavailable" || text === "n/a" || text === "not available";
}

function isBadLabel(v) {
  const value = norm(v);
  return (
    !value
    || value === "unknown"
    || value === "n/a"
    || value === "none"
    || value.includes("placeholder")
    || value.includes("null")
    || value.includes("file://")
    || value.includes("/records/")
    || value.includes("\\records\\")
    || value.includes("libs/foundry")
    || value.includes("libs\\foundry")
  );
}

function countByName(values) {
  const counts = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanDisplayText(value);
    if (!text) continue;
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

function normalizeScminersDbManifestUrl(value) {
  const text = cleanDisplayText(value || "");
  return text || SCMINERSDB_DEFAULT_MANIFEST_URL;
}

function currentScminersDbManifestUrl() {
  return normalizeScminersDbManifestUrl(
    state.scminersDb?.manifestUrl
      || state.scminersDbManifestUrl
      || localStorage.getItem(SCMINERSDB_MANIFEST_URL_KEY)
      || SCMINERSDB_DEFAULT_MANIFEST_URL,
  );
}

function setScminersDbManifestUrl(value) {
  const normalized = normalizeScminersDbManifestUrl(value);
  state.scminersDbManifestUrl = normalized;
  localStorage.setItem(SCMINERSDB_MANIFEST_URL_KEY, normalized);
  return normalized;
}

function bundledScminersDbPayload() {
  const payload = bundledScminersDbDataCache || window.SC_MINERS_DB_BUNDLED;
  return payload && typeof payload === "object" ? payload : null;
}

async function ensureBundledScminersDbPayload() {
  const existing = bundledScminersDbPayload();
  if (existing) return existing;
  try {
    const bundleScript = [...document.querySelectorAll("script")].find((script) => String(script?.src || "").includes("scminersdb_local_bundle.js"));
    const response = await fetch(bundleScript?.src || "./scminersdb_local_bundle.js?v=20260623b");
    if (!response.ok) return null;
    const text = await response.text();
    const start = text.indexOf("=");
    const jsonText = (start >= 0 ? text.slice(start + 1) : text).trim().replace(/;\s*$/, "");
    const payload = JSON.parse(jsonText);
    if (payload && typeof payload === "object") bundledScminersDbDataCache = payload;
  } catch {
    return null;
  }
  return bundledScminersDbPayload();
}

function useBundledScminersDbData() {
  const bundled = bundledScminersDbPayload();
  if (!bundled) return null;
  state.scminersDb = {
    available: true,
    manifestUrl: "bundled://scminersdb-local-bundle",
    manifest: bundled.manifest || null,
    files: Array.isArray(bundled.files) ? bundled.files : [],
    exports: bundled.exports && typeof bundled.exports === "object" ? bundled.exports : {},
    fileIndex: bundled.fileIndex && typeof bundled.fileIndex === "object" ? bundled.fileIndex : {},
    signature: cleanDisplayText(bundled.signature || ""),
    status: cleanDisplayText(bundled.status || "Bundled SCMinersDB data loaded"),
    lastLoaded: cleanDisplayText(bundled.generatedAt || new Date().toISOString()),
    source: "bundled",
  };
  window.SC_MINERS_DB = state.scminersDb;
  if (window.SC_ITEMS_API) window.SC_ITEMS_API.scminersDb = state.scminersDb;
  return state.scminersDb;
}

function resolveScminersDbAssetUrl(manifestUrl, assetUrl) {
  try {
    return new URL(assetUrl, manifestUrl).href;
  } catch {
    return cleanDisplayText(assetUrl || "");
  }
}

function isHiddenShipLoadoutName(value) {
  const text = norm(cleanDisplayText(value));
  if (!text) return true;
  return /varipuck|manned turret|remote turret/i.test(text);
}

function visibleShipLoadoutNames(values) {
  return (Array.isArray(values) ? values : []).filter((value) => !isHiddenShipLoadoutName(value));
}

function isShipWeaponLoadoutName(value) {
  const text = norm(cleanDisplayText(value));
  if (!text) return false;
  if (/varipuck|gimbal mount|manned turret|remote turret|weapon mount|turret mount|vehicle/i.test(text)) return false;
  return /(cannon|repeater|laser|gun|missile|torpedo|gatling|swarm|bomb|rocket|railgun|scatter|pdc)/i.test(text);
}

function visibleShipWeaponNames(values) {
  return visibleShipLoadoutNames(values).filter((value) => isShipWeaponLoadoutName(value));
}

function isShipComponentLoadoutName(value) {
  const text = norm(cleanDisplayText(value));
  if (!text) return false;
  if (/varipuck|manned turret|remote turret|vehicle/i.test(text)) return false;
  if (/\b(armor|coolers?|counter measures?|flight controller|life support|power plants?|quantum drives?|radars?|shields?|thrusters?|turrets?|weapons?|weapon attachments?|missile & bomb racks?)\b/i.test(text)) return false;
  return true;
}

function visibleShipComponentNames(values) {
  return visibleShipLoadoutNames(values).filter((value) => isShipComponentLoadoutName(value));
}

const SHIP_LOADOUT_OVERRIDES = {
  polaris: {
    weapons: [
      ...Array(12).fill("CF-337 Panther Repeater"),
      ...Array(8).fill("Omnisky XII Cannon"),
      ...Array(2).fill("Maris Cannon"),
      ...Array(12).fill("Ignite II Missile"),
      ...Array(7).fill('M2C "Swarm"'),
      ...Array(16).fill("Arrester III Missile"),
      // Polaris has four torpedo carriers, each holding seven VT-T10 torps.
      ...Array(28).fill('VT-T10 "Veritas" Torpedo'),
    ],
    components: [
      "SureGrip S2 Tractor Beam",
      "Glacis",
      "Serac",
      "Stellate",
      "Erebos",
      "Exodus",
    ],
  },
};

function shipLoadoutOverrideKey(entry) {
  return norm(cleanDisplayText(buyEntryName(entry)));
}

function shipLoadoutDisplayNames(entry, kind) {
  const override = SHIP_LOADOUT_OVERRIDES[shipLoadoutOverrideKey(entry)];
  if (override && Array.isArray(override[kind])) return override[kind];
  const values = kind === "components" ? entry?.loadoutComponents : entry?.loadoutWeapons;
  return visibleShipLoadoutNames(values);
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buyEntryStatsGroups(entry, tab = state.buyTab) {
  const groups = [];
  const seen = new Set();
  const pushGroup = (label, value) => {
    if (!value) return;
    const rows = [];
    const pushRow = (rowLabel, rowValue) => {
      const labelText = cleanDisplayText(rowLabel);
      const valueText = cleanDisplayText(rowValue);
      if (!labelText || isMissingDisplayText(valueText)) return;
      const key = `${labelText}::${valueText}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ label: labelText, value: valueText });
    };
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const nested = Object.entries(item)
            .map(([k, v]) => [cleanDisplayText(k), cleanDisplayText(v)])
            .filter(([k, v]) => k && v);
          if (nested.length) {
            for (const [k, v] of nested) pushRow(k, v);
          } else {
            pushRow("Value", item);
          }
        } else {
          pushRow(label, item);
        }
      }
    } else if (typeof value === "object") {
      for (const [rowLabel, rowValue] of Object.entries(value)) {
        if (rowValue && typeof rowValue === "object" && !Array.isArray(rowValue)) {
          const nested = Object.entries(rowValue)
            .map(([k, v]) => [cleanDisplayText(k), cleanDisplayText(v)])
            .filter(([k, v]) => k && v);
          if (nested.length) {
            for (const [k, v] of nested) pushRow(`${rowLabel} ${k}`, v);
          } else {
            pushRow(rowLabel, rowValue);
          }
        } else {
          pushRow(rowLabel, rowValue);
        }
      }
    } else {
      pushRow(label, value);
    }
    if (rows.length) groups.push({ label, rows });
  };

  const structuredSections = [
    ["Stats", entry?.stats],
    ["General", entry?.general],
    ["Modifiers", entry?.modifiers],
    ["Specifications", entry?.specifications],
    ["Details", entry?.details],
    ["Attributes", entry?.attributes],
  ];
  for (const [label, value] of structuredSections) pushGroup(label, value);

  const directStats = [];
  const addDirectStat = (label, value) => {
    const text = cleanDisplayText(value);
    if (isMissingDisplayText(text)) return;
    directStats.push({ label, value: text });
  };
  if (tab === "ships" || tab === "rentals") {
    addDirectStat("Crew", entry?.crew);
    addDirectStat("Cargo", entry?.cargo);
    const dims = [entry?.length ? `L ${cleanDisplayText(entry.length)}` : "", entry?.width ? `W ${cleanDisplayText(entry.width)}` : "", entry?.height ? `H ${cleanDisplayText(entry.height)}` : "", entry?.mass ? `Mass ${cleanDisplayText(entry.mass)}` : ""].filter(Boolean).join(" · ");
    addDirectStat("Dimensions", dims);
  }
  for (const key of ["charges", "duration", "instability", "optimalChargeWindow", "shatterDamage", "laserPower", "tractorPower", "resistance", "volume", "damage", "dps", "ammo", "muzzleVelocity", "effectiveRange", "fireModes"]) {
    if (entry?.[key] !== undefined && entry?.[key] !== null && entry?.[key] !== "") {
      addDirectStat(key.replace(/([a-z])([A-Z])/g, "$1 $2"), entry[key]);
    }
  }
  if (directStats.length) groups.push({ label: "Stats", rows: directStats });
  const itemSections = [];
  if (entry && tab === "items") {
    const kind = buyEntryItemKind(entry);
    const rawSubtype = cleanDisplayText(entry?.subtype || "");
    const generalRows = [];
    buyEntryItemRows(generalRows, "Manufacturer", buyEntryManufacturer(entry));
    buyEntryItemRows(generalRows, "Volume", entry?.volume);
    if (kind === "weapon") buyEntryItemRows(generalRows, "Damage", entry?.damage ?? entry?.alphaDamage ?? entry?.baseDamage ?? entry?.stats?.damage);
    itemSections.push(buyEntryItemSection("General", generalRows));

    if (kind === "weapon") {
      const statsRows = [];
      buyEntryItemRows(statsRows, "Ammo", entry?.ammo ?? entry?.magazineCapacity ?? entry?.stats?.ammo);
      buyEntryItemRows(statsRows, "DPS", entry?.dps ?? entry?.singleDps ?? entry?.maxDps ?? entry?.stats?.dps);
      buyEntryItemRows(statsRows, "Rate of fire", entry?.fireRate ?? entry?.singleFirerate ?? entry?.maxFirerate ?? entry?.stats?.fireRate);
      buyEntryItemRows(statsRows, "Muzzle velocity", entry?.muzzleVelocity ?? entry?.bulletSpeed ?? entry?.stats?.muzzleVelocity);
      buyEntryItemRows(statsRows, "Effective range", entry?.effectiveRange ?? entry?.range ?? entry?.stats?.effectiveRange);
      itemSections.push(buyEntryItemSection("Stats", statsRows));

      const attachmentRows = [];
      buyEntryItemRows(attachmentRows, "Scope size", entry?.scopeSize);
      buyEntryItemRows(attachmentRows, "Barrel size", entry?.barrelSize);
      buyEntryItemRows(attachmentRows, "Underbarrel size", entry?.underbarrelSize);
      const attachments = buyEntryItemSection("Attachments", attachmentRows);
      if (attachments) itemSections.push(attachments);
    } else if (kind === "armor") {
      const statsRows = [];
      buyEntryItemRows(statsRows, "Armor type", rawSubtype);
      buyEntryItemRows(statsRows, "Capacity", entry?.capacity);
      buyEntryItemRows(statsRows, "Volume", entry?.volume);
      itemSections.push(buyEntryItemSection("Stats", statsRows));

      const tempRows = [];
      buyEntryItemRows(tempRows, "Min safe temperature", entry?.minSafeTemperature ?? entry?.minTemperature);
      buyEntryItemRows(tempRows, "Max safe temperature", entry?.maxSafeTemperature ?? entry?.maxTemperature);
      const tempSection = buyEntryItemSection("Temperature Stats", tempRows);
      if (tempSection) itemSections.push(tempSection);

      const radRows = [];
      buyEntryItemRows(radRows, "Radiation protection", entry?.radiationProtection);
      buyEntryItemRows(radRows, "Radiation scrub rate", entry?.radiationScrubRate);
      const radSection = buyEntryItemSection("Radiation Stats", radRows);
      if (radSection) itemSections.push(radSection);

      const resistRows = [];
      buyEntryItemRows(resistRows, "Physical", entry?.physicalResistance ?? entry?.physical);
      buyEntryItemRows(resistRows, "Energy", entry?.energyResistance ?? entry?.energy);
      buyEntryItemRows(resistRows, "Distortion", entry?.distortionResistance ?? entry?.distortion);
      buyEntryItemRows(resistRows, "Thermal", entry?.thermalResistance ?? entry?.thermal);
      buyEntryItemRows(resistRows, "Biochemical", entry?.biochemicalResistance ?? entry?.biochemical);
      buyEntryItemRows(resistRows, "Stun", entry?.stunResistance ?? entry?.stun);
      const resistSection = buyEntryItemSection("Damage Resistances", resistRows);
      if (resistSection) itemSections.push(resistSection);
    } else if (kind === "consumable") {
      const statsRows = [];
      buyEntryItemRows(statsRows, "Hunger reduction", entry?.hungerReduction);
      buyEntryItemRows(statsRows, "Thirst reduction", entry?.thirstReduction);
      buyEntryItemRows(statsRows, "Hydrating", entry?.hydrating);
      buyEntryItemRows(statsRows, "Energizing", entry?.energizing);
      buyEntryItemRows(statsRows, "Cognitive boost", entry?.cognitiveBoost);
      buyEntryItemRows(statsRows, "Cognitive impair", entry?.cognitiveImpair);
      buyEntryItemRows(statsRows, "Hypo metabolic", entry?.hypoMetabolic);
      buyEntryItemRows(statsRows, "Hyper metabolic", entry?.hyperMetabolic);
      buyEntryItemRows(statsRows, "Immune boost", entry?.immuneBoost);
      buyEntryItemRows(statsRows, "Toxic", entry?.toxic);
      itemSections.push(buyEntryItemSection("Stats", statsRows));
    } else if (kind === "utility") {
      const statsRows = [];
      buyEntryItemRows(statsRows, "Charges", entry?.charges);
      buyEntryItemRows(statsRows, "Duration", entry?.duration);
      buyEntryItemRows(statsRows, "Instability", entry?.instability);
      buyEntryItemRows(statsRows, "Optimal charge window", entry?.optimalChargeWindow);
      buyEntryItemRows(statsRows, "Shatter damage", entry?.shatterDamage);
      buyEntryItemRows(statsRows, "Laser power", entry?.laserPower);
      buyEntryItemRows(statsRows, "Tractor power", entry?.tractorPower);
      buyEntryItemRows(statsRows, "Resistance", entry?.resistance);
      buyEntryItemRows(statsRows, "Inert materials", entry?.inertMaterials);
      buyEntryItemRows(statsRows, "Catastrophic charge rate", entry?.catastrophicChargeRate);
      buyEntryItemRows(statsRows, "Optimal charge rate", entry?.optimalChargeRate);
      itemSections.push(buyEntryItemSection("Stats", statsRows));
    } else if (kind === "clothing") {
      const statsRows = [];
      buyEntryItemRows(statsRows, "Volume", entry?.volume);
      itemSections.push(buyEntryItemSection("Stats", statsRows));
    } else {
      const statsRows = [];
      buyEntryItemRows(statsRows, "Volume", entry?.volume);
      itemSections.push(buyEntryItemSection("Stats", statsRows));
    }
  }
  if (itemSections.length) groups.unshift(...itemSections.filter(Boolean));
  return groups;
}

function profileKey(userId) {
  return `${USER_PREFIX}${userId}`;
}

function defaultProfile() {
  return {
    owned: [],
    logs: [],
    view: "dashboard",
    collectionMode: "owned",
    search: "",
    blueprintSearch: "",
    missionSearch: "",
    chip: "All",
    missionFilterType: "All",
    missionFilterPoints: "All",
    missionFilterReputation: "All",
    missionFilterLocation: "All",
    missionFilterDifficulty: "All",
    missionFilterMoney: "All",
    missionType: "",
    company: "",
    mission: "",
    reward: "",
    customReward: "",
    selectedItem: null,
    buyTab: "items",
    buySearch: "",
    buySystem: "All",
    buyOrbit: "All",
    buyArea: "All",
    buyType: "All",
    buySubtype: "All",
    buyItemCategory: "All",
    buyShipCareer: "All",
    buyShipSize: "All",
    buyShipRole: "All",
    buyShipWeapon: "All",
    buyShipComponent: "All",
    buySelectedId: "",
    rail: "dashboard",
    progressFocus: { kind: "", value: "" },
    progressSubtype: "",
    hideUnrankedCompanies: false,
  };
}

function loadUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length) {
      state.users = parsed;
      return;
    }
  } catch {}

  state.users = [{ id: "default", name: "Default" }];
  localStorage.setItem(USERS_KEY, JSON.stringify(state.users));
}

function saveUsers() {
  localStorage.setItem(USERS_KEY, JSON.stringify(state.users));
}

function loadProfile(userId) {
  const raw = localStorage.getItem(profileKey(userId));
  const parsed = raw ? JSON.parse(raw) : defaultProfile();
  state.owned = new Set((parsed.owned || ownedSeed).map(norm));
  state.logs = parsed.logs || [];
  state.view = parsed.view || "dashboard";
  if (state.view === "missions" || state.view === "buy-items") state.view = "dashboard";
  state.collectionMode = parsed.collectionMode || parsed.view || "owned";
  state.search = parsed.search || "";
  state.blueprintSearch = parsed.blueprintSearch || "";
  state.missionSearch = parsed.missionSearch || "";
  state.missionScriptOnly = Boolean(parsed.missionScriptOnly);
  state.missionFilterType = parsed.missionFilterType || "All";
  state.missionFilterPoints = parsed.missionFilterPoints || "All";
  state.missionFilterReputation = parsed.missionFilterReputation || "All";
  state.missionFilterLocation = parsed.missionFilterLocation || "All";
  state.missionFilterDifficulty = parsed.missionFilterDifficulty || "All";
  state.missionFilterMoney = parsed.missionFilterMoney || "All";
  state.chip = parsed.chip || "All";
  state.missionType = parsed.missionType || "";
  state.company = parsed.company || "";
  state.mission = parsed.mission || "";
  state.reward = parsed.reward || "";
  state.customReward = parsed.customReward || "";
  state.selectedItem = null;
  state.buyTab = ["items", "ships", "rentals"].includes(parsed.buyTab) ? parsed.buyTab : "items";
  state.buySearch = parsed.buySearch || "";
  state.buySystem = parsed.buySystem || "All";
  state.buyOrbit = parsed.buyOrbit || "All";
  state.buyArea = parsed.buyArea || "All";
  state.buyType = parsed.buyType || "All";
  state.buySubtype = parsed.buySubtype || "All";
  state.buyItemCategory = parsed.buyItemCategory || "All";
  state.buyShipCareer = parsed.buyShipCareer || "All";
  state.buyShipSize = parsed.buyShipSize || "All";
  state.buyShipRole = parsed.buyShipRole || "All";
  state.buyShipWeapon = parsed.buyShipWeapon || "All";
  state.buyShipComponent = parsed.buyShipComponent || "All";
  state.buySelectedId = parsed.buySelectedId || "";
  state.rail = parsed.rail || "dashboard";
  state.progressFocus = parsed.progressFocus || { kind: "", value: "" };
  state.progressSubtype = parsed.progressSubtype || "";
  state.hideUnrankedCompanies = Boolean(parsed.hideUnrankedCompanies);
}

function saveProfile(userId = state.currentUserId) {
  if (!userId) return;
  localStorage.setItem(
    profileKey(userId),
    JSON.stringify({
      owned: [...state.owned],
      logs: state.logs,
      view: state.view,
      collectionMode: state.collectionMode,
      search: state.search,
      blueprintSearch: state.blueprintSearch,
      missionSearch: state.missionSearch,
      missionScriptOnly: state.missionScriptOnly,
       missionFilterType: state.missionFilterType,
      missionFilterPoints: state.missionFilterPoints,
      missionFilterReputation: state.missionFilterReputation,
      missionFilterLocation: state.missionFilterLocation,
      missionFilterDifficulty: state.missionFilterDifficulty,
      missionFilterMoney: state.missionFilterMoney,
      chip: state.chip,
      missionType: state.missionType,
      company: state.company,
      mission: state.mission,
      reward: state.reward,
      customReward: state.customReward,
      buyTab: state.buyTab,
      buySearch: state.buySearch,
      buySystem: state.buySystem,
      buyOrbit: state.buyOrbit,
      buyArea: state.buyArea,
      buyType: state.buyType,
      buySubtype: state.buySubtype,
      buyShipCareer: state.buyShipCareer,
      buyShipSize: state.buyShipSize,
      buyShipRole: state.buyShipRole,
      buyShipWeapon: state.buyShipWeapon,
      buyShipComponent: state.buyShipComponent,
      buySelectedId: state.buySelectedId,
      rail: state.rail,
      progressFocus: state.progressFocus,
      progressSubtype: state.progressSubtype,
      hideUnrankedCompanies: state.hideUnrankedCompanies,
    }),
  );
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || state.users[0] || null;
}

function applyUserSelection(userId) {
  if (!userId) return;
  if (state.currentUserId) saveProfile(state.currentUserId);
  state.currentUserId = userId;
  loadProfile(userId);
  renderAll();
}

function createUser(name) {
  const nextId = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const nextName = (name || `User ${state.users.length + 1}`).trim();
  state.users.push({ id: nextId, name: nextName || `User ${state.users.length + 1}` });
  saveUsers();
  localStorage.setItem(profileKey(nextId), JSON.stringify(defaultProfile()));
  applyUserSelection(nextId);
}

function promptForUserName() {
  const fallback = `User ${state.users.length + 1}`;
  const name = window.prompt("Name this user:", fallback);
  if (name === null) return null;
  return name.trim() || fallback;
}

function deleteCurrentUser() {
  if (state.users.length <= 1) return;
  const user = currentUser();
  if (!user) return;
  if (!confirm(`Delete ${user.name}?`)) return;

  state.users = state.users.filter((entry) => entry.id !== user.id);
  localStorage.removeItem(profileKey(user.id));
  saveUsers();
  applyUserSelection(state.users[0].id);
}

async function loadBlueprintData() {
  if (window.BLUEPRINT_EXPLORER_DATA) {
    return {
      ...window.BLUEPRINT_EXPLORER_DATA,
      items: syntheticDismantleItems(window.BLUEPRINT_EXPLORER_DATA.items || []),
    };
  }
  const bridgeBlueprints = scminersDbExportRecords("blueprint_catalog.json");
  if (bridgeBlueprints.length) return { items: syntheticDismantleItems(bridgeBlueprints) };
  throw new Error("Local blueprint data was not loaded. Make sure blueprint_explorer_data.js is next to index.html.");
}

function hasBuyDataScriptsLoaded() {
  return Boolean(window.BUY_ITEMS_DATA || window.BUY_ITEMS_DATA_PARTS);
}

function combineBuyDataParts() {
  const parts = window.BUY_ITEMS_DATA_PARTS;
  if (!parts || typeof parts !== "object") return null;
  const merged = { items: [], ships: [], rentals: [] };
  for (const value of Object.values(parts)) {
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value.items)) merged.items.push(...value.items);
    if (Array.isArray(value.ships)) merged.ships.push(...value.ships);
    if (Array.isArray(value.rentals)) merged.rentals.push(...value.rentals);
  }
  if (!merged.items.length && !merged.ships.length && !merged.rentals.length) return null;
  window.BUY_ITEMS_DATA = merged;
  return merged;
}

function ensureBuyDataScriptsLoaded() {
  if (hasBuyDataScriptsLoaded()) return Promise.resolve();
  if (buyDataScriptsLoadPromise) return buyDataScriptsLoadPromise;
  buyDataScriptsLoadPromise = new Promise((resolve, reject) => {
    try {
      if (typeof Worker === "undefined") throw new Error("Worker support unavailable");
      if (buyDataWorker) {
        try {
          buyDataWorker.terminate();
        } catch {
          // ignore
        }
        buyDataWorker = null;
      }

      const workerSource = `
        self.window = self;
        const mergeParts = () => {
          const parts = self.BUY_ITEMS_DATA_PARTS || {};
          const merged = { items: [], ships: [], rentals: [] };
          for (const value of Object.values(parts)) {
            if (!value || typeof value !== "object") continue;
            if (Array.isArray(value.items)) merged.items.push(...value.items);
            if (Array.isArray(value.ships)) merged.ships.push(...value.ships);
            if (Array.isArray(value.rentals)) merged.rentals.push(...value.rentals);
          }
          return merged;
        };
        self.onmessage = async (event) => {
          try {
            const urls = Array.isArray(event?.data?.urls) ? event.data.urls : [];
            for (const src of urls) {
              importScripts(src);
            }
            const data = self.BUY_ITEMS_DATA || mergeParts();
            self.postMessage({ ok: true, data });
          } catch (error) {
            self.postMessage({ ok: false, error: String(error?.message || error) });
          }
        };
      `;
      const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
      buyDataWorker = new Worker(workerUrl);
      URL.revokeObjectURL(workerUrl);
      buyDataWorker.onmessage = (event) => {
        const payload = event?.data || {};
        if (!payload.ok) {
          reject(new Error(payload.error || "Failed to load buy data"));
          return;
        }
        if (payload.data && typeof payload.data === "object") {
          window.BUY_ITEMS_DATA = payload.data;
        }
        if (!window.BUY_ITEMS_DATA && window.BUY_ITEMS_DATA_PARTS) {
          combineBuyDataParts();
        }
        resolve();
      };
      buyDataWorker.onerror = (error) => {
        reject(new Error(error?.message || "Failed to load buy data"));
      };
      buyDataWorker.postMessage({ urls: BUY_DATA_SCRIPT_URLS.map((src) => new URL(src, window.location.href).href) });
    } catch (error) {
      reject(error);
    }
  }).finally(() => {
    if (buyDataWorker) {
      try {
        buyDataWorker.terminate();
      } catch {
        // ignore
      }
      buyDataWorker = null;
    }
    buyDataScriptsLoadPromise = null;
  });
  return buyDataScriptsLoadPromise;
}

async function bootstrapDataPipeline({ render = true } = {}) {
  state.buyDataStatus = "Loading buy data...";
  const buyData = await loadBuyData({ render });
  state.buyData = {
    items: Array.isArray(buyData?.items) ? buyData.items : [],
    ships: Array.isArray(buyData?.ships) ? buyData.ships : [],
    rentals: Array.isArray(buyData?.rentals) ? buyData.rentals : [],
  };
  window.shipByName = new Map(state.buyData.ships.map((entry) => [norm(entry?.name), entry]));
  if (render && typeof renderAll === "function") renderAll();
  return state.buyData;
}

function hasBuyDataLoaded() {
  return Boolean(state.buyData && (Array.isArray(state.buyData.items) || Array.isArray(state.buyData.ships) || Array.isArray(state.buyData.rentals)));
}

function ensureBuyDataReady({ render = true } = {}) {
  if (hasBuyDataLoaded()) return Promise.resolve(state.buyData);
  if (buyDataLoadPromise) return buyDataLoadPromise;
  buyDataLoadPromise = bootstrapDataPipeline({ render }).finally(() => {
    buyDataLoadPromise = null;
  });
  return buyDataLoadPromise;
}

async function bootstrapAppData() {
  await yieldToMainThread();
  const blueprintData = await loadBlueprintData();
  state.data = blueprintData;
  state.appReady = true;
  renderAll();
}

function structuredExportRecords(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(Boolean);
  if (Array.isArray(payload.records)) return payload.records.filter(Boolean);
  if (Array.isArray(payload.items)) return payload.items.filter(Boolean);
  if (Array.isArray(payload.data)) return payload.data.filter(Boolean);
  if (Array.isArray(payload.results)) return payload.results.filter(Boolean);
  if (Array.isArray(payload.exports)) return payload.exports.filter(Boolean);
  return [];
}

function scminersDbFileNameKey(fileName) {
  return String(fileName || "").trim();
}

function bundledDismantleReturnsPayload() {
  return Array.isArray(window.SCMINERSDB_DISMANTLE_RETURNS) ? window.SCMINERSDB_DISMANTLE_RETURNS : [];
}

function scminersDbExportRecords(fileName) {
  const key = scminersDbFileNameKey(fileName);
  if (!key) return [];
  const bundled = state.scminersDb?.source === "bundled" || currentScminersDbManifestUrl().startsWith("bundled://");
  const legacyKey = cleanDisplayText(key);
  const payload =
    state.scminersDb?.exports?.[key] ||
    state.scminersDb?.exports?.[key.replace(/\.json$/i, "")] ||
    state.scminersDb?.exports?.[legacyKey] ||
    state.scminersDb?.exports?.[legacyKey.replace(/\.json$/i, "")] ||
    null;
  if (!payload && state.scminersDb?.available && !bundled) void loadScminersDbExport(key);
  return structuredExportRecords(payload);
}

function scminersDbExportFileName(fileName) {
  const key = scminersDbFileNameKey(fileName);
  if (!key) return "";
  return key.toLowerCase().endsWith(".json") ? key : `${key}.json`;
}

function scminersDbExportUrl(fileName) {
  const key = scminersDbExportFileName(fileName);
  if (!key) return "";
  const manifestUrl = currentScminersDbManifestUrl();
  const fileIndex = state.scminersDb?.fileIndex || {};
  if (manifestUrl.includes("/api/scminersdb/manifest")) {
    return `/api/scminersdb/json/${encodeURIComponent(key)}`;
  }
  return fileIndex[key] || fileIndex[key.toLowerCase()] || resolveScminersDbAssetUrl(manifestUrl, `../json/${key}`);
}

function scminersDbManifestEntries(manifest) {
  if (!manifest || typeof manifest !== "object") return [];
  if (Array.isArray(manifest.exports)) return manifest.exports.filter(Boolean);
  if (Array.isArray(manifest.files)) return manifest.files.filter(Boolean);
  return [];
}

async function loadScminersDbExport(fileName) {
  const normalized = scminersDbExportFileName(fileName);
  if (!normalized || typeof fetch !== "function") return null;
  if (state.scminersDb?.source === "bundled" || currentScminersDbManifestUrl().startsWith("bundled://")) {
    return (
      state.scminersDb?.exports?.[normalized] ||
      state.scminersDb?.exports?.[normalized.replace(/\.json$/i, "")] ||
      null
    );
  }
  if (state.scminersDb?.exports?.[normalized]) return state.scminersDb.exports[normalized];
  if (state.scminersDbExportPromises?.has(normalized)) return state.scminersDbExportPromises.get(normalized);
  if (!state.scminersDbExportPromises) state.scminersDbExportPromises = new Map();
  const promise = fetchJson(scminersDbExportUrl(normalized))
    .then((payload) => {
      if (!state.scminersDb) state.scminersDb = { available: true, manifestUrl: currentScminersDbManifestUrl(), exports: {}, files: [], fileIndex: {}, status: "" };
      if (!state.scminersDb.exports) state.scminersDb.exports = {};
      state.scminersDb.exports[normalized] = payload;
      return payload;
    })
    .catch((error) => ({
      error: cleanDisplayText(error?.message || error),
    }))
    .finally(() => {
      state.scminersDbExportPromises?.delete(normalized);
    });
  state.scminersDbExportPromises.set(normalized, promise);
  return promise;
}

function summarizeScminersDbManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return "";
  const parts = [];
  const status = cleanDisplayText(manifest.status || "");
  const count = Number(manifest.json_count || 0);
  const source = cleanDisplayText(manifest.source_root || "");
  const output = cleanDisplayText(manifest.output_root || "");
  if (status) parts.push(status);
  if (count) parts.push(`${formatCount(count)} exports`);
  if (source) parts.push(`source ${source}`);
  if (output) parts.push(`data ${output}`);
  return parts.join(" · ");
}

async function loadScminersDbBridge() {
  if (bundledScminersDbPayload() && state.scminersDb?.source === "bundled") return state.scminersDb;
  if (typeof fetch !== "function") return null;
  try {
    const sources = [currentScminersDbManifestUrl(), "/api/scminersdb/manifest"];
    let manifest = null;
    let manifestUrl = "";
    let lastError = null;
    for (const source of sources) {
      try {
        manifest = await fetchJson(source);
        manifestUrl = source;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!manifest) throw lastError || new Error("SCMinersDB manifest not available");

    const isLegacyApiManifest = manifestUrl.includes("/api/scminersdb/manifest");
    let files = scminersDbManifestEntries(manifest).map((entry) => {
      const file = scminersDbExportFileName(entry?.file || entry?.name || entry?.category || entry?.path || entry?.url);
      return {
        ...entry,
        file,
        url: isLegacyApiManifest
          ? `/api/scminersdb/json/${encodeURIComponent(file)}`
          : resolveScminersDbAssetUrl(manifestUrl, entry?.url || entry?.path || `../json/${file}`),
      };
    }).filter((entry) => entry.file);

    if (!files.length && isLegacyApiManifest) {
      try {
        const legacyFilesPayload = await fetchJson("/api/scminersdb/files");
        const legacyFiles = Array.isArray(legacyFilesPayload?.files) ? legacyFilesPayload.files : [];
        files = legacyFiles.map((entry) => {
          const file = scminersDbExportFileName(entry?.name || entry?.file || entry?.path || entry?.url);
          return {
            ...entry,
            file,
            url: `/api/scminersdb/json/${encodeURIComponent(file)}`,
          };
        }).filter((entry) => entry.file);
      } catch {
        // keep going with whatever the manifest provided
      }
    }

    const exportsByFile = {};
    const fileIndex = {};
    for (const file of files) {
      fileIndex[file.file] = file.url;
      fileIndex[file.file.toLowerCase()] = file.url;
      fileIndex[cleanDisplayText(file.file).toLowerCase()] = file.url;
      if (file.category) fileIndex[cleanDisplayText(file.category).toLowerCase()] = file.url;
    }
    const existingExports = state.scminersDb?.exports || {};
    state.scminersDb = {
      available: true,
      manifestUrl,
      manifest,
      files,
      exports: existingExports,
      fileIndex,
      signature: "",
      status: "Loading SCMinersDB exports...",
      lastLoaded: new Date().toISOString(),
    };
    window.SC_MINERS_DB = state.scminersDb;
    if (window.SC_ITEMS_API) window.SC_ITEMS_API.scminersDb = state.scminersDb;
    const jsonFiles = files.map((file) => file.file).filter((name) => name && name.toLowerCase().endsWith(".json"));
    const loadedExports = await Promise.all(jsonFiles.map(async (name) => [name, await loadScminersDbExport(name)]));
    for (const [name, payload] of loadedExports) {
      exportsByFile[name] = payload;
    }
    const signature = files.map((file) => `${file.file}:${file.record_count || file.size || ""}`).join("|");
    const previousSignature = state.scminersDb?.signature || "";
    const changed = signature !== previousSignature;
    state.scminersDb = {
      available: true,
      manifestUrl,
      manifest,
      files,
      exports: { ...existingExports, ...exportsByFile },
      fileIndex,
      signature,
      status: summarizeScminersDbManifest(manifest) || `Loaded ${formatCount(files.length)} export files`,
      lastLoaded: new Date().toISOString(),
    };
    window.SC_MINERS_DB = state.scminersDb;
    if (window.SC_ITEMS_API) window.SC_ITEMS_API.scminersDb = state.scminersDb;
    if (state.appReady && changed) {
      try {
        state.data = await loadBlueprintData();
        state.buyData = await loadBuyData();
        renderAll();
      } catch (error) {
        console.warn("SCMinersDB sync refresh skipped:", error);
      }
    }
    return state.scminersDb;
  } catch (error) {
    if (bundledScminersDbPayload()) {
      const bundled = useBundledScminersDbData();
      if (bundled) return bundled;
    }
    state.scminersDb = {
      available: false,
      manifestUrl: currentScminersDbManifestUrl(),
      files: [],
      exports: {},
      fileIndex: {},
      status: `SCMinersDB bridge unavailable: ${cleanDisplayText(error?.message || error)}`,
    };
    window.SC_MINERS_DB = state.scminersDb;
    if (window.SC_ITEMS_API) window.SC_ITEMS_API.scminersDb = state.scminersDb;
    return null;
  }
}

async function updateScminersDb() {
  if (typeof fetch !== "function") return null;
  const button = els.updateInfo;
  const originalText = button?.textContent || "Update Info";
  if (button) {
    button.disabled = true;
    button.textContent = "Updating...";
  }
  try {
    await loadScminersDbBridge();
    state.data = await loadBlueprintData();
    state.buyData = await loadBuyData();
    renderAll();
    return state.scminersDb;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function scminersDbCategoryBaseKey(category = state.scminersDbCategory) {
  const value = cleanDisplayText(category || "");
  if (!value) return "";
  return value.toLowerCase().endsWith(".json") ? value.replace(/\.json$/i, "") : value;
}

function scminersDbCategoryFileKey(category = state.scminersDbCategory) {
  const value = scminersDbCategoryBaseKey(category);
  if (!value) return "";
  return `${value}.json`;
}

function scminersDbCategoryEntries(category = state.scminersDbCategory) {
  const key = scminersDbCategoryFileKey(category);
  const payload = state.scminersDb?.exports?.[key] || state.scminersDb?.exports?.[category] || null;
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(Boolean);
  if (Array.isArray(payload.records)) return payload.records.filter(Boolean);
  if (Array.isArray(payload.items)) return payload.items.filter(Boolean);
  if (Array.isArray(payload.data)) return payload.data.filter(Boolean);
  return [];
}

function scminersDbCategoryLabel(category) {
  const value = scminersDbCategoryBaseKey(category);
  if (!value) return "";
  if (value.toLowerCase() === "$templates") return "Templates";
  if (/^\d+[a-z]$/i.test(value)) return `${value.slice(0, -1)}${value.slice(-1).toUpperCase()}`;
  return titleCaseLabel(value.replace(/[_-]+/g, " "));
}

function scminersDbManifestCategoryCounts() {
  const counts = state.scminersDb?.manifest?.category_counts;
  if (!counts || typeof counts !== "object") return new Map();
  return new Map(
    Object.entries(counts).map(([key, value]) => [scminersDbCategoryBaseKey(key), Number(value) || 0]),
  );
}

function scminersDbCategoryCount(category = state.scminersDbCategory) {
  const key = scminersDbCategoryBaseKey(category);
  if (!key) return 0;
  const manifestCount = scminersDbManifestCategoryCounts().get(key);
  if (Number.isFinite(manifestCount)) return manifestCount;
  return scminersDbCategoryEntries(key).length;
}

function scminersDbCategories() {
  const manifestCounts = scminersDbManifestCategoryCounts();
  const exportsByFile = state.scminersDb?.exports || {};
  const availableKeys = new Set(
    Object.keys(exportsByFile)
      .map((name) => scminersDbCategoryBaseKey(name))
      .filter(Boolean),
  );
  const orderedKeys = [];
  for (const key of manifestCounts.keys()) {
    if (availableKeys.has(key)) orderedKeys.push(key);
  }
  for (const key of availableKeys) {
    if (!manifestCounts.has(key)) orderedKeys.push(key);
  }
  return orderedKeys
    .map((key) => ({
      key,
      label: scminersDbCategoryLabel(key),
      count: scminersDbCategoryCount(key),
    }))
    .filter((entry) => entry.key && entry.label);
}

function scminersDbEntryTitle(entry) {
  return cleanDisplayText(entry?.source_id || entry?.name || entry?.raw_json?._RecordName_ || "Record");
}

function scminersDbEntryType(entry) {
  return cleanDisplayText(entry?.raw_json?._RecordValue_?._Type_ || entry?.raw_json?._RecordName_ || entry?.category || "");
}

function scminersDbEntrySummary(entry) {
  const raw = entry?.raw_json?._RecordValue_ || {};
  const summaryBits = [];
  if (raw.Category) summaryBits.push(cleanDisplayText(raw.Category));
  if (raw.Icon) summaryBits.push(cleanDisplayText(raw.Icon));
  if (entry?.category) summaryBits.push(cleanDisplayText(entry.category));
  return summaryBits.filter(Boolean).join(" · ");
}

function scheduleScminersDbRefresh() {
  if (bundledScminersDbPayload()) return;
  if (state.scminersDbRefreshTimer) clearInterval(state.scminersDbRefreshTimer);
  state.scminersDbRefreshTimer = setInterval(() => {
    void loadScminersDbBridge();
  }, 30000);
}

async function loadBuyData({ render = true } = {}) {
  await ensureBuyDataScriptsLoaded();
  const baseData = window.BUY_ITEMS_DATA || { items: [], ships: [], rentals: [] };
  const baseItems = Array.isArray(baseData.items) ? baseData.items : [];
  const baseShips = Array.isArray(baseData.ships) ? baseData.ships : [];
  const baseRentals = Array.isArray(baseData.rentals) ? baseData.rentals : [];
  if (baseItems.length || baseShips.length || baseRentals.length) {
    const directData = {
      items: baseItems,
      ships: baseShips,
      rentals: baseRentals,
    };
    state.buyData = directData;
    state.buyDataStatus = `Loaded ${formatCount(baseItems.length + baseShips.length + baseRentals.length)} buy records`;
    window.shipByName = new Map(baseShips.map((entry) => [norm(entry?.name), entry]));
    if (render && state.appReady && typeof renderAll === "function") renderAll();
    return directData;
  }

  const partsData = window.BUY_ITEMS_DATA_PARTS || {};
  const bridgeItems = scminersDbExportRecords("item_catalog.json");
  const bridgeShips = scminersDbExportRecords("ship_catalog.json");
  const bridgeRentals = scminersDbExportRecords("rentals.json");

  const updateProgress = (done, total) => {
    state.buyDataStatus = total ? `Loading buy data ${formatCount(done)} / ${formatCount(total)}...` : "Loading buy data...";
    if (render) scheduleBuyLoadingRender();
  };

  const normalizeDataset = async (source, mapper = normalizeRecord) => {
    const normalized = await chunkMap(source, mapper, {
      batchSize: BUY_DATA_BATCH_SIZE,
      onProgress: updateProgress,
    });
    return normalized.filter((entry) => !isMalformedBuyEntry(entry));
  };

  const itemsMerged = await mergeByKeyAsync([baseData.items || [], partsData.items?.items || [], bridgeItems], {
    batchSize: BUY_DATA_BATCH_SIZE,
    onProgress: updateProgress,
  });
  const shipsMerged = await mergeByKeyAsync([baseData.ships || [], partsData.ships?.ships || [], bridgeShips], {
    batchSize: BUY_DATA_BATCH_SIZE,
    onProgress: updateProgress,
  });
  const rentalsMerged = await mergeByKeyAsync([baseData.rentals || [], partsData.rentals?.rentals || [], bridgeRentals], {
    batchSize: BUY_DATA_BATCH_SIZE,
    onProgress: updateProgress,
  });

  const items = syntheticDismantleItems(await normalizeDataset(itemsMerged));
  const ships = await normalizeDataset(shipsMerged);
  const shipByName = new Map(ships.map((entry) => [norm(entry?.name), entry]));
  window.shipByName = shipByName;

  const rentals = await normalizeDataset(rentalsMerged, (entry) => {
    const ship = shipByName.get(norm(entry?.name));
    return ship ? normalizeRecord(mergeRecord(ship, entry)) : normalizeRecord(entry);
  });

  const processedData = { items, ships, rentals };
  state.buyData = processedData;
  state.buyDataStatus = `Loaded ${formatCount(items.length + ships.length + rentals.length)} buy records`;
  if (buyDataProgressRenderTimer) {
    clearTimeout(buyDataProgressRenderTimer);
    buyDataProgressRenderTimer = null;
  }
  if (render && state.appReady && typeof renderAll === "function") renderAll();
  return processedData;
}

function buyEntriesForTab(tab = state.buyTab) {
  const data = state.buyData || {};
  return Array.isArray(data?.[tab]) ? data[tab] : [];
}

function buyEntryName(entry, tab = state.buyTab) {
  return entry?.name || entry?.ship || entry?.title || `${tab || "item"}`;
}

function buyEntryManufacturer(entry) {
  return entry?.manufacturer || entry?.maker || "";
}

function buyEntryStatus(entry) {
  return cleanDisplayText(entry?.status || entry?.state || entry?.availability || "");
}

function isConceptShipStatus(value) {
  return /concept|greybox|pre-?production|prototype/i.test(cleanDisplayText(value));
}

function isShipCareerLabel(value) {
  return SHIP_CAREER_LABELS.has(norm(value));
}

function buyEntryShipCareer(entry) {
  return titleCaseLabel(entry?.career || entry?.careerRole || entry?.careerType || "");
}

function splitLabelValues(value) {
  const values = [];
  const push = (part) => {
    const normalized = normalizeShipRoleLabel(part);
    if (!normalized || isBadLabel(normalized)) return;
    values.push(normalized);
  };
  String(value || "")
    .split(/\/|&|,/)
    .map((part) => titleCaseLabel(part))
    .forEach((part) => push(part));
  return [...new Set(values)];
}

function buyEntryShipRoles(entry) {
  return splitLabelValues(entry?.role || entry?.shipRole || entry?.roleType || "");
}

function buyEntryShipRole(entry) {
  return buyEntryShipRoles(entry)[0] || "";
}

function buyEntryShipSize(entry) {
  const text = String(entry?.size || "").trim();
  const match = text.match(/^(Small|Medium|Large|Capital|Snub)\b/i);
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : "";
}

function titleCaseLabel(value) {
  const text = cleanDisplayText(value);
  if (!text) return "";
  return text
    .split("/")
    .map((part) =>
      part
        .trim()
        .replace(/(^|[^a-z0-9]+)([a-z0-9])/gi, (_, prefix, char) => `${prefix}${char.toUpperCase()}`)
    )
    .join(" / ");
}

const SHIP_CAREER_LABELS = new Set([
  "combat",
  "competition",
  "exploration",
  "ground",
  "industrial",
  "multi-role",
  "support",
  "transport",
]);

function normalizeShipRoleLabel(value) {
  let text = titleCaseLabel(value);
  if (!text) return "";
  const lowered = norm(text);
  if (isShipCareerLabel(lowered)) return "";
  text = text.replace(/^(Light|Medium|Heavy|Starter|Snub|Capital)\s+/i, "");
  if (!text) return "";
  if (/^(cargo|freight)$/i.test(text) || /\b(cargo|freight)\b/i.test(text)) return "Cargo / Freight";
  if (/^(combat|competition|exploration|ground|industrial|multi-role|support|transport)(\s+and\s+(combat|competition|exploration|ground|industrial|multi-role|support|transport))?$/i.test(text)) return "";
  return titleCaseLabel(text);
}

function buyEntryType(entry, tab = state.buyTab) {
  if (!entry) return "unknown";
  if (tab === "items") return entry.type || "unknown";
  if (tab === "ships" || tab === "rentals") return buyEntryShipCareer(entry) || "unknown";
  return buyEntryManufacturer(entry) || "unknown";
}

function buyEntrySubtype(entry, tab = state.buyTab) {
  if (!entry) return "unknown";
  if (tab === "items") return entry.subtype || "unknown";
  if (tab === "ships" || tab === "rentals") return buyEntryShipRole(entry) || "";
  return entry.role || "unknown";
}

function buyEntryOffers(entry) {
  return Array.isArray(entry?.offers) ? entry.offers : [];
}

function offerOrbit(offer) {
  const fields = buyOfferFields(offer);
  const orbit = cleanDisplayText(
    fields?.orbit ||
      offer?.orbit ||
      offer?.planet ||
      offer?.body ||
      orbitFromArea(offerSystem(offer), offerArea(offer)) ||
      cleanDisplayText(window.SC_ITEMS_API?.resolveOrbit?.(offer) || "") ||
      "",
  );
  return orbit && norm(orbit) !== "other" ? orbit : "";
}

function buyEntryPriceRange(entry, tab = state.buyTab) {
  if (!entry) return "Unknown";
  if (tab === "items") {
    if (Number(entry.sold) === 0) return "Not purchasable";
    const prices = buyEntryOffers(entry).map((offer) => Number(offer.price)).filter((value) => Number.isFinite(value));
    if (!prices.length) return "Not purchasable";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `${formatCount(min)} aUEC` : `${formatCount(min)} - ${formatCount(max)} aUEC`;
  }
  if (tab === "ships") return isConceptShipStatus(buyEntryStatus(entry)) ? "Concept" : `${formatCount(Number(entry.basePrice || 0))} aUEC`;
  if (tab === "rentals") {
    const prices = entry.prices || {};
    const oneDay = Number(prices.oneDay || prices["1 Day"] || 0);
    const threeDays = Number(prices.threeDays || prices["3 Days"] || 0);
    const sevenDays = Number(prices.sevenDays || prices["7 Days"] || 0);
    return [oneDay, threeDays, sevenDays].some(Number.isFinite)
      ? `${formatCount(oneDay || 0)} / ${formatCount(threeDays || 0)} / ${formatCount(sevenDays || 0)} aUEC`
      : "Unknown";
  }
  return "Unknown";
}

function buyEntrySize(entry, tab = state.buyTab) {
  if (!entry || (tab !== "ships" && tab !== "rentals")) return "";
  return buyEntryShipSize(entry);
}

function buyEntryItemKind(entry) {
  const text = `${cleanDisplayText(entry?.name)} ${cleanDisplayText(entry?.type)} ${cleanDisplayText(entry?.subtype)}`.toLowerCase();
  if (/weapon|gun|missile|torpedo|bomb|blade|pistol|rifle|shotgun|smg|carbine|lmg|cannon|repeater|gatling|launcher|sniper/.test(text)) return "weapon";
  if (/armor|undersuit|helmet|backpack|arms|legs|core|torso|boots|shoes|footwear|harness|suit/.test(text)) return "armor";
  if (/food|drink|consumable|swim|snack|meal|water|beverage/.test(text)) return "consumable";
  if (/utility|module|tool|beam|laser|tractor|salvage|scraper|mining/.test(text)) return "utility";
  if (/clothing|shirt|pants|jacket|shoes|boots|hat|gloves|livery/.test(text)) return "clothing";
  return "misc";
}

function buyEntryItemRows(rows, label, value) {
  const text = cleanDisplayText(value);
  if (isMissingDisplayText(text)) return;
  rows.push({ label, value: text });
}

function buyEntryItemSection(label, rows) {
  const list = Array.isArray(rows) ? rows.filter((row) => row && row.label) : [];
  return list.length ? { label, rows: list } : null;
}

const ITEM_DETAIL_SKIP_LABELS = new Set([
  "name",
  "type",
  "class",
  "price",
  "price range",
  "location",
  "locations",
  "offer",
  "offers",
  "availability",
]);

const ITEM_DETAIL_SKIP_SECTIONS = new Set([
  "metadata",
  "external sites",
]);

const liveWikiItemSectionCache = new Map();
const liveWikiItemSectionPending = new Set();

function buyEntryItemWikiSections(entry) {
  const sections = Array.isArray(entry?.pageSections) ? entry.pageSections : [];
  if (!sections.length) return [];
  const groups = [];
  const seen = new Set();
  for (const section of sections) {
    const sectionTitle = cleanDisplayText(section?.title) || "Info";
    const normalizedSectionTitle = sectionTitle.toLowerCase().replace(/\s+/g, " ").trim();
    if (ITEM_DETAIL_SKIP_SECTIONS.has(normalizedSectionTitle)) continue;
    const rows = [];
    for (const row of Array.isArray(section?.rows) ? section.rows : []) {
      const labelText = cleanDisplayText(row?.label);
      const valueText = cleanDisplayText(row?.value);
      if (!labelText || isMissingDisplayText(valueText)) continue;
      const normalizedLabel = labelText.toLowerCase().replace(/\s+/g, " ").trim();
      if (ITEM_DETAIL_SKIP_LABELS.has(normalizedLabel)) continue;
      if (normalizedLabel === "manufacturer" && cleanDisplayText(entry?.manufacturer)) continue;
      const key = `${normalizedLabel}::${valueText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ label: labelText, value: valueText });
    }
    if (rows.length) {
      groups.push({
        label: sectionTitle,
        rows,
      });
    }
  }
  return groups;
}

function buyEntryMetadataValue(entry, label) {
  const target = norm(label);
  if (!target) return "";
  for (const section of Array.isArray(entry?.pageSections) ? entry.pageSections : []) {
    for (const row of Array.isArray(section?.rows) ? section.rows : []) {
      if (norm(row?.label) !== target) continue;
      return cleanDisplayText(row?.value);
    }
  }
  return "";
}

function wikiItemSlug(name) {
  return cleanDisplayText(name)
    .replace(/\s+/g, "_")
    .replace(/\//g, "_")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, "_");
}

function wikiItemSearchCandidates(name) {
  const text = cleanDisplayText(name);
  if (!text) return [];
  const candidates = [text];
  const compact = text
    .replace(/^item[_\s-]*name[_\s-]*/i, "")
    .replace(/^item[_\s-]*/i, "")
    .replace(/^name[_\s-]*/i, "")
    .replace(/\b[A-Z]{2,}[_\s-]+\d+[A-Z0-9-]*\b/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (compact && compact !== text) candidates.push(compact);
  const lastToken = text.split(/[_\s-]+/).filter(Boolean).pop();
  if (lastToken && !candidates.includes(lastToken)) candidates.push(lastToken);
  return [...new Set(candidates)];
}

async function resolveWikiItemTitle(name) {
  for (const candidate of wikiItemSearchCandidates(name)) {
    try {
      const exactUrl = `https://starcitizen.tools/api.php?action=query&titles=${encodeURIComponent(candidate)}&redirects=1&format=json&origin=*`;
      const exactResponse = await fetch(exactUrl);
      if (exactResponse.ok) {
        const exactPayload = await exactResponse.json();
        const exactPages = Object.values(exactPayload?.query?.pages || {});
        const exactTitle = cleanDisplayText(exactPages[0]?.title || "");
        if (exactTitle && !exactPages[0]?.missing) return exactTitle;
      }

      const url = `https://starcitizen.tools/api.php?action=query&list=search&srsearch=${encodeURIComponent(candidate)}&srlimit=5&format=json&origin=*`;
      const response = await fetch(url);
      if (!response.ok) continue;
      const payload = await response.json();
      const results = Array.isArray(payload?.query?.search) ? payload.query.search : [];
      for (const result of results) {
        const title = cleanDisplayText(result?.title || "");
        if (title) return title;
      }
    } catch {
      continue;
    }
  }
  return "";
}

async function fetchWikiItemHtmlByTitle(title) {
  const apiUrl = `https://starcitizen.tools/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json&origin=*`;
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const html = String(payload?.parse?.text || "");
  if (!html) throw new Error("Missing parsed HTML");
  return html;
}

function parseWikiItemSectionsFromDocument(doc) {
  const sections = [];
  const sectionNodes = [...doc.querySelectorAll("details.t-infobox-collapsible.t-infobox-section")];
  for (const sectionNode of sectionNodes) {
    const title = cleanDisplayText(sectionNode.querySelector(".t-infobox-section-label")?.textContent || "");
    const normalizedTitle = title.toLowerCase().replace(/\s+/g, " ").trim();
    if (ITEM_DETAIL_SKIP_SECTIONS.has(normalizedTitle)) continue;
    const labels = [...sectionNode.querySelectorAll("dt.t-infobox-item-label")];
    const values = [...sectionNode.querySelectorAll("dd.t-infobox-item-content")];
    const rows = [];
    const limit = Math.min(labels.length, values.length);
    for (let i = 0; i < limit; i++) {
      const label = cleanDisplayText(labels[i]?.textContent || "");
      const value = cleanDisplayText(values[i]?.textContent || "");
      if (!label || isMissingDisplayText(value)) continue;
      rows.push({ label, value });
    }
    if (rows.length) sections.push({ title: title || "Info", rows });
  }
  if (sections.length) return sections;

  const fallbackRows = [];
  const labels = [...doc.querySelectorAll("div.infobox__label")];
  const values = [...doc.querySelectorAll("div.infobox__data")];
  const limit = Math.min(labels.length, values.length);
  for (let i = 0; i < limit; i++) {
    const label = cleanDisplayText(labels[i]?.textContent || "");
    const value = cleanDisplayText(values[i]?.textContent || "");
    if (!label || isMissingDisplayText(value)) continue;
    fallbackRows.push({ label, value });
  }
  if (fallbackRows.length) sections.push({ title: "General", rows: fallbackRows });
  return sections;
}

async function loadLiveItemWikiSections(entry) {
  const name = buyEntryName(entry);
  const cacheKey = String(entry?.id || name || "");
  if (!name || liveWikiItemSectionCache.has(cacheKey)) return liveWikiItemSectionCache.get(cacheKey) || [];
  if (liveWikiItemSectionPending.has(cacheKey)) return [];
  liveWikiItemSectionPending.add(cacheKey);
  try {
    let html = "";
    const resolvedTitle = await resolveWikiItemTitle(name);
    if (resolvedTitle) {
      html = await fetchWikiItemHtmlByTitle(resolvedTitle);
    } else {
      const slug = wikiItemSlug(name);
      const response = await fetch(`https://starcitizen.tools/${encodeURIComponent(slug)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    const sections = parseWikiItemSectionsFromDocument(doc);
    liveWikiItemSectionCache.set(cacheKey, sections);
    if (sections.length) {
      entry.pageSections = sections;
      renderBuy();
    }
    return sections;
  } catch (error) {
    return [];
  } finally {
    liveWikiItemSectionPending.delete(cacheKey);
  }
}

function ensureLiveItemWikiSections(entry) {
  const name = buyEntryName(entry);
  const cacheKey = String(entry?.id || name || "");
  if (!name || liveWikiItemSectionCache.has(cacheKey) || liveWikiItemSectionPending.has(cacheKey)) return;
  void loadLiveItemWikiSections(entry);
}

function offerSystem(offer) {
  const system = cleanDisplayText(String(offer?.system || "").trim().split(/\s*>\s*/)[0] || "");
  if (["Nyx", "Pyro", "Stanton"].includes(system)) return system;
  return "";
}

function offerArea(offer) {
  return cleanDisplayText(offer?.area || "");
}

function offerLocationName(offer) {
  return cleanDisplayText(offer?.locationName || offer?.locationLabel || offer?.location || "");
}

function offerLocationPath(offer) {
  return cleanDisplayText(offer?.locationPath || offer?.locationLabel || offer?.location || "");
}

function buyOfferIsRental(offer) {
  const text = [offerLocationName(offer), offerLocationPath(offer), offerArea(offer), offer?.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\brental(s)?\b/.test(text);
}

function buyOfferAllowedForTab(offer, tab = state.buyTab) {
  if (!offer) return false;
  if (tab === "rentals") return true;
  return !buyOfferIsRental(offer);
}

function buyOfferDisplayLocation(offer) {
  const fields = buyOfferFields(offer);
  const path = cleanDisplayText(fields?.locationPath || offerLocationPath(offer));
  const name = cleanDisplayText(fields?.locationName || offerLocationName(offer));
  if (path && name && norm(path) !== norm(name)) return path;
  return path || name || cleanDisplayText(fields?.area || offerArea(offer)) || "";
}

function isKnownBuyOrbit(value) {
  const label = norm(value);
  if (!label) return false;
  return BUY_KNOWN_ORBITS.some((entry) => norm(entry) === label);
}

function isKnownBuyArea(value) {
  const label = norm(value);
  if (!label) return false;
  return BUY_KNOWN_AREAS.some((entry) => norm(entry) === label);
}

function isKnownBuyLocation(value) {
  const label = norm(value);
  if (!label) return false;
  return BUY_LOCATION_LABELS.some((entry) => label.includes(entry));
}

function buyOfferMatches(offer, system, orbit, location, tab = state.buyTab) {
  if (!offer) return false;
  if (!buyOfferAllowedForTab(offer, tab)) return false;
  const fields = buyOfferFields(offer);
  if (system !== "All" && (fields?.system || offerSystem(offer)) !== system) return false;
  if (orbit !== "All" && (fields?.orbit || offerOrbit(offer)) !== orbit) return false;
  if (location !== "All") {
    const selected = norm(location);
    const candidates = [
      fields?.locationName || offerLocationName(offer),
      fields?.locationPath || offerLocationPath(offer),
      fields?.area || offerArea(offer),
      offer?.location,
      offer?.locationPath,
      offer?.locationLabel,
      offer?.locationName,
    ]
      .map(norm)
      .filter(Boolean);
    if (!candidates.some((value) => value === selected || value.includes(selected) || selected.includes(value))) return false;
  }
  return true;
}

function filteredBuyOffers(entry, system = state.buySystem, orbit = state.buyOrbit, location = state.buyArea, tab = state.buyTab) {
  return buyEntryOffers(entry).filter((offer) => buyOfferMatches(offer, system, orbit, location, tab));
}

function buySystems() {
  return ["All", "Nyx", "Pyro", "Stanton"];
}

function buyOrbits(system = state.buySystem, tab = state.buyTab) {
  const values = new Set();
  for (const entry of buyEntriesForTab()) {
    for (const offer of buyEntryOffers(entry)) {
      if (!buyOfferAllowedForTab(offer, tab)) continue;
      const fields = buyOfferFields(offer);
      if (system !== "All" && (fields?.system || offerSystem(offer)) !== system) continue;
      const value = fields?.orbit || offerOrbit(offer);
      if (value && norm(value) !== "other") values.add(value);
    }
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyAreas(system = state.buySystem, orbit = state.buyOrbit, tab = state.buyTab) {
  const values = new Set();
  for (const entry of buyEntriesForTab()) {
    for (const offer of buyEntryOffers(entry)) {
      if (!buyOfferAllowedForTab(offer, tab)) continue;
      const fields = buyOfferFields(offer);
      if (system !== "All" && (fields?.system || offerSystem(offer)) !== system) continue;
      if (orbit !== "All" && (fields?.orbit || offerOrbit(offer)) !== orbit) continue;
      const label =
        cleanDisplayText(
          fields?.locationPath ||
            buyOfferDisplayLocation(offer) ||
            lastMeaningfulShop(splitBuySegments(offerLocationPath(offer))) ||
            fields?.area ||
            offerArea(offer) ||
            "",
        );
      if (!label || norm(label) === "other") continue;
      values.add(label);
    }
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyIsAreaLabel(value) {
  const label = norm(value);
  if (!label || label === 'all') return false;
  return [
    'area 18',
    'area18',
    'baijini point',
    'checkmate',
    "dudley & daughters",
    'endgame',
    'everus harbor',
    'gaslight',
    'grim hex',
    'hurston',
    'hur-l1',
    'hur-l2',
    'hur-l5',
    'levski',
    'lorville',
    'microtech',
    'new babbage',
    'nyx gateway',
    'orbituary',
    'orison',
    'port tressler',
    'pyro gateway',
    'pyro v',
    'pyr2-l4',
    'pyr3-l1',
    'pyr3-l3',
    'pyr5-l2',
    'pyr5-l4',
    'pyr5-l5',
    'pyr6-l3',
    'pyr6-l4',
    'pyr6-l5',
    "rat's nest",
    'ruin station',
    'seraphim station',
    'stanton gateway',
    'starlight service station',
    'teasa spaceport',
    'the commons',
  ].includes(label);
}

function buyLocations(system = state.buySystem, orbit = state.buyOrbit, area = state.buyArea, tab = state.buyTab) {
  const locations = new Set();
  for (const entry of buyEntriesForTab()) {
    for (const offer of buyEntryOffers(entry)) {
      if (!buyOfferAllowedForTab(offer, tab)) continue;
      const fields = buyOfferFields(offer);
      if (system !== "All" && (fields?.system || offerSystem(offer)) !== system) continue;
      if (orbit !== "All" && (fields?.orbit || offerOrbit(offer)) !== orbit) continue;
      if (area !== "All" && (fields?.area || offerArea(offer)) !== area) continue;
      const location = fields?.locationPath || buyOfferDisplayLocation(offer);
      if (!location || norm(location) === "other") continue;
      if (isKnownBuyOrbit(location) || isKnownBuyArea(location)) continue;
      if (!buyIsBusinessLabel(location) && isGenericBuyShopLabel(location)) continue;
      locations.add(location);
    }
  }
  return ["All", ...[...locations].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyTypeOptions() {
  const types = new Set();
  for (const entry of buyEntriesForTab()) {
    const value = buyEntryType(entry);
    if (!isBadLabel(value)) types.add(value);
  }
  return ["All", ...[...types].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buySubtypeOptions() {
  const subtypes = new Set();
  for (const entry of buyEntriesForTab()) {
    if (state.buyType !== "All" && buyEntryType(entry) !== state.buyType) continue;
    const value = buyEntrySubtype(entry);
    if (!isBadLabel(value)) subtypes.add(value);
  }
  return ["All", ...[...subtypes].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyItemCategoryOptions() {
  return ["All", "Armor", "Weapons", "Food", "Containers", "Attachments", "Clothing", "Utility"];
}

function buyItemCategory(entry) {
  if (!entry) return "";
  const type = norm(entry?.type);
  const subtype = norm(entry?.subtype);
  const name = norm(buyEntryName(entry));
  const text = `${type} ${subtype} ${name}`;

  if (type.includes("armor") || /(\bhelmet\b|\btorso\b|\barms?\b|\blegs?\b|\bbackpack\b|\bundersuit\b)/i.test(text)) return "Armor";
  if (type.includes("clothing") || /(\bshirt(s)?\b|\blegwear\b|\bfootwear\b|\bhat(s)?\b|\bglove(s)?\b|\bcoat\b|\bjack(et|ets)\b|\bpant(s)?\b|\bunderwear\b|\bdress\b|\bhoodie\b|\bscarf\b)/i.test(text)) return "Clothing";
  if (type.includes("utility") || /(\bmining laser\b|\bsalvage beam\b|\btractor beam\b|\bmultitool\b|\btool\b|\bscraper module\b|\brepair\b)/i.test(text)) return "Utility";
  if (type.includes("weapon") || /\b(weapon|gun|pistol|rifle|shotgun|smg|sniper|cannon|repeater|gatling|missile|torpedo|bomb|launcher|railgun|pdc)\b/i.test(text)) return "Weapons";
  if (type.includes("attachment") || /\b(magazine|scope|optic|sight|suppressor|silencer|barrel|grip|stock|laser pointer|flashlight|underbarrel|attachment|clip)\b/i.test(text)) return "Attachments";
  if (type.includes("food") || /\b(food|drink|beverage|water|juice|coffee|tea|snack|meal|ration|candy|cookie|sandwich|burger|pizza|soup|bar)\b/i.test(text)) return "Food";
  if (type.includes("container") || /\b(container|crate|box|canister|locker|storage)\b/i.test(text)) return "Containers";
  return "";
}

function buyShipCareerOptions() {
  const values = new Set();
  for (const entry of buyEntriesForTab("ships")) {
    const value = buyEntryShipCareer(entry);
    if (!isBadLabel(value)) values.add(value);
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyShipRoleOptions() {
  const values = new Set();
  for (const entry of buyEntriesForTab("ships")) {
    for (const value of buyEntryShipRoles(entry)) {
      if (!isBadLabel(value) && !isShipCareerLabel(value)) values.add(value);
    }
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyShipSizeOptions() {
  const values = new Set();
  for (const entry of buyEntriesForTab("ships")) {
    const value = buyEntryShipSize(entry);
    if (!isBadLabel(value)) values.add(value);
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyShipWeaponOptions() {
  const values = new Set();
  for (const entry of buyEntriesForTab("ships")) {
    for (const value of visibleShipWeaponNames(shipLoadoutDisplayNames(entry, "weapons"))) {
      if (!isBadLabel(value)) values.add(value);
    }
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyShipComponentOptions() {
  const values = new Set();
  for (const entry of buyEntriesForTab("ships")) {
    for (const value of visibleShipComponentNames(shipLoadoutDisplayNames(entry, "components"))) {
      if (!isBadLabel(value)) values.add(value);
    }
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buySearchText(entry, tab = state.buyTab) {
  const offers = buyEntryOffers(entry).map((offer) => [offer.location, offer.locationPath, offer.locationLabel, offer.locationName, offer.system, offer.orbit, offer.area, offer.price].filter(Boolean).join(" "));
  const shipExtras = tab === "ships" || tab === "rentals"
    ? [
        buyEntryShipCareer(entry),
        ...buyEntryShipRoles(entry),
        buyEntryShipSize(entry),
        ...(Array.isArray(entry?.loadoutCategories) ? entry.loadoutCategories : []),
        ...visibleShipWeaponNames(shipLoadoutDisplayNames(entry, "weapons")),
        ...visibleShipComponentNames(shipLoadoutDisplayNames(entry, "components")),
      ]
    : [];
  return [
    buyEntryName(entry, tab),
    buyEntryManufacturer(entry),
    buyEntryType(entry, tab),
    buyEntrySubtype(entry, tab),
    buyEntrySize(entry, tab),
    entry?.basePrice,
    entry?.prices ? Object.values(entry.prices).join(" ") : "",
    ...offers,
    ...shipExtras,
  ]
    .join(" ")
    .toLowerCase();
}

function filteredBuyEntries() {
  const query = norm(state.buySearch);
  return buyEntriesForTab()
    .filter((entry) => {
      if (state.buyTab === "items" && state.buyItemCategory !== "All" && buyItemCategory(entry) !== state.buyItemCategory) return false;
      if (state.buyType !== "All" && buyEntryType(entry) !== state.buyType) return false;
      if (state.buySubtype !== "All" && buyEntrySubtype(entry) !== state.buySubtype) return false;
      if (state.buyTab !== "items" && state.buyShipCareer !== "All" && buyEntryShipCareer(entry) !== state.buyShipCareer) return false;
      if (state.buyTab !== "items" && state.buyShipSize !== "All" && buyEntrySize(entry) !== state.buyShipSize) return false;
      if (state.buyTab !== "items" && state.buyShipRole !== "All" && !buyEntryShipRoles(entry).includes(state.buyShipRole)) return false;
      if (state.buyTab !== "items" && state.buyShipWeapon !== "All") {
        const weapons = visibleShipWeaponNames(shipLoadoutDisplayNames(entry, "weapons"));
        if (!weapons.includes(state.buyShipWeapon)) return false;
      }
      if (state.buyTab !== "items" && state.buyShipComponent !== "All") {
        const components = visibleShipComponentNames(shipLoadoutDisplayNames(entry, "components"));
        if (!components.includes(state.buyShipComponent)) return false;
      }
      const offers = buyEntryOffers(entry);
      if (offers.length) {
        if (!offers.some((offer) => buyOfferMatches(offer, state.buySystem, state.buyOrbit, state.buyArea, state.buyTab))) return false;
      } else if (!entry?.synthetic && (state.buySystem !== "All" || state.buyOrbit !== "All" || state.buyArea !== "All")) {
        return false;
      }
      if (!query) return true;
      return buyEntryName(entry).toLowerCase().includes(query);
    })
    .sort((a, b) => buyEntryName(a).localeCompare(buyEntryName(b), undefined, { sensitivity: "base" }));
}

function currentBuyEntry() {
  const entries = filteredBuyEntries();
  if (!entries.length) return null;
  return entries.find((entry) => String(entry.id || buyEntryName(entry)) === String(state.buySelectedId)) || null;
}

function selectBuyTab(tab) {
  state.buyTab = tab || "items";
  state.buySelectedId = "";
  state.buyItemCategory = "All";
  state.buyType = "All";
  state.buySubtype = "All";
  state.buyShipCareer = "All";
  state.buyShipSize = "All";
  state.buyShipRole = "All";
  state.buyShipWeapon = "All";
  state.buyShipComponent = "All";
  state.buySystem = "All";
  state.buyOrbit = "All";
  state.buyArea = "All";
  renderAll();
}

function selectBuyEntry(entry) {
  if (!entry) return;
  state.buySelectedId = String(entry.id || buyEntryName(entry));
  renderBuy();
}

function loadState() {
  loadUsers();
  const savedUserId = localStorage.getItem(STORAGE_KEY) || state.users[0].id;
  state.currentUserId = state.users.some((user) => user.id === savedUserId) ? savedUserId : state.users[0].id;
  loadProfile(state.currentUserId);
  state.watch.name = localStorage.getItem(WATCH_KEY) || "";
  state.scminersDbManifestUrl = normalizeScminersDbManifestUrl(
    localStorage.getItem(SCMINERSDB_MANIFEST_URL_KEY) || state.scminersDbManifestUrl,
  );
}

function saveState() {
  localStorage.setItem(SCMINERSDB_MANIFEST_URL_KEY, currentScminersDbManifestUrl());
  const snapshot = JSON.stringify({
    currentUserId: state.currentUserId || "",
    profile: {
      owned: [...state.owned],
      logs: state.logs,
      view: state.view,
      collectionMode: state.collectionMode,
      search: state.search,
      blueprintSearch: state.blueprintSearch,
      missionSearch: state.missionSearch,
      missionScriptOnly: state.missionScriptOnly,
      missionFilterType: state.missionFilterType,
      missionFilterPoints: state.missionFilterPoints,
      missionFilterReputation: state.missionFilterReputation,
      missionFilterLocation: state.missionFilterLocation,
      missionFilterDifficulty: state.missionFilterDifficulty,
      chip: state.chip,
      missionType: state.missionType,
      company: state.company,
      mission: state.mission,
      reward: state.reward,
      customReward: state.customReward,
      buyTab: state.buyTab,
      buySearch: state.buySearch,
      buySystem: state.buySystem,
      buyOrbit: state.buyOrbit,
      buyArea: state.buyArea,
      buyType: state.buyType,
      buySubtype: state.buySubtype,
      buyItemCategory: state.buyItemCategory,
      buyShipCareer: state.buyShipCareer,
      buyShipSize: state.buyShipSize,
      buySelectedId: state.buySelectedId,
      rail: state.rail,
      progressFocus: state.progressFocus,
      progressSubtype: state.progressSubtype,
      hideUnrankedCompanies: state.hideUnrankedCompanies,
    },
    scminersDbManifestUrl: currentScminersDbManifestUrl(),
    watch: state.watch.name || "",
  });
  if (snapshot === state.lastSavedSnapshot) return;
  state.lastSavedSnapshot = snapshot;
  localStorage.setItem(STORAGE_KEY, state.currentUserId || "");
  saveProfile();
  if (state.watch.name) {
    localStorage.setItem(WATCH_KEY, state.watch.name);
  } else {
    localStorage.removeItem(WATCH_KEY);
  }
}

function isOwned(itemName) {
  return state.owned.has(norm(itemName));
}

function missionDisplayTitle(value) {
  return cleanDisplayText(value || "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\bLOCATION\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^\W+|\W+$/g, "")
    .trim();
}

function missionTitle(m) {
  return missionDisplayTitle(m?.title || m?.name || m?.type || "Unknown mission");
}

function missionTitleKey(value) {
  return norm(missionDisplayTitle(value));
}

function missionIdentityKey(mission) {
  return [
    norm(mission?.type || ""),
    norm(mission?.faction || ""),
    missionTitleKey(mission?.title || mission?.name || mission?.mission || ""),
    norm(missionLocation(mission)),
  ].join("::");
}

function missionLabel(m) {
  return `${m.type || "Unknown"} / ${m.faction || "Unknown"} / ${missionTitle(m)}`;
}

function collectionCategory(item) {
  if (!item) return "unknown";
  if (item.type === "armor") return "armor";
  if (item.type === "ammo") return "ammo";
  if (item.type === "weapon") return "weapon";
  if (item.type === "shipcomponent") {
    const name = String(item.name || "").toLowerCase();
    const subtype = String(item.subtype || "").toLowerCase();
    const text = `${name} ${subtype}`;
    if (/mining laser|tractor beam|scraper module|salvage/.test(text)) return "ship component";
    if (/fuel nozzle|fuel pod|hydrogen/.test(text)) return "fuel";
    if (/cool|heatsink|icebox/.test(text)) return "cooler";
    if (/power|plant|generator/.test(text)) return "ship component";
    if (/quantum|qt|drive/.test(text)) return "quantum drive";
    if (/radar|sensor|scanner/.test(text)) return "ship component";
    if (/shield|deflector/.test(text)) return "shield";
    if (/thruster|maneuver/.test(text)) return "thruster";
    if (/gun|cannon|turret|weapon|ballistic|energy|hardpoint|repeater|laser/.test(text)) return "ship weapon";
    if (/beam/.test(text)) return "ship component";
    return "ship component";
  }
  return item.type || "unknown";
}

function progressSubtypeLabel(item) {
  if (!item) return "unknown";
  const category = collectionCategory(item);
  const raw = String(item.subtype || "").trim();
  const name = String(item.name || "").toLowerCase();
  if (!raw) return category === "ship weapon" ? "ship weapon" : "unknown";
  if (item.type === "weapon") {
    if (/sniper/.test(name)) return "sniper rifle";
    if (/shotgun/.test(name)) return "shotgun";
    if (/smg|submachine/.test(name)) return "smg";
    if (/pistol/.test(name)) return "pistol";
    if (/rifle/.test(name)) return "rifle";
    if (/carbine/.test(name)) return "carbine";
    if (/lmg|machine gun/.test(name)) return "machine gun";
    if (/melee/.test(name)) return "melee";
    return "main gun";
  }
  if (category === "armor") return raw.toLowerCase();
  if (category === "ship weapon") return "ship weapon";
  if (["cooler", "power", "shield", "quantum drive", "fuel", "thruster"].includes(category)) return category;
  return raw.toLowerCase();
}

function progressSubtypeOptions(category) {
  const options = [...new Set(
    missionItems()
      .filter((item) => collectionCategory(item) === category)
      .map((item) => progressSubtypeLabel(item))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
  return options;
}

function allItems() {
  return ensureMissionLookupCache().allItems;
}

function missionItems() {
  return ensureMissionLookupCache().missionItems;
}

function missionRecordKey(mission) {
  return [
    norm(mission?.type || ""),
    norm(mission?.faction || ""),
    missionTitleKey(mission?.title || mission?.name || mission?.mission || ""),
    norm(mission?.system || (mission?.systems || []).join(", ") || mission?.location || ""),
  ].join("::");
}

function scminersDbMissionRecords() {
  if (state.scminersDb?.source === "bundled" || currentScminersDbManifestUrl().startsWith("bundled://")) return scminersDbExportRecords("missions.json");
  const appReady = scminersDbExportRecords("missions_app_ready.json");
  if (appReady.length) return appReady;
  const playerReady = scminersDbExportRecords("mission_catalog_player_ready.json");
  if (playerReady.length) return playerReady;
  return scminersDbExportRecords("missions.json");
}

function scminersDbMissionRewardRecords() {
  return scminersDbExportRecords("mission_rewards.json");
}

function scminersDbMissionPrereqRecords() {
  return scminersDbExportRecords("mission_prerequisites.json");
}

function scminersDbTextTokens(value) {
  return cleanDisplayText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function scminersDbRecordKeys(entry) {
  return [...new Set([
    entry?.mission_id,
    entry?.name,
    entry?.title,
    entry?.source_id,
    entry?.source_path,
    entry?.mission_type,
    entry?.faction_company,
    entry?.company_faction,
  ]
    .map((value) => norm(value))
    .filter(Boolean))];
}

function scminersDbMissionUsesAppReady(entry) {
  return Boolean(
    cleanDisplayText(entry?.title || "") ||
    cleanDisplayText(entry?.mission_giver || "") ||
    cleanDisplayText(entry?.required_rank || "") ||
    Array.isArray(entry?.location_options),
  );
}

function scminersDbRewardMoney(entry) {
  if (!entry) return 0;
  const rewards = entry.rewards || {};

  const direct = firstFiniteNumber(
    entry.auec_amount,
    entry.auecAmount,
    entry.uec_amount,
    entry.uecAmount,
    entry.money_reward,
    entry.moneyReward,
    entry.cash_reward,
    entry.cashReward,
    entry.payout,
    entry.reward_value,
    entry.rewardValue,
    entry.rewardAmount,
    entry.amount,
    entry.value,
    rewards.auec_amount,
    rewards.auecAmount,
    rewards.uec_amount,
    rewards.uecAmount,
    rewards.money_reward,
    rewards.moneyReward,
    rewards.cash_reward,
    rewards.cashReward,
    rewards.auec,
    rewards.uec,
    rewards.payout,
    rewards.reward_value,
    rewards.rewardValue,
    rewards.rewardAmount,
    rewards.amount,
    rewards.value,
  );

  if (direct !== null && direct > 0) return direct;

  const text = [
    entry.reward_summary,
    entry.rewardSummary,
    entry.description,
    entry.text,
    rewards.reward_summary,
    rewards.rewardSummary,
    rewards.description,
    rewards.text,
    JSON.stringify(rewards),
  ]
    .map((value) => cleanDisplayText(value))
    .filter(Boolean)
    .join(" ");

  const match = text.match(/\b(\d[\d,]*)\s*(?:auec|uec|credits?)\b/i);
  if (match) {
    const total = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(total) && total > 0) return total;
  }

  return 0;
}

function scminersDbRewardScript(entry) {
  if (!entry) return 0;
  const rewards = entry.rewards || {};
  return firstFiniteNumber(
    entry.script_amount,
    entry.script_count,
    entry.scriptReward,
    entry.script_reward,
    rewards.script_amount,
    rewards.script_count,
    rewards.scriptReward,
    rewards.script_reward,
    entry.reward_counts?.script,
    entry.reward_counts?.scripts,
    rewards.reward_counts?.script,
    rewards.reward_counts?.scripts,
  ) || 0;
}

function scminersDbPrereqSummary(entry) {
  if (!entry || typeof entry !== "object") return "";
  const parts = [];
  const blocks = Array.isArray(entry.prerequisite_source_blocks) ? entry.prerequisite_source_blocks : [];
  const prereqs = Array.isArray(entry.prerequisites) ? entry.prerequisites : [];

  for (const block of [...blocks, ...prereqs]) {
    if (!block || typeof block !== "object") continue;
    const blockParts = [];
    const rank = cleanDisplayText(block.required_rank || block.rank || block.reputation || block.repStanding || "");
    const rep = cleanDisplayText(block.required_rep || block.minimum_rep || block.rep_required || block.rep || "");
    const system = cleanDisplayText(block.system || block.star_system || block.location_system || "");
    const location = cleanDisplayText(block.location || block.area || block.poi || block.station || "");
    const count = cleanDisplayText(block.count || block.required_count || block.mission_count || block.required_missions || "");
    const mission = cleanDisplayText(block.mission || block.mission_name || block.required_mission || "");
    if (rank) blockParts.push(rank);
    if (rep) blockParts.push(rep);
    if (system) blockParts.push(system);
    if (location) blockParts.push(location);
    if (count) blockParts.push(`${count} missions`);
    if (mission) blockParts.push(mission);
    if (blockParts.length) parts.push(blockParts.join(" · "));
  }

  const fallbackBits = [
    entry.required_rank,
    entry.minimum_rank,
    entry.required_rep,
    entry.minimum_rep,
    entry.missionVariableName,
  ]
    .map((value) => cleanDisplayText(value))
    .filter(Boolean);
  if (!parts.length && fallbackBits.length) return fallbackBits.join(" · ");
  return parts.join(" | ");
}

function ensureBlueprintCraftingCache() {
  const signature = `${state.scminersDb?.signature || ""}|${(state.data?.items || []).length}`;
  if (blueprintCraftingCache.signature === signature) return blueprintCraftingCache;

  const recipes = scminersDbExportRecords("crafting_recipes.json");
  const dismantles = scminersDbExportRecords("dismantle_returns.json");
  const recipeByBlueprint = new Map();
  const recipeByName = new Map();
  const recipeByResultPath = new Map();
  const dismantleBySourceId = new Map();
  const dismantleBySourceName = new Map();
  const dismantleByResultPath = new Map();

  for (const recipe of recipes) {
    const blueprintKey = norm(fileStem(recipe?.blueprint_record_path || recipe?.internal_record_path || recipe?.source_path || ""));
    const resultPathKeys = sourcePathLookupKeys(recipe?.result_item_source_path || recipe?.result_item?.source_path || "");
    const resultNameKey = norm(
      cleanDisplayText(recipe?.result_item?.item_name || "")
        .replace(/^EntityClassDefinition\./i, "")
        .replace(/_/g, " "),
    );
    if (blueprintKey && !recipeByBlueprint.has(blueprintKey)) recipeByBlueprint.set(blueprintKey, recipe);
    if (resultNameKey && !recipeByName.has(resultNameKey)) recipeByName.set(resultNameKey, recipe);
    for (const key of resultPathKeys) {
      if (key && !recipeByResultPath.has(key)) recipeByResultPath.set(key, recipe);
    }
  }

  for (const entry of dismantles) {
    const sourceIds = [entry?.source_item?.item_id, entry?.source_item?.item_class_id, entry?.source_id]
      .map((value) => norm(value))
      .filter(Boolean);
    const sourceNames = [
      entry?.source_item?.item_name,
      entry?.source_item?.item_record_name,
      entry?.source_item?.name,
      entry?.source_item?.label,
      entry?.source_item?.display_name,
      entry?.source_item?.item_class_name,
      entry?.source_item?.class_name,
    ]
      .map((value) => norm(cleanDisplayText(value).replace(/^EntityClassDefinition\./i, "").replace(/_/g, " ")))
      .filter(Boolean);
    for (const key of sourceIds) {
      if (!dismantleBySourceId.has(key)) dismantleBySourceId.set(key, []);
      dismantleBySourceId.get(key).push(entry);
    }
    for (const key of sourceNames) {
      if (!dismantleBySourceName.has(key)) dismantleBySourceName.set(key, []);
      dismantleBySourceName.get(key).push(entry);
    }
    for (const key of sourcePathLookupKeys(entry?.source_item_source_path || entry?.source_item?.source_path || "")) {
      if (!key) continue;
      if (!dismantleByResultPath.has(key)) dismantleByResultPath.set(key, []);
      dismantleByResultPath.get(key).push(entry);
    }
  }

  blueprintCraftingCache = {
    signature,
    recipeByBlueprint,
    recipeByName,
    recipeByResultPath,
    dismantleBySourceId,
    dismantleBySourceName,
    dismantleByResultPath,
  };
  return blueprintCraftingCache;
}

function blueprintCraftingData(item) {
  if (!item) return { recipe: null, dismantles: [] };
  const cache = ensureBlueprintCraftingCache();
  const blueprintKey = norm(item.blueprint || "");
  const itemNameKey = norm(String(item.name || "").replace(/_/g, " "));
  const itemIdKeys = [item.id, item.uuid, buyEntryMetadataValue(item, "UUID")].map((value) => norm(value)).filter(Boolean);
  const itemClassNameKeys = sourcePathLookupKeys(buyEntryMetadataValue(item, "Class name"));
  const itemSourcePathKeys = sourcePathLookupKeys(item.source_path || item.sourcePath || item.item_info?.source_path || "");
  const itemNameCandidates = [
    item.name,
    item.title,
    item.item_name,
    buyEntryMetadataValue(item, "Name"),
    buyEntryMetadataValue(item, "Class name"),
    item.record_name,
  ]
    .map((value) => norm(cleanDisplayText(value).replace(/^EntityClassDefinition\./i, "").replace(/_/g, " ")))
    .filter(Boolean);
  const recipe =
    cache.recipeByBlueprint.get(blueprintKey) ||
    itemSourcePathKeys.map((key) => cache.recipeByResultPath.get(key)).find(Boolean) ||
    cache.recipeByName.get(itemNameKey) ||
    null;
  const resultPathKeys = sourcePathLookupKeys(recipe?.result_item_source_path || recipe?.result_item?.source_path || item.source_path || item.sourcePath || item.item_info?.source_path || "");
  const dismantles = [...new Map(
    [
      ...itemIdKeys.flatMap((key) => cache.dismantleBySourceId.get(key) || []),
      ...itemNameCandidates.flatMap((key) => cache.dismantleBySourceName.get(key) || []),
      ...itemClassNameKeys.flatMap((key) => cache.dismantleByResultPath.get(key) || []),
      ...resultPathKeys.flatMap((key) => cache.dismantleByResultPath.get(key) || []),
    ]
      .map((entry) => [entry?.source_id || entry?.source_path || JSON.stringify(entry), entry]),
  ).values()];
  return {
    recipe,
    dismantles,
  };
}

function blueprintItemByName(name) {
  const itemNameKey = norm(String(name || "").replace(/_/g, " "));
  if (!itemNameKey) return null;
  return allItems().find((entry) => norm(String(entry?.name || "").replace(/_/g, " ")) === itemNameKey) || null;
}

function craftingIngredientRows(item, recipe) {
  const tierIngredients = Array.isArray(recipe?.tiers?.[0]?.ingredients) ? recipe.tiers[0].ingredients : [];
  const recipeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const fallbackIngredients = Array.isArray(item?.materials) ? item.materials : [];
  return tierIngredients.length ? tierIngredients : recipeIngredients.length ? recipeIngredients : fallbackIngredients;
}

function renderCraftingIngredientMarkup(item, recipe) {
  const rows = craftingIngredientRows(item, recipe);
  if (!rows.length) return `<div class="muted">No crafting ingredients are loaded for this item yet.</div>`;
  return rows
    .map(
      (entry) => `
        <div class="mission-line">
          <strong>${cleanDisplayText(entry.resource || entry.slot_name || entry.name || "Unknown material")}</strong>
          <div class="muted">${formatCount(entry.quantity || entry.quantity_required || 0)} SCU${entry.minQuality !== undefined || entry.min_quality !== undefined ? ` · min quality ${formatCount(entry.minQuality ?? entry.min_quality ?? 0)}` : ""}</div>
        </div>
      `,
    )
    .join("");
}

function renderDismantleMarkup(dismantleEntries) {
  if (!Array.isArray(dismantleEntries) || !dismantleEntries.length) {
    return `<div class="muted">No dismantle return data is loaded for this item yet.</div>`;
  }
  return dismantleEntries
    .map((entry) => {
      const results = Array.isArray(entry?.dismantle_results) ? entry.dismantle_results : [];
      const totalReturned = results.reduce((sum, result) => sum + (Number(result?.quantity_returned || 0) || 0), 0);
      const resultMarkup = results.length
        ? results
            .map((result, index) => `
              <div class="muted">${cleanDisplayText(result?.material_name || result?.item_name || `Returned material ${index + 1}`)}: ${formatCount(result?.quantity_returned || 0)} SCU</div>
            `)
            .join("")
        : `<div class="muted">Return quantity unavailable</div>`;
      const hasNamedResults = results.some((result) => cleanDisplayText(result?.material_name || result?.item_name));
      return `
        <div class="mission-line">
          <strong>${cleanDisplayText(entry?.dismantle_method || "Dismantle")}</strong>
          <div class="muted">${totalReturned ? `${formatCount(totalReturned)} SCU returned` : "Return quantity unavailable"}${entry?.recipe_time_seconds ? ` · ${formatCount(entry.recipe_time_seconds)} sec` : ""}</div>
          ${resultMarkup}
          ${hasNamedResults ? "" : `<div class="muted">SCMinersDB did not expose returned material names for this row.</div>`}
        </div>
      `;
    })
    .join("");
}

function scminersDbEnsureMissionCache() {
  const signature = [
    state.scminersDb?.signature || "",
    scminersDbMissionRecords().length,
    scminersDbMissionRewardRecords().length,
    scminersDbMissionPrereqRecords().length,
  ].join("|");
  if (scminersDbMissionCache.signature === signature) return scminersDbMissionCache;

  const rewards = scminersDbMissionRewardRecords();
  const prereqs = scminersDbMissionPrereqRecords();
  const rewardsByKey = new Map();
  const prereqsByKey = new Map();
  const missions = scminersDbMissionRecords();

  for (const entry of rewards) {
    for (const key of scminersDbRecordKeys(entry)) {
      if (!rewardsByKey.has(key)) rewardsByKey.set(key, entry);
    }
  }
  for (const entry of prereqs) {
    for (const key of scminersDbRecordKeys(entry)) {
      if (!prereqsByKey.has(key)) prereqsByKey.set(key, entry);
    }
  }

  const structuredEntries = missions.map((entry) => {
    const usesAppReady = scminersDbMissionUsesAppReady(entry);
    const keys = scminersDbRecordKeys(entry);
    const rewardEntry = keys.map((key) => rewardsByKey.get(key)).find(Boolean) || null;
    const prereqEntry = keys.map((key) => prereqsByKey.get(key)).find(Boolean) || null;
    const structuredName = cleanDisplayText(entry.title || entry.name || entry.mission_id || "");
    const structuredMissionId = cleanDisplayText(entry.mission_id || entry.name || "");
    const structuredMissionType = cleanDisplayText(entry.mission_type || "");
    const structuredFaction = cleanDisplayText(entry.mission_giver || entry.faction_company || entry.company_faction || "");
    const structuredSourcePath = cleanDisplayText(entry.source_path || "");
    const structuredSourceId = cleanDisplayText(entry.source_id || "");
    const structuredDescription = cleanDisplayText(entry.description || "");
    const structuredLocation = cleanDisplayText(entry.location || "");
    const structuredTitle = cleanDisplayText(entry.title || "");
    const structuredSearchText = [
      structuredTitle,
      structuredDescription,
      entry.system,
      entry.location,
      structuredName,
      structuredMissionId,
      structuredMissionType,
      structuredFaction,
      structuredSourcePath,
      structuredSourceId,
      entry.name,
      entry.mission_id,
      entry.mission_type,
      entry.faction_company,
      entry.company_faction,
    ]
      .map((value) => cleanDisplayText(value).toLowerCase())
      .join(" ");
    return {
      ...entry,
      structuredName,
      structuredMissionId,
      structuredMissionType,
      structuredFaction,
      structuredSourcePath,
      structuredSourceId,
      structuredMoneyReward: usesAppReady ? firstFiniteNumber(entry.money_reward, entry.moneyReward) || 0 : scminersDbRewardMoney(rewardEntry),
      structuredScriptReward: usesAppReady ? firstFiniteNumber(entry.script_reward, entry.scriptReward) || 0 : scminersDbRewardScript(rewardEntry),
      structuredRewardCount: Number(rewardEntry?.reward_counts ? Object.values(rewardEntry.reward_counts).reduce((sum, value) => sum + (Number(value) || 0), 0) : 0) || 0,
      structuredRewardSummary: cleanDisplayText(
        usesAppReady
          ? entry.reward_summary || ""
          : rewardEntry?.rewards
          ? Object.entries(rewardEntry.rewards)
              .filter(([, value]) => value !== null && value !== undefined && value !== "")
              .map(([key, value]) => `${key}: ${cleanDisplayText(value)}`)
              .join(" · ")
          : "",
      ),
      structuredPrereqSummary: cleanDisplayText(entry.required_rank || entry.required_mission_count || entry.required_missions?.length || entry.location || entry.system)
        ? [
            cleanDisplayText(entry.required_rank || ""),
            Number(entry.required_mission_count || 0) > 0 ? `${formatCount(entry.required_mission_count)} missions` : "",
            Array.isArray(entry.required_missions) && entry.required_missions.length ? entry.required_missions.join(", ") : "",
            cleanDisplayText(entry.location || ""),
            cleanDisplayText(entry.system || ""),
          ].filter(Boolean).join(" · ")
        : scminersDbPrereqSummary(prereqEntry),
      structuredPrereqSource: cleanDisplayText(prereqEntry?.source_path || ""),
      structuredTitle,
      structuredDescription,
      structuredLocation,
      structuredLocationOptions: Array.isArray(entry.location_options) ? entry.location_options.map((value) => cleanDisplayText(value)).filter(Boolean) : [],
      structuredRequiredRank: cleanDisplayText(entry.required_rank || ""),
      structuredRequiredMissionCount: Number(entry.required_mission_count || 0) || 0,
      structuredRequiredMissions: Array.isArray(entry.required_missions) ? entry.required_missions.map((value) => cleanDisplayText(value)).filter(Boolean) : [],
      structuredRuntimeOnlyPossible: Boolean(entry.runtime_only_possible),
      structuredSameSessionKnown: Boolean(entry.same_session_required_known),
      structuredSameSessionRequired: entry.same_session_required,
      structuredVariantKinds: Array.isArray(entry.variant_kinds) ? entry.variant_kinds.map((value) => cleanDisplayText(value)).filter(Boolean) : [],
      structuredSearchText,
      structuredSearchTokens: new Set(scminersDbTextTokens(structuredSearchText)),
      structuredSearchExactTitle: norm(structuredName || entry.name || ""),
      structuredSearchExactId: norm(structuredMissionId || entry.mission_id || ""),
      structuredSearchType: norm(structuredMissionType || entry.mission_type || ""),
      structuredSearchFaction: norm(structuredFaction || entry.faction_company || entry.company_faction || ""),
      structuredSearchSystem: norm(entry.system || ""),
      structuredSearchLocation: norm(structuredLocation || ""),
    };
  });

  scminersDbMissionCache = {
    signature,
    entries: structuredEntries,
    rewardById: rewardsByKey,
    prereqById: prereqsByKey,
    missionSearchIndex: new Map(),
    missionMatchIndex: new Map(),
  };
  return scminersDbMissionCache;
}

function scminersDbMissionSearchIndex(mission) {
  if (!mission) return null;
  const cache = scminersDbEnsureMissionCache();
  const missionKey = missionRecordKey(mission);
  if (cache.missionSearchIndex?.has(missionKey)) return cache.missionSearchIndex.get(missionKey);
  const missionTitleValue = missionTitle(mission);
  const missionTypeValue = mission.type;
  const missionFactionValue = mission.faction;
  const missionLocationValue = missionLocation(mission);
  const index = {
    titleNorm: norm(missionTitleValue),
    typeNorm: norm(missionTypeValue),
    factionNorm: norm(missionFactionValue),
    systemNorm: norm(mission.system),
    locationNorm: norm(missionLocationValue),
    titleTokens: scminersDbTextTokens(missionTitleValue),
    typeTokens: scminersDbTextTokens(missionTypeValue),
    factionTokens: scminersDbTextTokens(missionFactionValue),
    locationTokens: scminersDbTextTokens(missionLocationValue),
  };
  if (cache.missionSearchIndex) cache.missionSearchIndex.set(missionKey, index);
  return index;
}

function scminersDbMissionScore(missionIndex, entry) {
  if (!missionIndex || !entry) return 0;
  const searchable = entry.structuredSearchText || "";
  const entryTokens = entry.structuredSearchTokens || new Set();
  let score = 0;

  if (missionIndex.titleNorm && missionIndex.titleNorm === entry.structuredSearchExactTitle) score += 200;
  if (missionIndex.titleNorm && missionIndex.titleNorm === entry.structuredSearchExactId) score += 180;
  if (missionIndex.typeNorm && missionIndex.typeNorm === entry.structuredSearchType) score += 60;
  if (missionIndex.factionNorm && missionIndex.factionNorm === entry.structuredSearchFaction) score += 80;
  if (missionIndex.systemNorm && searchable.includes(missionIndex.systemNorm)) score += 30;
  if (missionIndex.locationNorm && searchable.includes(missionIndex.locationNorm)) score += 30;

  for (const token of missionIndex.titleTokens) if (entryTokens.has(token)) score += 12;
  for (const token of missionIndex.typeTokens) if (entryTokens.has(token)) score += 8;
  for (const token of missionIndex.factionTokens) if (entryTokens.has(token)) score += 8;
  for (const token of missionIndex.locationTokens) if (entryTokens.has(token)) score += 4;

  return score;
}

function scminersDbBestMissionMatch(mission) {
  if (!mission) return null;
  const cache = scminersDbEnsureMissionCache();
  const missionKey = missionRecordKey(mission);
  if (cache.missionMatchIndex?.has(missionKey)) return cache.missionMatchIndex.get(missionKey);
  const missionIndex = scminersDbMissionSearchIndex(mission);
  let best = null;
  let bestScore = 0;
  for (const entry of cache.entries) {
    const score = scminersDbMissionScore(missionIndex, entry);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  const matched = bestScore > 0 ? { ...best, structuredMatchScore: bestScore } : null;
  if (cache.missionMatchIndex) cache.missionMatchIndex.set(missionKey, matched);
  return matched;
}

function inferMissionTypeFromMission(mission, faction = "") {
  const text = [
    mission?.type,
    mission?.category,
    mission?.mission_type,
    mission?.structuredMissionType,
    mission?.title,
    mission?.name,
    mission?.mission,
    mission?.description,
    mission?.summary,
    mission?.text,
    mission?.structuredDescription,
    mission?.structuredSourcePath,
    mission?.structuredMissionId,
    faction,
  ]
    .map((value) => cleanDisplayText(value))
    .join(" ")
    .toLowerCase();

  if (!text.trim()) return "";

  if (/\b(refuel|refueling|fuel)\b/.test(text)) return "Refueling";
  if (/\b(salvage|scrap|scraper|reclaimer)\b/.test(text)) return "Salvage";
  if (/\b(mine|mining|ore|asteroid)\b/.test(text)) return "Hand Mining";
  if (/\b(deliver|delivery|drop off|pickup|pick up|courier|package|box)\b/.test(text)) return "Delivery";
  if (/\b(haul|hauling|cargo|freight|transport)\b/.test(text)) return "Hauling";
  if (/\b(investigate|investigation|search|missing|intel|scan|data|evidence)\b/.test(text)) return "Investigation";

  if (/\b(bounty hunter|bounty|arlington|eckhart|miles eckhart)\b/.test(text)) {
  return "Bounty Hunter";
}

if (
  /\b(defend|defense|eliminate|neutralize|mercenary|merc|attack|protect|patrol|strike|vanduul|terrorist|hostile|threat|combat|capture|gang|operative extraction)\b/.test(text)
) {
  return "Mercenary";
}

  return "";
}

function augmentMissionWithStructuredData(mission) {
  if (!mission) return mission;
  const structured = scminersDbBestMissionMatch(mission);
  if (!structured) return mission;

  const safeMissionFaction = isBadLabel(mission.faction) ? "" : cleanDisplayText(mission.faction);
  const safeMissionType = isBadLabel(mission.type) ? "" : cleanDisplayText(mission.type);
  const safeStructuredFaction = isBadLabel(structured.structuredFaction) ? "" : cleanDisplayText(structured.structuredFaction);
  const safeStructuredMissionType = isBadLabel(structured.structuredMissionType) ? "" : cleanDisplayText(structured.structuredMissionType);

  const compactLabel = (value) => norm(value).replace(/[^a-z0-9]/g, "");
  const structuredTypeLooksLikeFaction =
    compactLabel(safeStructuredMissionType) &&
    compactLabel(safeStructuredMissionType) === compactLabel(safeStructuredFaction);

  const resolvedFaction = safeMissionFaction || safeStructuredFaction || "";
  const inferredType = inferMissionTypeFromMission(
    {
      ...mission,
      structuredMissionType: safeStructuredMissionType,
      structuredDescription: structured.structuredDescription || "",
      structuredSourcePath: structured.structuredSourcePath || "",
      structuredMissionId: structured.structuredMissionId || "",
    },
    resolvedFaction,
  );

  const resolvedType =
    safeMissionType ||
    (structuredTypeLooksLikeFaction ? "" : safeStructuredMissionType) ||
    inferredType ||
    "";

  return {
    ...mission,
    title: structured.structuredTitle || missionDisplayTitle(mission.title || mission.name || "") || mission.title || mission.name || "",
    description: structured.structuredDescription || mission.description || mission.summary || mission.text || "",
    summary: structured.structuredDescription || mission.summary || mission.description || "",
    text: structured.structuredDescription || mission.text || mission.description || "",
    faction: resolvedFaction,
    type: resolvedType,
    system: structured.system || structured.system_guess || mission.system || "",
    location: structured.structuredLocation || mission.location || structured.location_guess || "",
    repStanding: structured.structuredRequiredRank || mission.repStanding || "",
    structuredMissionId: structured.structuredMissionId || mission.structuredMissionId || "",
    structuredMissionName: structured.structuredName || mission.structuredMissionName || "",
    structuredSourcePath: structured.structuredSourcePath || mission.structuredSourcePath || "",
    structuredSourceId: structured.structuredSourceId || mission.structuredSourceId || "",
    structuredFaction: safeStructuredFaction || mission.structuredFaction || "",
    structuredMissionType: safeStructuredMissionType || mission.structuredMissionType || "",
    structuredMoneyReward: structured.structuredMoneyReward ?? mission.structuredMoneyReward ?? 0,
    structuredScriptReward: structured.structuredScriptReward ?? mission.structuredScriptReward ?? 0,
    structuredRewardCount: structured.structuredRewardCount ?? mission.structuredRewardCount ?? 0,
    structuredRewardSummary: structured.structuredRewardSummary || mission.structuredRewardSummary || "",
    structuredPrereqSummary: structured.structuredPrereqSummary || mission.structuredPrereqSummary || "",
    structuredPrereqSource: structured.structuredPrereqSource || mission.structuredPrereqSource || "",
    structuredDescription: structured.structuredDescription || mission.structuredDescription || "",
    structuredLocation: structured.structuredLocation || mission.structuredLocation || "",
    structuredLocationOptions: structured.structuredLocationOptions || mission.structuredLocationOptions || [],
    structuredRequiredRank: structured.structuredRequiredRank || mission.structuredRequiredRank || "",
    structuredRequiredMissionCount: structured.structuredRequiredMissionCount ?? mission.structuredRequiredMissionCount ?? 0,
    structuredRequiredMissions: structured.structuredRequiredMissions || mission.structuredRequiredMissions || [],
    structuredRuntimeOnlyPossible: structured.structuredRuntimeOnlyPossible ?? mission.structuredRuntimeOnlyPossible ?? false,
    structuredSameSessionKnown: structured.structuredSameSessionKnown ?? mission.structuredSameSessionKnown ?? false,
    structuredSameSessionRequired: structured.structuredSameSessionRequired ?? mission.structuredSameSessionRequired ?? null,
    structuredVariantKinds: structured.structuredVariantKinds || mission.structuredVariantKinds || [],
    structuredMatchScore: structured.structuredMatchScore ?? mission.structuredMatchScore ?? 0,
    source: mission.source || "structured",
  };
}

function repairMissionLabels(mission) {
  if (!mission) return mission;

  const faction =
    isBadLabel(mission.faction)
      ? cleanDisplayText(mission.structuredFaction || "")
      : cleanDisplayText(mission.faction || "");

  const type =
    isBadLabel(mission.type)
      ? inferMissionTypeFromMission(mission, faction)
      : cleanDisplayText(mission.type || "");

  return {
    ...mission,
    faction: faction || mission.faction || "",
    type: type || mission.type || "",
  };
}

function normalizeLiveMissionContract(contract) {
  if (!contract || typeof contract !== "object") return null;
  const title = cleanDisplayText(
    contract.title ||
      contract.name ||
      contract.contract_name ||
      contract.contractTitle ||
      contract.mission_name ||
      contract.missionName ||
      contract.contact_name ||
      "",
  );
  if (!title) return null;
  const cleanTitle = missionDisplayTitle(title);

  const description = cleanDisplayText(
    contract.description ||
      contract.summary ||
      contract.text ||
      contract.details ||
      contract.contract_description ||
      contract.mission_description ||
      "",
  );
  const type = cleanDisplayText(contract.type || contract.contract_type || contract.mission_type || contract.category || "") || "Unknown";
  const faction = cleanDisplayText(
    contract.faction || contract.company || contract.company_name || contract.contractor || contract.contact_name || "",
  ) || "Unknown";
  const system = cleanDisplayText(contract.system || contract.system_name || contract.star_system || "");
  const location = cleanDisplayText(
    contract.location || contract.location_name || contract.point_of_interest || contract.site || contract.area || "",
  );
  const lawful = contract.lawful === false || contract.is_lawful === false ? false : contract.lawful === true || contract.is_lawful === true ? true : null;
  const repStanding = cleanDisplayText(contract.reputation || contract.rep || contract.rank || contract.required_rank || contract.minimum_rank || "");
  const repReward = firstFiniteNumber(contract.repReward, contract.reputation_reward, contract.rep, contract.rep_points, contract.reputation_points);
  const moneyReward = firstFiniteNumber(
    contract.moneyReward,
    contract.rewardMoney,
    contract.auecReward,
    contract.uecReward,
    contract.cashReward,
    contract.payout,
    contract.reward_value,
    contract.rewardAmount,
    contract.reward_amount,
  );
  const scriptReward = firstFiniteNumber(
    contract.scriptReward,
    contract.scriptAmount,
    contract.scriptCount,
    contract.rewardScripts,
    contract.scripts,
    contract.reward_items,
    contract.rewardItems,
  ) || rewardScriptCountFromAny(contract.reward_items || contract.rewardItems || contract.rewards || contract.reward);

  return {
    title: cleanTitle || title,
    type,
    faction,
    system,
    location,
    lawful,
    repStanding,
    repReward,
    moneyReward: moneyReward || null,
    scriptReward: scriptReward || null,
    description,
    summary: cleanDisplayText(contract.summary || contract.description || ""),
    text: cleanDisplayText(contract.text || contract.description || ""),
    rewards: Array.isArray(contract.rewards) ? contract.rewards : [],
    rewardCount: Array.isArray(contract.rewards) ? contract.rewards.length : 0,
    source: "UEX",
    raw: contract,
  };
}

function liveMissionRecords() {
  return Array.isArray(state.liveMissions) ? state.liveMissions.filter(Boolean) : [];
}

function extractContractsFromPayload(payload) {
  const results = [];
  const queue = [payload];
  const visited = new Set();

  while (queue.length) {
    const value = queue.shift();
    if (!value || visited.has(value)) continue;
    if (typeof value === "object") visited.add(value);

    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }

    if (!value || typeof value !== "object") continue;

    if (value.title || value.name || value.contract_name || value.contractTitle || value.mission_name || value.contact_name) {
      results.push(value);
      continue;
    }

    for (const key of ["data", "contracts", "items", "results", "payload"]) {
      if (value[key]) queue.push(value[key]);
    }
  }

  return results;
}

function combinedMissionRecords() {
  return ensureMissionLookupCache().combinedRecords;
}

async function loadLiveMissionContracts() {
  if (liveMissionLoadPromise) return liveMissionLoadPromise;
  liveMissionLoadPromise = (async () => {
    state.liveMissionsStatus = "Loading live missions...";
    renderMissionBrowser();
    try {
      const response = await fetch("https://api.uexcorp.uk/2.0/contracts/");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const contracts = extractContractsFromPayload(payload);
      const normalized = contracts
        .map(normalizeLiveMissionContract)
        .filter(Boolean)
        .filter((mission) => !isBadLabel(mission.title));
      state.liveMissions = normalized;
      state.liveMissionsStatus = normalized.length ? `Loaded ${formatCount(normalized.length)} live missions` : "No live missions found";
    } catch (error) {
      state.liveMissions = [];
      state.liveMissionsStatus = `Live missions unavailable: ${cleanDisplayText(error?.message || error)}`;
    }
    renderAll();
  })().finally(() => {
    liveMissionLoadPromise = null;
  });
  return liveMissionLoadPromise;
}

function missionCatalog() {
  const cache = ensureMissionLookupCache();
  if (!cache.missionCatalogReady) {
    const map = new Map();
    for (const mission of cache.combinedRecords) {
      if (isBadLabel(mission.title) || isBadLabel(mission.type) || isBadLabel(mission.faction)) continue;
      const key = missionRecordKey(mission);
      if (map.has(key)) continue;
      const rewards = Array.isArray(mission.rewards) && mission.rewards.length ? mission.rewards : rewardsFor(mission.type, mission.faction, missionTitle(mission));
      map.set(key, {
        ...mission,
        rewards,
        rewardCount: Number(mission.rewardCount || rewards.length || 0),
      });
    }
    cache.missionCatalog = [...map.values()].sort((a, b) => {
      const titleCompare = missionTitle(a).localeCompare(missionTitle(b), undefined, { sensitivity: "base" });
      return titleCompare || missionLabel(a).localeCompare(missionLabel(b));
    });
    cache.missionCatalogReady = true;
  }
  return cache.missionCatalog;
}

function visibleItems() {
  const query = norm(state.search);
  const wantOwned = state.collectionMode === "owned";
  return missionItems().filter((item) => {
    const owned = isOwned(item.name);
    if (wantOwned !== owned) return false;
    if (state.chip !== "All" && collectionCategory(item) !== state.chip) return false;
    if (!query) return true;
    const text = [item.name, item.type, item.subtype, ...(item.missions || []).map(missionLabel)].join(" ").toLowerCase();
    return text.includes(query);
  });
}

function missionSearchItems() {
  const query = norm(state.missionSearch);
  const items = missionCatalog();
  const filtered = !query
    ? items
    : items.filter((mission) => {
      const rewardText = (mission.rewards || []).map((item) => item.name).join(" ");
      const text = [
          mission.type,
          mission.faction,
          mission.title,
          mission.system,
          mission.location,
          mission.difficulty,
          mission.repStanding,
          mission.repReward,
          mission.moneyReward,
          mission.scriptReward,
          mission.structuredMissionId,
          mission.structuredMissionName,
          mission.structuredSourcePath,
          mission.structuredPrereqSummary,
          rewardText,
          missionDescription(mission),
        ]
          .join(" ")
        .toLowerCase();
      return text.includes(query);
    });
  const missionFiltered = filtered.filter((mission) => {
    if (state.missionFilterType !== "All" && cleanDisplayText(mission.type) !== state.missionFilterType) return false;
    if (state.missionFilterPoints !== "All" && String(Number(mission.repReward || 0)) !== String(Number(state.missionFilterPoints))) return false;
    if (state.missionFilterReputation !== "All" && cleanDisplayText(mission.repStanding) !== state.missionFilterReputation) return false;
    if (state.missionFilterLocation !== "All" && missionLocation(mission) !== state.missionFilterLocation) return false;
    if (state.missionFilterDifficulty !== "All" && missionDifficulty(mission) !== state.missionFilterDifficulty) return false;

    const moneyReward = Number(missionMoneyReward(mission) || 0);
    if (state.missionFilterMoney === "Unknown" && moneyReward > 0) return false;
    if (state.missionFilterMoney !== "All" && state.missionFilterMoney !== "Unknown" && String(moneyReward) !== String(Number(state.missionFilterMoney))) return false;

    return true;
  });
  const scriptFiltered = state.missionScriptOnly ? missionFiltered.filter((mission) => missionHasScriptReward(mission)) : missionFiltered;
  return scriptFiltered.sort((a, b) => {
    const titleCompare = missionTitle(a).localeCompare(missionTitle(b), undefined, { sensitivity: "base" });
    return titleCompare || missionLabel(a).localeCompare(missionLabel(b));
  });
}

function missionFilterValues(selector) {
  const seen = new Map();
  for (const mission of missionCatalog()) {
    const value = cleanDisplayText(selector(mission));
    if (!value) continue;
    const key = norm(value);
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
}

function missionFilterOptions(values, current = "All", sorter = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })) {
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const text = cleanDisplayText(value);
    if (!text) continue;
    const key = norm(text);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
  }
  const sorted = unique.sort(sorter);
  return [
    `<option value="All" ${current === "All" ? "selected" : ""}>All</option>`,
    ...sorted.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`),
  ].join("");
}

function missionFilterNumberOptions(values, current = "All") {
  const sorted = [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
  return [
    `<option value="All" ${current === "All" ? "selected" : ""}>All</option>`,
    ...sorted.map((value) => `<option value="${value}" ${String(value) === String(current) ? "selected" : ""}>${formatCount(value)}</option>`),
  ].join("");
}

function missionFilterRepOptions(values, current = "All") {
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const text = cleanDisplayText(value);
    if (!text) continue;
    const key = norm(text);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
  }
  unique.sort((a, b) => rankOrder(a) - rankOrder(b) || a.localeCompare(b, undefined, { sensitivity: "base" }));
  return [
    `<option value="All" ${current === "All" ? "selected" : ""}>All</option>`,
    ...unique.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`),
  ].join("");
}

function blueprintSearchItems() {
  const query = norm(state.blueprintSearch);
  const items = allItems().filter((item) => item.name);
  if (!query) return items.slice(0, 24);
  return items.filter((item) => {
    const text = [
      item.name,
      item.type,
      item.subtype,
      item.blueprint,
      ...(item.missions || []).map((m) => [m.type, m.faction, m.title, m.system, ...(m.systems || [])].filter(Boolean).join(" ")),
    ].join(" ").toLowerCase();
    return text.includes(query);
  });
}

function typeOptions() {
  const types = new Set(missionItems().map((item) => collectionCategory(item)));
  return ["All", ...[...types].sort((a, b) => a.localeCompare(b))];
}

function missionTypes() {
  const values = [];
  const seen = new Set();
  for (const mission of missionCatalog()) {
    const value = cleanDisplayText(mission.type);
    if (!value) continue;
    const key = norm(value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function companiesForType(type) {
  return [...new Set(
    missionCatalog()
      .filter((m) => m.type === type)
      .map((m) => m.faction)
      .filter((name) => !isBadLabel(name)),
)].sort((a, b) => a.localeCompare(b));
}

function missionFilterTypeOptions() {
  return missionFilterOptions(missionTypes(), state.missionFilterType);
}

function missionFilterPointOptions() {
  return missionFilterNumberOptions(missionCatalog().map((m) => m.repReward || 0), state.missionFilterPoints);
}

function missionFilterReputationOptions() {
  return missionFilterRepOptions(missionCatalog().map((m) => m.repStanding).filter(Boolean), state.missionFilterReputation);
}

function missionFilterLocationOptions() {
  return missionFilterOptions(
    missionCatalog()
      .map((m) => missionLocation(m))
      .filter((value) => value && norm(value) !== "unknown"),
    state.missionFilterLocation,
    (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function missionFilterDifficultyOptions() {
  return missionFilterOptions(
    missionDifficultyOptionsList(),
    state.missionFilterDifficulty,
    (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function missionFilterMoneyOptions() {
  const missions = missionCatalog();
  const moneyCounts = new Map();
  let unknownCount = 0;

  for (const mission of missions) {
    const money = Number(missionMoneyReward(mission) || 0);
    if (money > 0) {
      moneyCounts.set(money, (moneyCounts.get(money) || 0) + 1);
    } else {
      unknownCount += 1;
    }
  }

  const moneyOptions = [...moneyCounts.entries()].sort((a, b) => a[0] - b[0]);

  return [
    `<option value="All" ${state.missionFilterMoney === "All" ? "selected" : ""}>All</option>`,
    ...moneyOptions.map(([money, count]) => {
      const selected = String(state.missionFilterMoney) === String(money) ? "selected" : "";
      return `<option value="${money}" ${selected}>${formatCount(money)} aUEC (${formatCount(count)})</option>`;
    }),
    `<option value="Unknown" ${state.missionFilterMoney === "Unknown" ? "selected" : ""}>Unknown Money (${formatCount(unknownCount)})</option>`,
  ].join("");
}

function ensureMissionMoneyFilterControl() {
  if (els.missionFilterMoneySelect) return els.missionFilterMoneySelect;

  const anchor = els.missionFilterDifficultySelect?.parentElement;
  if (!anchor || !anchor.parentElement) return null;

  const wrapper = document.createElement("label");
  wrapper.className = anchor.className || "";
  wrapper.innerHTML = `
    Money
    <select id="missionFilterMoneySelect"></select>
  `;

  anchor.insertAdjacentElement("afterend", wrapper);
  els.missionFilterMoneySelect = wrapper.querySelector("select");
  return els.missionFilterMoneySelect;
}

function missionsFor(type, company) {
  const map = new Map();
  for (const m of missionCatalog()) {
    if (m.type === type && m.faction === company && !isBadLabel(m.title)) {
      const key = missionIdentityKey(m);
      if (!map.has(key)) map.set(key, m);
    }
  }
  return [...map.values()].sort((a, b) => missionTitle(a).localeCompare(missionTitle(b)));
}

function rewardsFor(type, company, title) {
  const cache = ensureMissionLookupCache();
  const key = [norm(type || ""), norm(company || ""), missionTitleKey(title || "")].join("::");
  const bucket = cache.rewardsIndex.get(key);
  if (!bucket) return [];
  return [...bucket.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function currentRewardOptions() {
  return rewardsFor(state.missionType, state.company, state.mission);
}

function currentItemDetail() {
  return state.selectedItem || missionItems().find((item) => !isOwned(item.name)) || missionItems()[0] || null;
}

function currentMissionDetail() {
  if (!state.missionType || !state.company || !state.mission) return null;
  const targetKey = missionTitleKey(state.mission);
  const mission =
    missionsFor(state.missionType, state.company).find((m) => missionTitleKey(missionTitle(m)) === targetKey) || null;
  return mission ? augmentMissionWithRewardOverride(augmentMissionWithStructuredData(mission)) : null;
}

function selectMission(type, company, title) {
  state.missionType = type || "";
  state.company = company || "";
  state.mission = title || "";
  state.reward = "";
  state.progressFocus = { kind: "", value: "" };
}

function normalizeRailView(section) {
  if (section === "statistics") return "stats";
  if (section === "buy items" || section === "buy-items") return "buy-items";
  return section;
}

function renderRail() {
  document.querySelectorAll(".rail-item").forEach((button) => {
    const label = (button.getAttribute("aria-label") || "").toLowerCase();
    button.classList.toggle("active", normalizeRailView(label) === state.view);
  });
}

function renderView() {
  document.body.dataset.view = state.view;
  const map = {
    dashboard: {
      stepShell: true,
      leftColumn: true,
      rightColumn: true,
      userPanel: false,
      collectionCard: false,
      detailShell: true,
      progressShell: false,
      statsShell: false,
      settingsShell: false,
      logShell: false,
      searchShell: false,
      missionBrowserShell: false,
    },
    missions: {
      stepShell: false,
      leftColumn: true,
      rightColumn: true,
      userPanel: false,
      collectionCard: false,
      detailShell: true,
      progressShell: false,
      statsShell: false,
      settingsShell: false,
      logShell: false,
      searchShell: false,
      missionBrowserShell: true,
    },
    blueprints: {
      stepShell: false,
      leftColumn: true,
      rightColumn: true,
      userPanel: false,
      collectionCard: true,
      detailShell: true,
      progressShell: false,
      statsShell: false,
      settingsShell: false,
      logShell: false,
      searchShell: false,
      missionBrowserShell: false,
      buyShell: false,
    },
    "buy-items": {
      stepShell: false,
      leftColumn: false,
      rightColumn: false,
      userPanel: false,
      collectionCard: false,
      detailShell: false,
      progressShell: false,
      statsShell: false,
      settingsShell: false,
      logShell: false,
      searchShell: false,
      missionBrowserShell: false,
      buyShell: true,
    },
    progress: {
      stepShell: false,
      leftColumn: true,
      rightColumn: true,
      userPanel: false,
      collectionCard: false,
      detailShell: true,
      progressShell: true,
      statsShell: false,
      settingsShell: false,
      logShell: false,
      searchShell: false,
      missionBrowserShell: false,
    },
    stats: {
      stepShell: false,
      leftColumn: true,
      rightColumn: true,
      userPanel: false,
      collectionCard: false,
      detailShell: false,
      progressShell: false,
      statsShell: true,
      settingsShell: false,
      logShell: false,
      searchShell: false,
      missionBrowserShell: false,
    },
    settings: {
      stepShell: false,
      leftColumn: true,
      rightColumn: true,
      userPanel: false,
      collectionCard: false,
      detailShell: false,
      progressShell: false,
      statsShell: false,
      settingsShell: true,
      logShell: false,
      searchShell: false,
      missionBrowserShell: false,
    },
  }[state.view] || {};

  const elements = {
    leftColumn: document.querySelector(".left-column"),
    userPanel: document.querySelector(".user-panel"),
    stepShell: document.querySelector(".step-shell"),
    collectionCard: document.querySelector(".collection-card"),
    detailShell: document.querySelector(".detail-shell"),
    rightColumn: document.querySelector(".right-column"),
    progressShell: document.querySelector(".progress-shell"),
    statsShell: document.querySelector(".stats-shell"),
    settingsShell: document.querySelector(".settings-shell"),
    logShell: document.querySelector(".log-shell"),
    searchShell: document.querySelector(".search-shell"),
    missionBrowserShell: document.querySelector(".mission-browser-shell"),
    buyShell: document.querySelector(".buy-shell"),
  };

  Object.entries(elements).forEach(([key, el]) => {
    if (!el) return;
    el.hidden = !map[key];
  });

  document.body.classList.toggle("buy-view", state.view === "buy-items");
}

function rewardTypeLabel(item) {
  const category = collectionCategory(item);
  if (category === "armor") return "ARM";
  if (category === "ammo") return "AMMO";
  if (category === "utility") return "UTL";
  if (category === "cooler") return "COL";
  if (category === "power") return "PWR";
  if (category === "quantum drive") return "QDRV";
  if (category === "radar") return "RADR";
  if (category === "fuel") return "FUEL";
  if (category === "shield") return "SHLD";
  if (category === "thruster") return "THR";
  if (category === "ship weapon") return "WPN";
  if (category === "weapon") return "WPN";
  return "UNK";
}

function rewardTypeClass(item) {
  const category = collectionCategory(item);
  if (category === "armor") return "armor";
  if (category === "ammo") return "ammo";
  if (["utility", "cooler", "power", "quantum drive", "radar", "fuel", "shield", "thruster", "ship component", "ship weapon"].includes(category)) return "ship";
  if (category === "weapon") return "weapon";
  return "unknown";
}

function rewardIcon(item) {
  const kind = rewardTypeClass(item);
  const subtype = norm(item?.subtype);
  const name = norm(item?.name);
  const icons = {
    weapon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h9l2-2h3l2-2v-2h-2l-2 2h-2l-2 2H4z"/><path d="M9 13v4m2-4v4"/></svg>`,
    ammo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h3v14H8zM13 6h3v14h-3z"/><path d="M8 18h3M13 20h3"/></svg>`,
    armor: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3.2 8.6-7 10-3.8-1.4-7-5-7-10V6l7-3Z"/><path d="M9 8h6M8.5 15h7"/></svg>`,
    ship: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 8v8l-7 5-7-5V8z"/><path d="M12 7v10M8 11h8M10 5l2 2 2-2"/></svg>`,
    unknown: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 8v4m0 4h.01"/></svg>`,
  };

  if (kind === "armor") {
    if (subtype.includes("helm")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14a6 6 0 1 1 12 0v3H6z"/><path d="M9 17h6"/></svg>`;
    if (subtype.includes("arms")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8v8l3 3m7-11v8l-3 3"/><path d="M10 8h4v10h-4z"/></svg>`;
    if (subtype.includes("legs")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v8l-2 8h4l1-6 1 6h4l-2-8V4"/><path d="M8 12h8"/></svg>`;
    if (subtype.includes("core")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 18 8v8l-6 4-6-4V8z"/><path d="M12 8v8M8 12h8"/></svg>`;
    if (subtype.includes("backpack")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8v11H8z"/><path d="M9 7V5a3 3 0 0 1 6 0v2M10 11h4"/></svg>`;
  }

  if (kind === "weapon") {
    if (subtype.includes("small")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 14h8l4-4h2"/><path d="M10 14v4m2-4v4"/></svg>`;
    if (subtype.includes("medium")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h9l3-3h4"/><path d="M9 13v4m2-4v4"/></svg>`;
    if (subtype.includes("gun")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h10l2-2h4l2-2v-2h-2l-2 2h-2l-2 2H3z"/><path d="M8 12v4"/></svg>`;
    if (name.includes("repeater")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h9l2-2h5"/><path d="M7 10v4M10 10v4M13 10v4"/></svg>`;
  }

  if (kind === "ship") {
    if (name.includes("mining") || name.includes("tractor") || name.includes("scraper")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 13h8l3-3h2"/><path d="M9 10l6 6M11 8l2 2"/></svg>`;
    if (name.includes("cool") || name.includes("heatsink") || name.includes("icebox")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M7 7l10 10M17 7 7 17"/></svg>`;
    if (name.includes("power") || name.includes("plant") || name.includes("generator")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 6 14h5l-1 7 8-12h-5z"/></svg>`;
    if (name.includes("quantum") || name.includes("drive") || name.includes("qdrv")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 8v8l-7 5-7-5V8z"/><path d="M9 12h6M12 9v6"/></svg>`;
    if (name.includes("radar") || name.includes("sensor") || name.includes("scanner")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 8 8"/><path d="M12 12l5-5"/></svg>`;
    if (name.includes("shield") || name.includes("deflector")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3.2 8.6-7 10-3.8-1.4-7-5-7-10V6l7-3Z"/><path d="M9 9h6"/></svg>`;
    if (name.includes("fuel") || name.includes("nozzle") || name.includes("pod")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v12H8z"/><path d="M10 6v8m4-8v8"/><path d="M12 16v4"/></svg>`;
    if (name.includes("weapon") || name.includes("repeater") || name.includes("cannon")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h11l3-3h4"/><path d="M10 12v4M13 10v2"/></svg>`;
    return icons.ship;
  }

  return icons[kind] || icons.unknown;
}

function companyBadge(company) {
  const name = norm(company);
  const logos = {
    "intersec defense solutions": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 7v10l-7 4-7-4V7z"/><path d="M12 7v10M8 11h8"/></svg>
    `,
    "foxwell enforcement": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12v10H6z"/><path d="M6 7l6-4 6 4"/><path d="M9 11h6"/></svg>
    `,
    "headhunters": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8c0-3 2.5-5 5-5s5 2 5 5v6l-5 5-5-5z"/><path d="M10 11h.01M14 11h.01M10 15c1.2 1 2.8 1 4 0"/></svg>
    `,
    "citizens for prosperity": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 20 8l-8 12L4 8z"/><path d="M12 8v8M8 12h8"/></svg>
    `,
    "shubin interstellar": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v8H5z"/><path d="M8 8V5h8v3M8 16v3h8v-3"/></svg>
    `,
  };
  return logos[name] || `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 7v10M7 12h10"/></svg>`;
}

function missionDifficulty(mission) {
  const rank = norm(mission?.repStanding);
  if (rank.includes("elite") || rank.includes("head")) return "Very High";
  if (rank.includes("veteran")) return "High Risk";
  if (rank.includes("sr")) return "High Risk";
  if (rank.includes("contractor")) return "Medium Risk";
  if (rank.includes("jr")) return "Low Risk";
  return "Low Risk";
}

function missionLocation(mission) {
  return mission?.location || mission?.system || (mission?.systems || []).join(", ") || "Unknown";
}

function missionDescription(mission) {
  const tone = mission?.lawful === false ? "Unlawful contract" : "Lawful contract";
  return [
    cleanDisplayText(mission?.description || mission?.summary || mission?.text || ""),
    tone,
    missionLocation(mission),
    missionTitle(mission),
  ]
    .filter(Boolean)
    .join(" · ");
}

function missionAppearanceLines(mission) {
  const lines = [];
  const structuredSummary = cleanDisplayText(mission?.structuredPrereqSummary || "");
  if (structuredSummary) {
    for (const part of structuredSummary.split(/\s*\|\s*/)) {
      const text = cleanDisplayText(part);
      if (text) lines.push(text);
    }
  }

  const requiredCount = Number(mission?.structuredRequiredMissionCount || 0);
  if (requiredCount > 0) lines.push(`Requires ${formatCount(requiredCount)} prior missions`);
  if (Array.isArray(mission?.structuredRequiredMissions) && mission.structuredRequiredMissions.length) {
    lines.push(`Required missions: ${mission.structuredRequiredMissions.join(", ")}`);
  }
  if (Array.isArray(mission?.structuredLocationOptions) && mission.structuredLocationOptions.length) {
    lines.push(`Appears near: ${mission.structuredLocationOptions.join(", ")}`);
  }
  if (Array.isArray(mission?.structuredVariantKinds) && mission.structuredVariantKinds.length) {
    lines.push(`Variants: ${mission.structuredVariantKinds.join(", ")}`);
  }
  if (mission?.structuredRuntimeOnlyPossible) {
    lines.push("Some appearance conditions may still depend on runtime or server state.");
  }

  const fallback = [
    mission?.repStanding ? `Rank: ${cleanDisplayText(mission.repStanding)}` : "",
    mission?.system ? `System: ${cleanDisplayText(mission.system)}` : "",
    mission?.location ? `Location: ${cleanDisplayText(mission.location)}` : "",
    mission?.faction ? `Company: ${cleanDisplayText(mission.faction)}` : "",
  ].filter(Boolean);

  if (!lines.length && fallback.length) lines.push(...fallback);
  if (!lines.length) lines.push("No appearance guidance is available yet.");
  return lines;
}

const MISSION_REWARD_OVERRIDES = {
  [norm("Retrieve Additional Smuggler Intel")]: {
    title: "Retrieve Additional Smuggler Intel",
    type: "Investigation",
    faction: "InterSec Defense Solutions",
    system: "Nyx",
    lawful: true,
    repStanding: "Head Contractor",
    moneyReward: 1000000,
    scriptReward: 1,
  },
};

function missionRewardOverride(mission) {
  return MISSION_REWARD_OVERRIDES[norm(missionTitle(mission))] || null;
}

function missionRewardOverrideRecords() {
  return Object.values(MISSION_REWARD_OVERRIDES)
    .map((entry) => {
      const title = cleanDisplayText(entry?.title || "");
      if (!title) return null;
      return {
        title,
        type: cleanDisplayText(entry?.type || "Unknown"),
        faction: cleanDisplayText(entry?.faction || "Unknown"),
        system: cleanDisplayText(entry?.system || ""),
        location: cleanDisplayText(entry?.location || entry?.system || ""),
        lawful: entry?.lawful === false ? false : true,
        repStanding: cleanDisplayText(entry?.repStanding || "Any rank"),
        moneyReward: firstFiniteNumber(entry?.moneyReward) || null,
        scriptReward: firstFiniteNumber(entry?.scriptReward) || null,
        rewardCount: 0,
        rewards: [],
        source: "override",
      };
    })
    .filter(Boolean);
}

function augmentMissionWithRewardOverride(mission) {
  if (!mission) return mission;
  const override = missionRewardOverride(mission);
  if (!override) return mission;
  return {
    ...mission,
    moneyReward: override.moneyReward ?? mission.moneyReward ?? null,
    scriptReward: override.scriptReward ?? mission.scriptReward ?? null,
    type: mission.type || override.type || "Unknown",
    faction: mission.faction || override.faction || "Unknown",
    system: mission.system || override.system || "",
    location: mission.location || override.location || mission.system || "",
    repStanding: mission.repStanding || override.repStanding || "Any rank",
    lawful: mission.lawful ?? override.lawful ?? true,
    source: mission.source || "override",
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstFiniteNumber(...value);
      if (nested !== null) return nested;
      continue;
    }
    if (value && typeof value === "object") {
      const nested = firstFiniteNumber(
        value.value,
        value.amount,
        value.count,
        value.quantity,
        value.reward,
        value.payout,
        value.auec,
        value.uec,
        value.money,
      );
      if (nested !== null) return nested;
      continue;
    }
    const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function rewardScriptCountFromAny(value) {
  if (Array.isArray(value)) {
    return value.map(rewardScriptCountFromAny).reduce((sum, count) => sum + count, 0);
  }
  if (!value || typeof value !== "object") return 0;
  const text = `${Object.keys(value).join(" ")} ${Object.values(value)
    .map((entry) => cleanDisplayText(entry))
    .join(" ")}`;
  if (!/script/i.test(text)) return 0;
  const count = firstFiniteNumber(value.count, value.amount, value.quantity, value.value, value.rewardAmount, value.rewardCount);
  if (count) return count;
  for (const nested of Object.values(value)) {
    const nestedCount = rewardScriptCountFromAny(nested);
    if (nestedCount > 0) return nestedCount;
  }
  return 1;
}

function rewardMoneyCountFromAny(value) {
  if (Array.isArray(value)) {
    return value.map(rewardMoneyCountFromAny).reduce((sum, count) => sum + count, 0);
  }
  if (!value || typeof value !== "object") return 0;
  const text = `${Object.keys(value).join(" ")} ${Object.values(value)
    .map((entry) => cleanDisplayText(entry))
    .join(" ")}`;
  if (!/(auec|uec|money|cash|payout|credit)/i.test(text)) return 0;
  const count = firstFiniteNumber(
    value.count,
    value.amount,
    value.quantity,
    value.value,
    value.rewardAmount,
    value.rewardCount,
    value.payout,
    value.auec,
    value.uec,
    value.money,
    value.cash,
  );
  if (count) return count;
  for (const nested of Object.values(value)) {
    const nestedCount = rewardMoneyCountFromAny(nested);
    if (nestedCount > 0) return nestedCount;
  }
  return 0;
}

function missionScriptReward(mission) {
  if (!mission) return null;
  const structured = Number(mission.structuredScriptReward || 0);
  if (structured > 0) return structured;
  const override = missionRewardOverride(mission);
  const raw =
    override?.scriptReward ??
    mission?.scriptReward ??
    mission?.scriptAmount ??
    mission?.scriptCount ??
    mission?.rewardScripts ??
    mission?.script ??
    mission?.scripts ??
      mission?.rewardItems ??
      mission?.reward_items ??
      mission?.rewards ??
      mission?.reward;

  if (Array.isArray(raw)) {
    const total = rewardScriptCountFromAny(raw) || firstFiniteNumber(raw);
    return total > 0 ? total : null;
  }

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const match = raw.match(/(\d[\d,]*)/);
    if (match) {
      const total = Number(match[1].replace(/,/g, ""));
      return Number.isFinite(total) && total > 0 ? total : null;
    }
  }

  if (raw && typeof raw === "object") {
    const value = Number(raw.count ?? raw.amount ?? raw.quantity ?? raw.value ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }

  const rewardCount = rewardScriptCountFromAny(mission?.rewardItems || mission?.reward_items || mission?.rewards || mission?.reward || []);
  if (rewardCount > 0) return rewardCount;

  return null;
}

function missionMoneyReward(mission) {
  if (!mission) return 0;

  const override = missionRewardOverride(mission);
  const structured = Number(mission.structuredMoneyReward || 0);
  if (structured > 0) return structured;

  const direct = firstFiniteNumber(
    override?.moneyReward,
    mission?.moneyReward,
    mission?.auecReward,
    mission?.uecReward,
    mission?.cashReward,
    mission?.rewardMoney,
    mission?.rewardCash,
    mission?.payout,
    mission?.money_reward,
    mission?.reward_money,
    mission?.reward_value,
    mission?.rewardAmount,
    mission?.reward_amount,
  );
  if (direct !== null && direct > 0) return direct;

  const rewardObjects = Array.isArray(mission?.rewardItems)
    ? mission.rewardItems
    : Array.isArray(mission?.reward_items)
      ? mission.reward_items
      : Array.isArray(mission?.rewards)
        ? mission.rewards
        : Array.isArray(mission?.reward)
          ? mission.reward
          : [];

  const fromRewards = rewardMoneyCountFromAny(rewardObjects);
  if (fromRewards > 0) return fromRewards;

  const text = [
    mission?.rewardText,
    mission?.reward_text,
    mission?.rewardSummary,
    mission?.structuredRewardSummary,
    mission?.description,
    mission?.summary,
    mission?.text,
    mission?.structuredDescription,
  ]
    .map((value) => cleanDisplayText(value))
    .filter(Boolean)
    .join(" ");

  if (text) {
    const moneyPatterns = [
      /\b(?:money reward|cash reward|payout|reward|pays?|payment)\s*[:\-]?\s*(\d[\d,]*)\s*(?:auec|uec|credits?)\b/i,
      /\b(\d[\d,]*)\s*(?:auec|uec|credits?)\b/i,
    ];

    for (const pattern of moneyPatterns) {
      const match = text.match(pattern);
      if (match) {
        const total = Number(String(match[1] || "").replace(/,/g, ""));
        if (Number.isFinite(total) && total > 0) return total;
      }
    }
  }

  return 0;
}

function missionHasScriptReward(mission) {
  return Number(missionScriptReward(mission) || 0) > 0;
}

function missionHasKnownMoneyReward(mission) {
  return Number(missionMoneyReward(mission) || 0) > 0;
}

function missionMoneyRewardLabel(mission) {
  if (!missionHasKnownMoneyReward(mission)) return "Unknown";
  return `${formatCount(missionMoneyReward(mission))} aUEC`;
}

function missionDifficultyOptionsList() {
  return ["Low Risk", "Medium Risk", "High Risk", "Very High"];
}

function rankOrder(rank) {
  const value = norm(rank);
  if (value.includes("neutral")) return 0;
  if (value.includes("jr")) return 1;
  if (value.includes("contractor")) return 2;
  if (value.includes("sr")) return 3;
  if (value.includes("veteran")) return 4;
  if (value.includes("head")) return 5;
  if (value.includes("elite")) return 6;
  return -1;
}

function highestCompletedRank(company) {
  let best = null;
  for (const log of state.logs) {
    if (log.company !== company) continue;
    const mission = missionsFor(log.type, log.company).find((m) => missionTitleKey(m) === missionTitleKey(log.mission));
    if (!mission?.repStanding) continue;
    if (!best || rankOrder(mission.repStanding) > rankOrder(best.repStanding)) best = mission;
  }
  return best;
}

function clearWizardSelection() {
  state.missionType = "";
  state.company = "";
  state.mission = "";
  state.reward = "";
  state.customReward = "";
}

function formatMissionRequirement(m) {
  const rank = cleanDisplayText(m?.structuredRequiredRank || m?.repStanding || "") || "Any rank";
  const missionCount = Number(m?.structuredRequiredMissionCount || 0);
  const countText = missionCount > 0 ? `, ${formatCount(missionCount)} missions` : "";
  const rep = typeof m.minRep === "number" ? `, ${formatCount(m.minRep)} rep` : "";
  const system = m.system || (m.systems || []).join(", ") || "Unknown system";
  return `${rank}${countText}${rep} - ${system}`;
}

function renderSummary() {
  const total = missionItems().length;
  const owned = missionItems().filter((item) => isOwned(item.name)).length;
  const missing = total - owned;

  const ownedByType = new Map();
  const missingByType = new Map();
  for (const item of missionItems()) {
    const map = isOwned(item.name) ? ownedByType : missingByType;
    map.set(collectionCategory(item), (map.get(collectionCategory(item)) || 0) + 1);
  }

  const renderRows = (map, mode) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(
        ([label, count]) => `
          <button class="summary-row" type="button" data-collection-filter data-collection-filter-mode="${mode}" data-collection-filter-chip="${label}">
            <div class="name"><span class="dot"></span>${label}</div>
            <div class="value">${formatCount(count)}</div>
          </button>
        `,
      )
      .join("");

  els.ownedTotal.textContent = formatCount(owned);
  els.missingTotal.textContent = formatCount(missing);
  els.ownedBreakdown.innerHTML = renderRows(ownedByType, "owned");
  els.missingBreakdown.innerHTML = renderRows(missingByType, "missing");
  els.footerOwned.textContent = `Owned: ${formatCount(owned)}`;
  els.footerMissing.textContent = `Missing: ${formatCount(missing)}`;
  const footerBits = [];
  footerBits.push(state.watch.name ? `Watching: ${state.watch.name}` : "No monitored file");
  if (state.scminersDb?.status) footerBits.push(state.scminersDb.status);
  els.footerWatch.textContent = footerBits.join(" · ");
}

function renderUsers() {
  const userOptions = state.users
    .map((user, index) => `<option value="${user.id}" ${user.id === state.currentUserId ? "selected" : ""}>${index + 1}. ${user.name}</option>`)
    .join("");

  els.userSelect.innerHTML = userOptions;
  els.userSelectSide.innerHTML = userOptions;
  els.userCount.textContent = formatCount(state.users.length);
  const current = currentUser();
  els.currentUserName.textContent = current?.name || "Default";
  els.currentUserIndex.textContent = String(state.users.findIndex((user) => user.id === state.currentUserId) + 1 || 1);
}

function renderChips() {
  els.typeChips.innerHTML = typeOptions()
    .map((type) => `<button class="chip ${state.chip === type ? "active" : ""}" data-chip="${type}">${type}</button>`)
    .join("");
  document.querySelectorAll(".seg[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.collectionMode);
  });
}

function renderCollection() {
  const groups = new Map();
  for (const item of visibleItems()) {
    const category = collectionCategory(item);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }

  const html = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, list], idx) => {
      const open = idx === 0 ? "open" : "";
      return `
        <details class="group" ${open}>
          <summary>
            <strong>${type}</strong>
            <span class="count">${formatCount(list.length)}</span>
          </summary>
          ${list
            .map(
              (item) => `
                <div class="item" data-item="${item.name}">
                  <strong>${item.name}</strong>
                  <small>${item.subtype || "unknown"} · ${item.missions?.length || 0} mission links · ${isOwned(item.name) ? "owned" : "missing"}</small>
                </div>
              `,
            )
            .join("")}
        </details>
      `;
    })
    .join("");

  els.collectionList.innerHTML = html || `<div class="muted">No items match this filter.</div>`;
}

function renderWizard() {
  const types = missionTypes();
  if (!types.includes(state.missionType)) state.missionType = "";

  const companies = companiesForType(state.missionType);
  if (!companies.includes(state.company)) state.company = "";

  const missions = missionsFor(state.missionType, state.company);
  if (!missions.some((m) => missionTitle(m) === state.mission)) state.mission = "";

  const rewards = currentRewardOptions();
  if (!rewards.some((r) => r.name === state.reward) && state.reward !== "__other__") state.reward = "";

  els.missionTypeSelect.innerHTML = [
    `<option value="" ${state.missionType === "" ? "selected" : ""} hidden></option>`,
    ...types.map((type) => `<option ${type === state.missionType ? "selected" : ""}>${type}</option>`),
  ].join("");
  els.companySelect.innerHTML = [
    `<option value="" ${state.company === "" ? "selected" : ""} hidden></option>`,
    ...companies.map((company) => `<option ${company === state.company ? "selected" : ""}>${company}</option>`),
  ].join("");
  els.missionSelect.innerHTML = [
    `<option value="" ${state.mission === "" ? "selected" : ""} hidden></option>`,
    ...missions.map((m) => `<option ${missionTitle(m) === state.mission ? "selected" : ""}>${missionTitle(m)}</option>`),
  ].join("");
  els.rewardSelect.innerHTML = [
    `<option value="" ${state.reward === "" ? "selected" : ""} hidden></option>`,
    ...rewards.map((item) => `<option value="${item.name}" ${item.name === state.reward ? "selected" : ""}>${item.name}</option>`),
    `<option value="__other__" ${state.reward === "__other__" ? "selected" : ""}>Other / not listed</option>`,
  ].join("");

  els.missionStatus.textContent = state.missionType || state.company || state.mission ? `${state.missionType || "Type"} / ${state.company || "Company"} / ${state.mission || "Mission"}` : "Ready";
  els.customReward.value = state.customReward || "";

  const companyStepIcon = document.querySelectorAll(".step-card .step-icon.cyan")[0];
  if (companyStepIcon) {
    companyStepIcon.classList.add("company-badge");
    companyStepIcon.innerHTML = companyBadge(state.company || "InterSec Defense Solutions");
  }

  const stepValues = [
    Boolean(state.missionType),
    Boolean(state.company),
    Boolean(state.mission),
    Boolean(state.reward || state.customReward),
  ];
  const dots = document.querySelectorAll(".step-dots .dot");
  dots.forEach((dot, index) => {
    dot.classList.toggle("done", stepValues[index]);
  });
}

function renderSelectedOld() {
  if (state.view === "blueprints") {
    const item = state.selectedItem || currentItemDetail();
    if (!item) {
      els.selectedDetails.className = "detail-card empty";
      els.selectedDetails.textContent = "Pick a blueprint on the left to see its details here.";
      els.selectedMeta.textContent = "Nothing selected";
      return;
    }

    const missions = item.missions || [];
    els.selectedMeta.textContent = `${item.type} · ${item.subtype || "unknown"} · ${isOwned(item.name) ? "owned" : "missing"}`;
    els.selectedDetails.className = "detail-card";
    els.selectedDetails.innerHTML = `
      <div class="detail-grid">
        <div class="detail-kv"><span>Blueprint</span><strong>${item.name}</strong></div>
        <div class="detail-kv"><span>Category</span><strong>${item.type} / ${item.subtype || "unknown"}</strong></div>
        <div class="detail-kv"><span>Reward links</span><strong>${formatCount(missions.length)}</strong></div>
        <div class="detail-kv"><span>Status</span><strong>${isOwned(item.name) ? "Already owned" : "Still needed"}</strong></div>
        <div class="detail-kv">
          <span>Actions</span>
          <div class="wizard-actions">
            ${isOwned(item.name) ? `<button class="ghost-button" type="button" data-action="remove-owned">Remove from owned</button>` : `<button class="primary-button" type="button" data-action="mark-owned">Add to owned</button>`}
          </div>
        </div>
      <div class="detail-kv">
        <span>Mission links</span>
        <div class="mission-list">
          ${missions.map((m) => `<button class="mission-line mission-link" type="button" data-mission-link data-mission-type="${m.type || ""}" data-mission-company="${m.faction || ""}" data-mission-title="${missionTitle(m)}"><div><strong>${m.type}</strong> · ${m.faction || "Unknown"}</div><div>${missionTitle(m)}</div><div class="muted">${formatMissionRequirement(m)}</div></button>`).join("")}
        </div>
      </div>
    </div>
  `;
  return;
  }

  if (state.view === "progress") {
    const focus = state.progressFocus || { kind: "", value: "" };
    const kind = focus.kind || "summary";
    const value = focus.value || "";
    const owned = missionItems().filter((item) => isOwned(item.name));
    const missing = missionItems().filter((item) => !isOwned(item.name));

    if (kind === "type" && value) {
      const ownedOfType = owned.filter((item) => collectionCategory(item) === value);
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      els.selectedMeta.textContent = `Type · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-kv"><span>Owned</span><strong>${formatCount(ownedOfType.length)}</strong></div>
          <div class="detail-kv"><span>Missing</span><strong>${formatCount(missingOfType.length)}</strong></div>
          <div class="detail-kv"><span>Owned list</span><div class="mission-list">${ownedOfType.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${item.subtype || "unknown"}</div></div>`).join("") || `<div class="muted">None owned.</div>`}</div></div>
          <div class="detail-kv"><span>Missing list</span><div class="mission-list">${missingOfType.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${item.subtype || "unknown"}</div></div>`).join("") || `<div class="muted">Nothing missing.</div>`}</div></div>
        </div>
      `;
      return;
    }

    if (kind === "company" && value) {
      const completed = state.logs.filter((log) => log.company === value);
      const best = highestCompletedRank(value);
      const bestLabel = best ? `${best.repStanding} · ${best.title}` : "No rank yet";
      els.selectedMeta.textContent = `Company · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-kv"><span>Current rank</span><strong>${bestLabel}</strong></div>
          <div class="detail-kv"><span>Completed missions</span><strong>${formatCount(completed.length)}</strong></div>
          <div class="detail-kv"><span>Mission history</span><div class="mission-list">${completed.map((log) => `<div class="mission-line"><strong>${log.mission}</strong><div class="muted">${log.type} · ${log.reward || "reward logged"}</div></div>`).join("") || `<div class="muted">No missions logged yet.</div>`}</div></div>
        </div>
      `;
      return;
    }

    if (kind === "missing" && value) {
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      els.selectedMeta.textContent = `Still needed · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-kv"><span>Missing count</span><strong>${formatCount(missingOfType.length)}</strong></div>
          <div class="detail-kv"><span>Missing items</span><div class="mission-list">${missingOfType.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${item.subtype || "unknown"}</div></div>`).join("")}</div></div>
        </div>
      `;
      return;
    }

    els.selectedMeta.textContent = "Progress";
    els.selectedDetails.className = "detail-card empty";
    els.selectedDetails.textContent = "Pick a type, company, or missing item to see details here.";
    return;
  }

  if (state.view === "progress") {
    const focus = state.progressFocus || { kind: "", value: "" };
    const kind = focus.kind || "summary";
    const value = focus.value || "";
    const subtype = state.progressSubtype || "";
    const owned = missionItems().filter((item) => isOwned(item.name));
    const missing = missionItems().filter((item) => !isOwned(item.name));

    if (kind === "type" && value) {
      const subtypeOptions = progressSubtypeOptions(value);
      const matchesSubtype = (item) => !subtype || progressSubtypeLabel(item) === subtype;
      const ownedOfType = owned.filter((item) => collectionCategory(item) === value);
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      const ownedFiltered = ownedOfType.filter(matchesSubtype);
      const missingFiltered = missingOfType.filter(matchesSubtype);
      els.selectedMeta.textContent = `Type · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-filterbar">
          <button class="chip ${!subtype ? "active" : ""}" type="button" data-progress-subtype="">All</button>
          ${subtypeOptions.map((label) => `<button class="chip ${subtype === label ? "active" : ""}" type="button" data-progress-subtype="${label}">${label}</button>`).join("")}
        </div>
        <div class="detail-grid detail-split">
          <div class="detail-kv">
            <span>Owned</span>
            <strong>${formatCount(ownedFiltered.length)}</strong>
            <div class="mission-list">${ownedFiltered.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${progressSubtypeLabel(item)}</div></div>`).join("") || `<div class="muted">None owned.</div>`}</div>
          </div>
          <div class="detail-kv">
            <span>Missing</span>
            <strong>${formatCount(missingFiltered.length)}</strong>
            <div class="mission-list">${missingFiltered.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${progressSubtypeLabel(item)}</div></div>`).join("") || `<div class="muted">Nothing missing.</div>`}</div>
          </div>
        </div>
      `;
      return;
    }

    if (kind === "company" && value) {
      state.progressSubtype = "";
      const completed = state.logs.filter((log) => log.company === value);
      const best = highestCompletedRank(value);
      const bestLabel = best ? `${best.repStanding} · ${best.title}` : "No rank yet";
      els.selectedMeta.textContent = `Company · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-kv"><span>Current rank</span><strong>${bestLabel}</strong></div>
          <div class="detail-kv"><span>Completed missions</span><strong>${formatCount(completed.length)}</strong></div>
          <div class="detail-kv"><span>Mission history</span><div class="mission-list">${completed.map((log) => `<button class="mission-line mission-link" type="button" data-mission-link="${log.type}::${log.company}::${log.mission}"><strong>${log.mission}</strong><div class="muted">${log.type} · ${log.reward || "reward logged"}</div></button>`).join("") || `<div class="muted">No missions logged yet.</div>`}</div></div>
        </div>
      `;
      return;
    }

    if (kind === "missing" && value) {
      const subtypeOptions = progressSubtypeOptions(value);
      const matchesSubtype = (item) => !subtype || progressSubtypeLabel(item) === subtype;
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      const missingFiltered = missingOfType.filter(matchesSubtype);
      els.selectedMeta.textContent = `Still needed · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-filterbar">
          <button class="chip ${!subtype ? "active" : ""}" type="button" data-progress-subtype="">All</button>
          ${subtypeOptions.map((label) => `<button class="chip ${subtype === label ? "active" : ""}" type="button" data-progress-subtype="${label}">${label}</button>`).join("")}
        </div>
        <div class="detail-grid">
          <div class="detail-kv"><span>Missing count</span><strong>${formatCount(missingFiltered.length)}</strong></div>
          <div class="detail-kv"><span>Missing items</span><div class="mission-list">${missingFiltered.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${progressSubtypeLabel(item)}</div></div>`).join("")}</div></div>
        </div>
      `;
      return;
    }

    els.selectedMeta.textContent = "Progress";
    els.selectedDetails.className = "detail-card empty";
    els.selectedDetails.textContent = "Pick a type, company, or missing item to see details here.";
    return;
  }

  const mission = currentMissionDetail();
  if (!mission) {
    els.selectedDetails.className = "detail-card empty";
    els.selectedDetails.textContent = "Pick a mission on the left to see the live reward details here.";
    els.selectedMeta.textContent = "Nothing selected";
    return;
  }

  const rewards = currentRewardOptions();
  const missingRewards = rewards.filter((item) => !isOwned(item.name));

  els.selectedMeta.textContent = `${mission.type} · ${mission.faction || "Unknown"} · ${mission.repStanding || "Any rank"}`;
  els.selectedDetails.className = "detail-card";
  els.selectedDetails.innerHTML = `
    <div class="detail-grid">
      <div class="detail-kv"><span>Mission</span><strong>${missionTitle(mission)}</strong></div>
      <div class="detail-kv"><span>Company</span><strong>${mission.faction || "Unknown"}</strong></div>
      <div class="detail-kv"><span>Type</span><strong>${mission.type || "Unknown"}</strong></div>
      <div class="detail-kv"><span>Reputation</span><strong>${formatMissionRequirement(mission)}</strong></div>
      <div class="detail-kv"><span>Reward links</span><strong>${formatCount(rewards.length)}</strong></div>
      <div class="detail-kv"><span>Rewards left</span><strong>${formatCount(missingRewards.length)}</strong></div>
      <div class="detail-kv">
        <span>Mission description</span>
        <div class="mission-line">
          ${mission.lawful ? "Lawful contract" : "Unlawful contract"} · ${mission.system || "Unknown system"} · ${missionTitle(mission)}
        </div>
      </div>
      <div class="detail-kv">
        <span>Possible rewards</span>
        <div class="mission-list">
          ${rewards
            .map(
              (item) => `
                <div class="mission-line">
                  <div class="reward-row">
                    <span class="reward-badge ${rewardTypeClass(item)}">${rewardTypeLabel(item)}</span>
                    <strong>${item.name}</strong>
                  </div>
                  <div class="muted">${isOwned(item.name) ? "Owned" : "Still needed"}</div>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderSelected() {
  if (state.view === "blueprints") {
    const item = state.selectedItem || currentItemDetail();
    if (!item) {
      els.selectedDetails.className = "detail-card empty";
      els.selectedDetails.textContent = "Pick a blueprint on the left to see its details here.";
      els.selectedMeta.textContent = "Nothing selected";
      return;
    }

    const missions = item.missions || [];
    const crafting = blueprintCraftingData(item);
    const dismantleEntries = crafting.dismantles;
    const craftTimeSeconds = Number(crafting.recipe?.tiers?.[0]?.craft_time_seconds || crafting.recipe?.recipe_time_seconds || item.craftTime || 0);
    els.selectedMeta.textContent = `${item.type} · ${item.subtype || "unknown"} · ${isOwned(item.name) ? "owned" : "missing"}`;
    els.selectedDetails.className = "detail-card";
    els.selectedDetails.innerHTML = `
      <div class="detail-grid">
        <div class="detail-kv"><span>Blueprint</span><strong>${item.name}</strong></div>
        <div class="detail-kv"><span>Category</span><strong>${item.type} / ${item.subtype || "unknown"}</strong></div>
        <div class="detail-kv"><span>Reward links</span><strong>${formatCount(missions.length)}</strong></div>
        <div class="detail-kv"><span>Status</span><strong>${isOwned(item.name) ? "Already owned" : "Still needed"}</strong></div>
        <div class="detail-kv"><span>Craftable</span><strong>${item.craftable ? "Yes" : "No"}</strong></div>
        <div class="detail-kv"><span>Craft time</span><strong>${craftTimeSeconds ? `${formatCount(craftTimeSeconds)} sec` : "Unknown"}</strong></div>
        <div class="detail-kv">
          <span>Actions</span>
          <div class="wizard-actions">
            ${isOwned(item.name) ? `<button class="ghost-button" type="button" data-action="remove-owned">Remove from collection</button>` : `<button class="primary-button" type="button" data-action="mark-owned">Add to collection</button>`}
          </div>
        </div>
        <div class="detail-kv">
          <span>Crafting ingredients</span>
          <div class="mission-list">
            ${renderCraftingIngredientMarkup(item, crafting.recipe)}
          </div>
        </div>
        <div class="detail-kv">
          <span>Dismantle returns</span>
          <div class="mission-list">
            ${renderDismantleMarkup(dismantleEntries)}
          </div>
        </div>
        <div class="detail-kv">
          <span>Mission links</span>
          <div class="mission-list">
            ${missions.map((m) => `<button class="mission-line mission-link" type="button" data-mission-link data-mission-type="${m.type || ""}" data-mission-company="${m.faction || ""}" data-mission-title="${missionTitle(m)}"><div><strong>${m.type}</strong> · ${m.faction || "Unknown"}</div><div>${missionTitle(m)}</div><div class="muted">${formatMissionRequirement(m)}</div></button>`).join("")}
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (state.view === "progress") {
    const focus = state.progressFocus || { kind: "", value: "" };
    const kind = focus.kind || "summary";
    const value = focus.value || "";
    const subtype = state.progressSubtype || "";
    const owned = missionItems().filter((item) => isOwned(item.name));
    const missing = missionItems().filter((item) => !isOwned(item.name));

    if (kind === "type" && value) {
      const subtypeOptions = progressSubtypeOptions(value);
      const matchesSubtype = (item) => !subtype || progressSubtypeLabel(item) === subtype;
      const ownedOfType = owned.filter((item) => collectionCategory(item) === value);
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      const ownedFiltered = ownedOfType.filter(matchesSubtype);
      const missingFiltered = missingOfType.filter(matchesSubtype);
      els.selectedMeta.textContent = `Type · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-filterbar">
          <button class="chip ${!subtype ? "active" : ""}" type="button" data-progress-subtype="">All</button>
          ${subtypeOptions.map((label) => `<button class="chip ${subtype === label ? "active" : ""}" type="button" data-progress-subtype="${label}">${label}</button>`).join("")}
        </div>
        <div class="detail-grid">
          <div class="detail-kv"><span>Owned</span><strong>${formatCount(ownedFiltered.length)}</strong></div>
          <div class="detail-kv"><span>Missing</span><strong>${formatCount(missingFiltered.length)}</strong></div>
          <div class="detail-kv"><span>Owned list</span><div class="mission-list">${ownedFiltered.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${progressSubtypeLabel(item)}</div></div>`).join("") || `<div class="muted">None owned.</div>`}</div></div>
          <div class="detail-kv"><span>Missing list</span><div class="mission-list">${missingFiltered.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${progressSubtypeLabel(item)}</div></div>`).join("") || `<div class="muted">Nothing missing.</div>`}</div></div>
        </div>
      `;
      return;
    }

    if (kind === "company" && value) {
      state.progressSubtype = "";
      const completed = state.logs.filter((log) => log.company === value);
      const best = highestCompletedRank(value);
      const bestLabel = best ? `${best.repStanding} · ${best.title}` : "No rank yet";
      els.selectedMeta.textContent = `Company · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-kv"><span>Current rank</span><strong>${bestLabel}</strong></div>
          <div class="detail-kv"><span>Completed missions</span><strong>${formatCount(completed.length)}</strong></div>
          <div class="detail-kv"><span>Mission history</span><div class="mission-list">${completed.map((log) => `<div class="mission-line"><strong>${log.mission}</strong><div class="muted">${log.type} · ${log.reward || "reward logged"}</div></div>`).join("") || `<div class="muted">No missions logged yet.</div>`}</div></div>
        </div>
      `;
      return;
    }

    if (kind === "missing" && value) {
      const subtypeOptions = progressSubtypeOptions(value);
      const matchesSubtype = (item) => !subtype || progressSubtypeLabel(item) === subtype;
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      const missingFiltered = missingOfType.filter(matchesSubtype);
      els.selectedMeta.textContent = `Still needed · ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-filterbar">
          <button class="chip ${!subtype ? "active" : ""}" type="button" data-progress-subtype="">All</button>
          ${subtypeOptions.map((label) => `<button class="chip ${subtype === label ? "active" : ""}" type="button" data-progress-subtype="${label}">${label}</button>`).join("")}
        </div>
        <div class="detail-grid">
          <div class="detail-kv"><span>Missing count</span><strong>${formatCount(missingFiltered.length)}</strong></div>
          <div class="detail-kv"><span>Missing items</span><div class="mission-list">${missingFiltered.map((item) => `<div class="mission-line"><strong>${item.name}</strong><div class="muted">${progressSubtypeLabel(item)}</div></div>`).join("")}</div></div>
        </div>
      `;
      return;
    }

    els.selectedMeta.textContent = "Progress";
    els.selectedDetails.className = "detail-card empty";
    els.selectedDetails.textContent = "Pick a type, company, or missing item to see details here.";
    return;
  }

    const mission = currentMissionDetail();
  if (!mission) {
    els.selectedDetails.className = "detail-card empty";
    els.selectedDetails.textContent = "Pick a mission on the left to see the live reward details here.";
    els.selectedMeta.textContent = "Nothing selected";
    return;
  }

  const rewards = currentRewardOptions();
  const missingRewards = rewards.filter((item) => !isOwned(item.name));
  const moneyReward = missionMoneyReward(mission);
  const moneyRewardLabel = missionMoneyRewardLabel(mission);
  const scriptReward = missionScriptReward(mission);
  const structuredPrereqSummary = cleanDisplayText(mission.structuredPrereqSummary || "");
  const appearanceLines = missionAppearanceLines(mission).filter(Boolean);

  els.selectedMeta.textContent = `${mission.type || "Mission"} · ${mission.faction || "Unknown"} · ${mission.repStanding || "Any rank"}`;
  els.selectedDetails.className = "detail-card mission-detail";
  els.selectedDetails.innerHTML = `
    <div class="mission-hero">
      <div class="mission-hero-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 20 7v10l-8 4-8-4V7z" />
          <path d="M12 7v10M8 11h8" />
        </svg>
      </div>
      <div class="mission-hero-copy">
        <div class="mission-hero-title">${missionTitle(mission)}</div>
        <div class="mission-hero-company"><span class="company-badge-inline">${companyBadge(mission.faction || "Unknown")}</span><span>${mission.faction || "Unknown"}</span></div>
      </div>
    </div>
    <div class="mission-metrics">
      <div class="mission-metric">
        <span>Type</span>
        <strong>${mission.type || "Unknown"}</strong>
      </div>
      <div class="mission-metric">
        <span>Points</span>
        <strong>${formatCount(mission.repReward || 0)}</strong>
      </div>
      <div class="mission-metric">
        <span>Money</span>
        <strong>${moneyRewardLabel}</strong>
      </div>
      ${scriptReward ? `
      <div class="mission-metric">
        <span>Script</span>
        <strong>${formatCount(scriptReward)}</strong>
      </div>` : ""}
      <div class="mission-metric">
        <span>Difficulty</span>
        <strong>${missionDifficulty(mission)}</strong>
      </div>
      <div class="mission-metric">
        <span>Reputation</span>
        <strong>${mission.repStanding || "Any rank"}</strong>
      </div>
      <div class="mission-metric">
        <span>Location</span>
        <strong>${missionLocation(mission)}</strong>
      </div>
    </div>
    <div class="mission-section">
      <div class="mission-section-head">
        <span>Mission Description</span>
        <span>${formatCount(mission.repReward || 0)} points · ${moneyRewardLabel}${scriptReward ? ` · ${formatCount(scriptReward)} script` : ""}</span>
      </div>
      <p class="mission-description">${missionDescription(mission)}. Points for completion: ${formatCount(mission.repReward || 0)}. Money reward: ${moneyRewardLabel}.${scriptReward ? ` Script reward: ${formatCount(scriptReward)}.` : ""}</p>
    </div>
    <div class="mission-section">
      <div class="mission-section-head">
        <span>Possible Rewards</span>
        <span>Total: ${rewards.length ? formatCount(rewards.length) : "0"}</span>
      </div>
      <div class="mission-summary-line">Rewards left: ${formatCount(missingRewards.length)} · Points: ${formatCount(mission.repReward || 0)} · Money: ${moneyRewardLabel}${scriptReward ? ` · Script: ${formatCount(scriptReward)}` : ""}</div>
      <div class="mission-list compact">
        ${rewards.length
          ? rewards
              .map(
                (item) => `
                  <button class="reward-line mission-link" type="button" data-blueprint="${item.name}">
                    <div class="reward-row">
                      <span class="reward-icon ${rewardTypeClass(item)}">${rewardIcon(item)}</span>
                      <div class="reward-copy">
                        <strong>${item.name}</strong>
                        <div class="muted">${isOwned(item.name) ? "Owned" : "Still needed"}</div>
                      </div>
                    </div>
                    <span class="reward-badge ${rewardTypeClass(item)}">${rewardTypeLabel(item)}</span>
                  </button>
                `,
              )
              .join("")
          : `<div class="muted">No rewards for this mission.</div>`}
      </div>
    </div>
    <div class="mission-section">
      <div class="mission-section-head">
        <span>How to Make This Mission Appear</span>
        <span>${structuredPrereqSummary ? "Mission prereqs" : "Best known conditions"}</span>
      </div>
      <div class="mission-list compact">
        ${appearanceLines
          .map((line) => `<div class="mission-line"><strong>${line}</strong></div>`)
          .join("")}
      </div>
    </div>
  `;
}

function renderMissionBrowser() {
  if (!els.missionSearchInput || !els.missionSearchResults) return;
  els.missionSearchInput.value = state.missionSearch || "";
  if (els.missionSearchReset) els.missionSearchReset.hidden = false;
  const moneyFilterSelect = ensureMissionMoneyFilterControl();

  if (els.missionFilterTypeSelect) els.missionFilterTypeSelect.innerHTML = missionFilterTypeOptions();
  if (els.missionFilterPointsSelect) els.missionFilterPointsSelect.innerHTML = missionFilterPointOptions();
  if (els.missionFilterReputationSelect) els.missionFilterReputationSelect.innerHTML = missionFilterReputationOptions();
  if (els.missionFilterLocationSelect) els.missionFilterLocationSelect.innerHTML = missionFilterLocationOptions();
  if (els.missionFilterDifficultySelect) els.missionFilterDifficultySelect.innerHTML = missionFilterDifficultyOptions();
  if (moneyFilterSelect) moneyFilterSelect.innerHTML = missionFilterMoneyOptions();

  if (els.missionFilterTypeSelect) els.missionFilterTypeSelect.value = state.missionFilterType || "All";
  if (els.missionFilterPointsSelect) els.missionFilterPointsSelect.value = state.missionFilterPoints || "All";
  if (els.missionFilterReputationSelect) els.missionFilterReputationSelect.value = state.missionFilterReputation || "All";
  if (els.missionFilterLocationSelect) els.missionFilterLocationSelect.value = state.missionFilterLocation || "All";
  if (els.missionFilterDifficultySelect) els.missionFilterDifficultySelect.value = state.missionFilterDifficulty || "All";
  if (moneyFilterSelect) moneyFilterSelect.value = state.missionFilterMoney || "All";
  if (els.missionScriptOnlyToggle) {
    els.missionScriptOnlyToggle.classList.toggle("active", Boolean(state.missionScriptOnly));
    els.missionScriptOnlyToggle.textContent = state.missionScriptOnly ? "All missions" : "Script";
  }

  if (state.view !== "missions") {
    els.missionSearchResults.innerHTML = `<div class="muted">Open Missions to browse every mission and its details.</div>`;
    return;
  }
  if (!state.liveMissions.length && !state.liveMissionsStatus && !liveMissionLoadPromise) {
    void loadLiveMissionContracts();
  }

  const results = missionSearchItems();
  const selectedKey = `${norm(state.missionType || "")}::${norm(state.company || "")}::${missionTitleKey(state.mission || "")}`;
  els.missionSearchResults.innerHTML = `
      <div class="search-summary">${formatCount(results.length)} missions</div>
      ${state.liveMissionsStatus ? `<div class="muted" style="margin:6px 0 10px;">${state.liveMissionsStatus}</div>` : ""}
      <div class="timeline">
        ${results
        .map((mission) => {
          const scriptReward = missionScriptReward(mission);
          const rewardLabel = mission.rewardCount ? `${formatCount(mission.rewardCount)} reward${mission.rewardCount === 1 ? "" : "s"}` : "No rewards";
          const moneyLabel = ` · ${missionMoneyRewardLabel(mission)}`;
          const scriptLabel = scriptReward ? ` · ${formatCount(scriptReward)} script` : "";
          const missionKey = `${norm(mission.type || "")}::${norm(mission.faction || "")}::${missionTitleKey(mission)}`;
          const selected = missionKey === selectedKey ? " selected" : "";
          return `
            <button
              class="log-card search-result${selected}"
              type="button"
              data-mission="${missionKey}"
              data-mission-type="${mission.type || ""}"
              data-mission-company="${mission.faction || ""}"
              data-mission-title="${missionTitle(mission)}"
            >
              <div class="reward">${missionTitle(mission)}</div>
              <div class="meta">
                <span>${mission.type || "Unknown"}</span>
                <span>${mission.faction || "Unknown"}</span>
                <span>${mission.repStanding || "Any rank"}</span>
                <span>${missionLocation(mission)}</span>
                <span>${rewardLabel}${moneyLabel}${scriptLabel}</span>
              </div>
              <div class="muted mission-snippet">${missionDescription(mission)}</div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderLogs() {
  if (!els.missionLog) return;
  if (!state.logs.length) {
    els.missionLog.innerHTML = `<div class="muted">No mission logs yet. Log a reward from the wizard and it will show here.</div>`;
    return;
  }

  els.missionLog.innerHTML = state.logs
    .slice()
    .reverse()
    .map(
      (entry) => `
        <article class="log-card">
          <div class="meta">
            <span>${new Date(entry.at).toLocaleString()}</span>
            <span>${entry.type}</span>
            <span>${entry.company}</span>
            <span>${entry.mission}</span>
          </div>
          <div class="reward">${entry.reward}</div>
          <div class="muted">${entry.note || "Logged and marked owned when possible."}</div>
        </article>
      `,
    )
    .join("");
}

function companyRepTotal(company) {
  return state.logs.reduce((sum, entry) => {
    if (entry.company !== company) return sum;
    const mission = missionsFor(entry.type, entry.company).find((m) => missionTitleKey(m) === missionTitleKey(entry.mission));
    return sum + (mission?.repReward || 0);
  }, 0);
}

function rankForRep(company, rep) {
  const thresholds = [...new Map(
    missionItems()
      .flatMap((item) => item.missions || [])
      .filter((m) => m.faction === company)
      .map((m) => [m.repStanding || "Neutral", m.minRep || 0]),
  ).entries()]
    .map(([rank, minRep]) => ({ rank, minRep }))
    .sort((a, b) => a.minRep - b.minRep);
  let current = thresholds[0] || { rank: "Neutral", minRep: 0 };
  for (const tier of thresholds) if (rep >= tier.minRep) current = tier;
  return current;
}

function renderProgress() {
  const byType = new Map();
  const byCompany = new Map();
  const missing = [];

  for (const item of missionItems()) {
    const category = collectionCategory(item);
    if (!byType.has(category)) byType.set(category, { owned: 0, total: 0 });
    const bucket = byType.get(category);
    bucket.total += 1;
    if (isOwned(item.name)) bucket.owned += 1;
    else missing.push(item.name);
    for (const m of item.missions || []) {
      if (!byCompany.has(m.faction)) byCompany.set(m.faction, new Set());
      if (isOwned(item.name)) byCompany.get(m.faction).add(item.name);
    }
  }

  els.progressByType.innerHTML = [...byType.entries()]
    .sort((a, b) => b[1].owned - a[1].owned || b[1].total - a[1].total)
    .map(([type, stats]) => `<button class="log-card search-result" type="button" data-progress-kind="type" data-progress-value="${type}"><div class="reward">${type}</div><div class="muted">${formatCount(stats.owned)} owned · ${formatCount(stats.total)} total</div></button>`)
    .join("");

  const companies = [...new Set(missionItems().flatMap((item) => (item.missions || []).map((m) => m.faction)).filter(Boolean))].sort();
  const visibleCompanies = state.hideUnrankedCompanies
    ? companies.filter((company) => Boolean(highestCompletedRank(company)))
    : companies;
  if (els.toggleUnrankedCompanies) {
    els.toggleUnrankedCompanies.textContent = state.hideUnrankedCompanies ? "Show unranked" : "Hide unranked";
    els.toggleUnrankedCompanies.title = state.hideUnrankedCompanies
      ? "Show unranked factions/companies"
      : "Hide unranked factions/companies";
    els.toggleUnrankedCompanies.setAttribute("aria-pressed", String(state.hideUnrankedCompanies));
  }
  els.progressByRank.innerHTML = visibleCompanies
    .map((company) => {
      const best = highestCompletedRank(company);
      const rank = best?.repStanding || "No rank yet";
      const mission = best ? missionTitle(best) : "No missions logged yet";
      return `<button class="log-card search-result" type="button" data-progress-kind="company" data-progress-value="${company}"><div class="reward">${company}</div><div class="muted">Current rank: ${rank} · from ${mission}</div></button>`;
    })
    .join("") || `<div class="muted">No ranked companies yet.</div>`;

  els.progressMissing.innerHTML = missing
    .slice(0, 40)
    .map((name) => {
      const item = missionItems().find((entry) => entry.name === name);
      return `<button class="log-card search-result" type="button" data-progress-kind="missing" data-progress-value="${collectionCategory(item)}"><div class="reward">${name}</div><div class="muted">Still needed · ${item?.type || "unknown"}</div></button>`;
    })
    .join("");
}

function renderSearchResults() {
  if (!els.searchResults || !els.searchBlueprintInput) return;
  const query = norm(state.blueprintSearch);
  els.searchBlueprintInput.value = state.blueprintSearch || "";

  if (state.view !== "blueprints") {
    els.searchResults.innerHTML = `<div class="muted">Open the Blueprints view to search by name, type, company, or mission.</div>`;
    return;
  }

  const results = blueprintSearchItems();
  const label = query ? `${formatCount(results.length)} matches` : `${formatCount(results.length)} blueprints`;
  els.searchResults.innerHTML = `
    <div class="search-summary">${label}</div>
    <div class="timeline">
      ${results
        .slice(0, 24)
        .map(
          (item) => `
            <button class="log-card search-result" type="button" data-blueprint="${item.name}">
              <div class="reward">${item.name}</div>
              <div class="meta">
                <span>${item.type || "unknown"}</span>
                <span>${item.subtype || "unknown"}</span>
                <span>${(item.missions || []).length} links</span>
                <span>${isOwned(item.name) ? "owned" : "missing"}</span>
              </div>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function buyLocationSummary(entry) {
  const offers = filteredBuyOffers(entry);
  if (!offers.length) return "No locations";
  const first = buyOfferDisplayLocation(offers[0]);
  return offers.length === 1 ? first : `${first} + ${formatCount(offers.length - 1)} more`;
}

function renderBuy() {
  if (!els.buyResults || !els.buySelectedDetails) return;
  if (!hasBuyDataLoaded()) {
    if (!buyDataLoadPromise) void ensureBuyDataReady({ render: true });
    if (els.buyResultsSummary) {
      els.buyResultsSummary.textContent = state.buyDataStatus || "Loading buy data...";
    }
    els.buyResults.innerHTML = `<div class="muted">${state.buyDataStatus || "Loading buy data..."}</div>`;
    els.buySelectedMeta.textContent = "Loading catalog";
    els.buySelectedDetails.className = "detail-card empty";
    els.buySelectedDetails.textContent = "Buy items are still loading. This view will fill in automatically when the catalog is ready.";
    return;
  }
  const tab = state.buyTab || "items";
  const entries = filteredBuyEntries();
  const selected = currentBuyEntry();

  const tabs = document.querySelectorAll("[data-buy-tab]");
  tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.buyTab === tab);
  });

  if (els.buySearchInput) els.buySearchInput.value = state.buySearch || "";

  const systems = buySystems();
  if (systems.includes(state.buySystem)) {
    // keep selection
  } else {
    state.buySystem = "All";
    state.buyOrbit = "All";
    state.buyArea = "All";
  }

  const orbits = buyOrbits(state.buySystem);
  if (!orbits.includes(state.buyOrbit)) {
    state.buyOrbit = "All";
    state.buyArea = "All";
  }

  const areas = buyAreas(state.buySystem, state.buyOrbit, tab);
  if (!areas.includes(state.buyArea)) {
    state.buyArea = "All";
  }

  const types = buyTypeOptions();
  if (!types.includes(state.buyType)) {
    state.buyType = "All";
    state.buySubtype = "All";
  }
  const itemCategoryOptions = tab === "items" ? buyItemCategoryOptions() : ["All"];
  if (!itemCategoryOptions.includes(state.buyItemCategory)) state.buyItemCategory = "All";

  const subtypes = buySubtypeOptions();
  if (!subtypes.includes(state.buySubtype)) state.buySubtype = "All";
  const showShipFilters = tab === "ships" || tab === "rentals";
  const shipCareerOptions = showShipFilters ? buyShipCareerOptions() : ["All"];
  const shipRoles = showShipFilters ? buyShipRoleOptions() : ["All"];
  const shipSizes = showShipFilters ? buyShipSizeOptions() : ["All"];
  const shipWeaponOptions = showShipFilters ? buyShipWeaponOptions() : ["All"];
  const shipComponentOptions = showShipFilters ? buyShipComponentOptions() : ["All"];
  if (showShipFilters && !shipCareerOptions.includes(state.buyShipCareer)) state.buyShipCareer = "All";
  if (showShipFilters && !shipRoles.includes(state.buyShipRole)) state.buyShipRole = "All";
  if (showShipFilters && !shipSizes.includes(state.buyShipSize)) state.buyShipSize = "All";
  if (showShipFilters && !shipWeaponOptions.includes(state.buyShipWeapon)) state.buyShipWeapon = "All";
  if (showShipFilters && !shipComponentOptions.includes(state.buyShipComponent)) state.buyShipComponent = "All";

  if (els.buySystemSelect) {
    els.buySystemSelect.innerHTML = systems.map((value) => `<option value="${value}" ${value === state.buySystem ? "selected" : ""}>${value}</option>`).join("");
  }
  if (els.buyOrbitSelect) {
    els.buyOrbitSelect.innerHTML = orbits.map((value) => `<option value="${value}" ${value === state.buyOrbit ? "selected" : ""}>${value}</option>`).join("");
    els.buyOrbitSelect.value = state.buyOrbit;
  }
  if (els.buyAreaSelect) {
    els.buyAreaSelect.innerHTML = areas.map((value) => `<option value="${value}" ${value === state.buyArea ? "selected" : ""}>${value}</option>`).join("");
    els.buyAreaSelect.value = state.buyArea;
  }

  const renderChipRow = (values, active, attr) =>
    values
      .map((value) => `<button class="chip ${active === value ? "active" : ""}" type="button" data-buy-filter="${attr}" data-value="${value}">${value}</button>`)
      .join("");

  if (els.buyShipFilters) {
    els.buyShipFilters.hidden = !showShipFilters;
    els.buyShipFilters.style.display = showShipFilters ? "" : "none";
  }
  if (els.buyShipSupportFilters) {
    els.buyShipSupportFilters.hidden = !showShipFilters;
    els.buyShipSupportFilters.style.display = showShipFilters ? "" : "none";
  }
  if (els.buyShipCareerSelect) {
    els.buyShipCareerSelect.innerHTML = shipCareerOptions.map((value) => `<option value="${value}" ${value === state.buyShipCareer ? "selected" : ""}>${value}</option>`).join("");
    els.buyShipCareerSelect.value = state.buyShipCareer;
  }
  if (els.buyShipRoleSelect) {
    els.buyShipRoleSelect.innerHTML = shipRoles.map((value) => `<option value="${value}" ${value === state.buyShipRole ? "selected" : ""}>${value}</option>`).join("");
    els.buyShipRoleSelect.value = state.buyShipRole;
  }
  if (els.buyShipSizeSelect) {
    els.buyShipSizeSelect.innerHTML = shipSizes.map((value) => `<option value="${value}" ${value === state.buyShipSize ? "selected" : ""}>${value}</option>`).join("");
    els.buyShipSizeSelect.value = state.buyShipSize;
  }
  if (els.buyShipWeaponSelect) {
    els.buyShipWeaponSelect.innerHTML = shipWeaponOptions.map((value) => `<option value="${value}" ${value === state.buyShipWeapon ? "selected" : ""}>${value}</option>`).join("");
    els.buyShipWeaponSelect.value = state.buyShipWeapon;
  }
  if (els.buyShipComponentSelect) {
    els.buyShipComponentSelect.innerHTML = shipComponentOptions.map((value) => `<option value="${value}" ${value === state.buyShipComponent ? "selected" : ""}>${value}</option>`).join("");
    els.buyShipComponentSelect.value = state.buyShipComponent;
  }
  if (els.buyTypeChips) {
    els.buyTypeChips.innerHTML = renderChipRow(types, state.buyType, "type");
  }
  if (els.buyItemCategoryChips) {
    els.buyItemCategoryChips.hidden = tab !== "items";
    els.buyItemCategoryChips.style.display = tab === "items" ? "" : "none";
    els.buyItemCategoryChips.innerHTML = tab === "items" ? renderChipRow(itemCategoryOptions, state.buyItemCategory, "itemCategory") : "";
  }
  if (els.buySubtypeChips) {
    els.buySubtypeChips.innerHTML = renderChipRow(subtypes, state.buySubtype, "subtype");
  }
  if (els.buyResultsSummary) {
    const sourceLabel = tab === "items" ? "items" : tab === "ships" ? "ships" : "rentals";
    els.buyResultsSummary.textContent = `${formatCount(entries.length)} ${sourceLabel} match${entries.length === 1 ? "" : "es"}`;
  }

  els.buyResults.innerHTML =
    entries
      .map((entry) => {
        const name = buyEntryName(entry, tab);
        const type = buyEntryType(entry, tab);
        const subtype = buyEntrySubtype(entry, tab);
        const price = buyEntryPriceRange(entry, tab);
        const locations = buyLocationSummary(entry);
        const metaParts = [type, subtype, price, locations].filter(Boolean);
        return `
          <button class="log-card search-result buy-result ${selected && String(selected.id || buyEntryName(selected)) === String(entry.id || name) ? "active" : ""}" type="button" data-buy-id="${entry.id || name}">
            <div class="reward">${name}</div>
            <div class="meta">
              ${metaParts.map((part) => `<span>${part}</span>`).join("")}
            </div>
          </button>
        `;
      })
      .join("") || `<div class="muted">No ${tab} entries match this filter.</div>`;

  if (!selected) {
    els.buySelectedMeta.textContent = "Nothing selected";
    els.buySelectedDetails.className = "detail-card empty";
    els.buySelectedDetails.textContent = "Pick an item, ship, or rental to see its price and location details here.";
    return;
  }

  const offers = filteredBuyOffers(selected);
  const sortedOffers = offers
    .slice()
    .sort((a, b) => String(offerLocationName(a) || offerLocationPath(a)).localeCompare(String(offerLocationName(b) || offerLocationPath(b))));
  const entryName = buyEntryName(selected, tab);
  const type = buyEntryType(selected, tab);
  const subtype = buyEntrySubtype(selected, tab);
  const size = buyEntrySize(selected, tab);
  const manufacturer = buyEntryManufacturer(selected);
  const status = buyEntryStatus(selected);
  const statusBadgeClass = isConceptShipStatus(status) ? "concept" : "live";
  const price = buyEntryPriceRange(selected, tab);
  const career = tab === "ships" || tab === "rentals" ? type : "";
  const role = tab === "ships" || tab === "rentals" ? subtype : "";
  els.buySelectedMeta.textContent = `${tab.slice(0, -1) || "Item"} | ${entryName}`;
  els.buySelectedDetails.className = "detail-card";
  const selectedShipWeapons = visibleShipWeaponNames(shipLoadoutDisplayNames(selected, "weapons"));
  const selectedShipComponents = visibleShipComponentNames(shipLoadoutDisplayNames(selected, "components"));
  const weaponCounts = countByName(selectedShipWeapons);
  const componentCounts = countByName(selectedShipComponents);
  const statGroups = buyEntryStatsGroups(selected, tab);
  const selectedBlueprintItem = tab === "items" ? blueprintItemByName(entryName) : null;
  const itemCraftingSource = selectedBlueprintItem || selected;
  const itemCrafting = tab === "items" ? blueprintCraftingData(itemCraftingSource) : { recipe: null, dismantles: [] };
  const itemCraftTimeSeconds =
    tab === "items"
      ? Number(itemCrafting.recipe?.tiers?.[0]?.craft_time_seconds || itemCrafting.recipe?.recipe_time_seconds || itemCraftingSource?.craftTime || 0)
      : 0;
  const statLabel = tab === "items" ? "Item info" : "Stats";
  const statBlock =
    statGroups.length || tab !== "items"
      ? `
      <div class="detail-kv buy-detail-wide">
        <span>${statLabel}</span>
        <div class="mission-list">
          ${
            statGroups.length
              ? statGroups
                  .map((group) => `
                    <div class="mission-line">
                      <strong>${escapeHtml(group.label)}</strong>
                      <div class="buy-stat-rows">
                        ${group.rows
                          .map(
                            (row) => `
                              <div class="buy-stat-row">
                                <span class="buy-stat-label">${escapeHtml(row.label)}:</span>
                                <span class="buy-stat-value">${escapeHtml(row.value)}</span>
                              </div>
                            `
                          )
                          .join("")}
                      </div>
                    </div>
                  `)
                  .join("")
              : `<div class="muted">No additional stats data found for this entry.</div>`
          }
        </div>
      </div>
    `
      : "";
  els.buySelectedDetails.innerHTML = `
    <div class="detail-grid buy-detail-grid">
      <div class="detail-kv"><span>Name</span><strong>${entryName}</strong></div>
      ${status ? `<div class="detail-kv"><span>Status</span><strong><span class="detail-status-badge ${statusBadgeClass}">${status}</span></strong></div>` : ""}
      ${tab === "ships" || tab === "rentals" ? `<div class="detail-kv"><span>Career</span><strong>${career || "Unknown"}</strong></div>` : `<div class="detail-kv"><span>Type</span><strong>${type}</strong></div>`}
      ${tab === "ships" || tab === "rentals" ? `<div class="detail-kv"><span>Role</span><strong>${role || "Unknown"}</strong></div>` : `<div class="detail-kv"><span>Subtype</span><strong>${subtype}</strong></div>`}
      ${tab === "ships" || tab === "rentals" ? `<div class="detail-kv"><span>Size</span><strong>${size || "Unknown"}</strong></div>` : ""}
      <div class="detail-kv"><span>${tab === "rentals" ? "Rental price" : tab === "ships" ? "Universe price" : "Price"}</span><strong>${price}</strong></div>
      ${manufacturer ? `<div class="detail-kv"><span>Manufacturer</span><strong>${manufacturer}</strong></div>` : ""}
      <div class="detail-kv"><span>Locations</span><strong>${formatCount(sortedOffers.length)}</strong></div>
      ${((tab === "ships" || tab === "rentals") && selected.crew) ? `<div class="detail-kv"><span>Crew</span><strong>${selected.crew}</strong></div>` : ""}
      ${((tab === "ships" || tab === "rentals") && selected.cargo) ? `<div class="detail-kv"><span>Cargo</span><strong>${selected.cargo}</strong></div>` : ""}
      ${((tab === "ships" || tab === "rentals") && (selected.length || selected.width || selected.height || selected.mass)) ? `
        <div class="detail-kv buy-detail-wide">
          <span>Dimensions</span>
          <strong>${[selected.length ? `L ${selected.length}` : "", selected.width ? `W ${selected.width}` : "", selected.height ? `H ${selected.height}` : "", selected.mass ? `Mass ${selected.mass}` : ""].filter(Boolean).join(" · ")}</strong>
        </div>
      ` : ""}
      ${tab === "items" ? `
        <div class="detail-kv buy-detail-wide">
          <span>Dismantle returns</span>
          <div class="mission-list">
            ${renderDismantleMarkup(itemCrafting.dismantles)}
          </div>
        </div>
      ` : ""}
      ${statBlock}
      <div class="detail-kv buy-detail-wide">
        <span>Availability</span>
        <div class="mission-list">
          ${sortedOffers
            .map((offer) => {
              const locationText = offerLocationName(offer) || offerLocationPath(offer);
              const displayLocation = buyOfferDisplayLocation(offer);
              const system = offerSystem(offer);
              const orbit = offerOrbit(offer);
              const area = offerArea(offer);
              const location = cleanDisplayText(offer?.locationName || offer?.locationLabel || offerLocationName(offer) || "");
              const offerPrice = Number(offer.price || 0);
              const offerPriceText = Number.isFinite(offerPrice) && offerPrice > 0 ? `${formatCount(offerPrice)} aUEC` : "";
              const hierarchy = [system, orbit, area, location].filter(Boolean).join(" | ");
              return `<div class="mission-line"><strong>${displayLocation || locationText}</strong><div class="muted">${hierarchy}${offerPriceText ? ` | ${offerPriceText}` : ""}</div></div>`;
            })
            .join("") || `<div class="muted">No availability data found for the current filters.</div>`}
        </div>
      </div>
      ${tab === "ships" || tab === "rentals" ? selectedShipWeapons.length ? `<div class="detail-kv buy-detail-wide"><span>Weapons</span><strong>${weaponCounts.map(([name, count]) => `${name} x ${count}`).join(" · ")}</strong></div>` : "" : ""}
      ${tab === "ships" || tab === "rentals" ? selectedShipComponents.length ? `<div class="detail-kv buy-detail-wide"><span>Components</span><strong>${componentCounts.map(([name, count]) => `${name} x ${count}`).join(" · ")}</strong></div>` : "" : ""}
      ${tab === "rentals" ? `<div class="detail-kv buy-detail-wide"><span>Rental pricing</span><div class="mission-list"><div class="mission-line"><strong>1 day / 3 days / 7 days</strong><div class="muted">${price}</div></div></div></div>` : ""}
    </div>
  `;

  const scminersDbCategoriesList = scminersDbCategories();
  if (scminersDbCategoriesList.length && !scminersDbCategoriesList.some((entry) => entry.key === state.scminersDbCategory)) {
    state.scminersDbCategory = scminersDbCategoriesList[0].key;
  }

    const scminersDbEntries = scminersDbCategoryEntries(state.scminersDbCategory);
    if (els.scminersDbPanel && els.scminersDbCount && els.scminersDbPreview && els.scminersDbCategory) {
      const selectedCount = scminersDbCategoryCount(state.scminersDbCategory);
      const manifestCount = Number(state.scminersDb?.manifest?.record_count || 0);
      const exportCount = Number(state.scminersDb?.manifest?.json_count || 0);
      const previewEntries = scminersDbEntries.slice();
      els.scminersDbPanel.hidden = !scminersDbEntries.length;
      els.scminersDbCategory.textContent = `${scminersDbCategoryLabel(state.scminersDbCategory) || "Export"} export`;
      els.scminersDbCount.textContent = formatCount(selectedCount);
      if (els.scminersDbSummary) {
        const orderLabel = scminersDbCategoryLabel(state.scminersDbCategory) || "Export";
        els.scminersDbSummary.textContent = [
          `${orderLabel} order`,
          manifestCount ? `${formatCount(manifestCount)} records` : "",
          exportCount ? `${formatCount(exportCount)} exports` : "",
        ]
          .filter(Boolean)
          .join(" · ");
      }
      if (els.scminersDbSelectedCount) {
        els.scminersDbSelectedCount.textContent = `${formatCount(previewEntries.length)} records`;
      }
      if (els.scminersDbSwitch) {
        els.scminersDbSwitch.innerHTML =
          scminersDbCategoriesList
            .map(
            (entry) => `
              <button class="seg ${entry.key === state.scminersDbCategory ? "active" : ""}" type="button" data-scminersdb-category="${escapeHtml(entry.key)}">
                ${escapeHtml(entry.label)}
                <span class="seg-count">${formatCount(entry.count)}</span>
              </button>
            `,
          )
            .join("") || "";
      }
      const previewMarkup = previewEntries
        .slice(0, 12)
        .map((entry, index) => {
          const title = scminersDbEntryTitle(entry);
          const type = scminersDbEntryType(entry);
          const summary = scminersDbEntrySummary(entry);
          return `
            <div class="mission-line">
              <div class="reward">${String(index + 1).padStart(2, "0")}. ${escapeHtml(title)}</div>
              <div class="muted">${escapeHtml(type || "Unknown type")}${summary ? ` · ${escapeHtml(summary)}` : ""}</div>
            </div>
          `;
        })
        .join("");
      els.scminersDbPreview.innerHTML =
        previewMarkup ||
        `<div class="muted">No SCMinersDB records found for this category.</div>`;
      if (previewEntries.length > 12) {
        els.scminersDbPreview.insertAdjacentHTML("beforeend", `<div class="muted">+ ${formatCount(previewEntries.length - 12)} more records</div>`);
      }
    }
  }
function renderStats() {
  const owned = missionItems().filter((item) => isOwned(item.name));
  const missing = missionItems().filter((item) => !isOwned(item.name));
  const attempts = new Map();

  for (const log of state.logs) {
    const key = `${log.type} :: ${log.company} :: ${log.mission}`;
    attempts.set(key, (attempts.get(key) || 0) + 1);
  }

  els.statsOwnedCount.textContent = formatCount(owned.length);
  els.statsMissingCount.textContent = formatCount(missing.length);
  els.statsOwnedList.innerHTML =
    owned
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 36)
      .map((item) => `<div class="log-card"><div class="reward">${item.name}</div><div class="muted">${item.type} · owned</div></div>`)
      .join("") || `<div class="muted">No owned rewards yet.</div>`;
  els.statsMissingList.innerHTML =
    missing
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 36)
      .map((item) => `<div class="log-card"><div class="reward">${item.name}</div><div class="muted">${item.type} · missing</div></div>`)
      .join("") || `<div class="muted">Nothing missing.</div>`;
  els.missionAttempts.innerHTML =
    [...attempts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 36)
      .map(([key, count]) => {
        const [, type = "", company = "", mission = ""] = key.split(" :: ");
        return `<div class="log-card"><div class="reward">${mission}</div><div class="meta"><span>${type}</span><span>${company}</span></div><div class="muted">${count} tries</div></div>`;
      })
      .join("") || `<div class="muted">No attempts logged yet.</div>`;
}

function renderSettings() {
  const currentTheme = localStorage.getItem("sc-blueprint-tracker-theme") || "dark";
  document.body.dataset.theme = currentTheme;
  if (els.scminersDbManifestUrl) {
    els.scminersDbManifestUrl.value = currentScminersDbManifestUrl();
  }
}

function syncWizardState() {
  const types = missionTypes();
  if (!types.includes(state.missionType)) state.missionType = "";

  const companies = companiesForType(state.missionType);
  if (!companies.includes(state.company)) state.company = "";

  const missions = missionsFor(state.missionType, state.company);
  if (!missions.some((m) => missionTitle(m) === state.mission)) state.mission = "";

  const rewards = currentRewardOptions();
  if (!rewards.some((r) => r.name === state.reward) && state.reward !== "__other__") state.reward = "";
}

function renderAll() {
  if (state.view === "dashboard" || state.view === "missions") {
    syncWizardState();
  }
  renderUsers();
  renderRail();
  renderView();
  renderSummary();
  if (state.view === "dashboard") {
    renderWizard();
    renderSelected();
  } else if (state.view === "missions") {
    renderWizard();
    renderMissionBrowser();
    renderSelected();
  } else if (state.view === "blueprints") {
    renderChips();
    renderCollection();
    renderSelected();
  } else if (state.view === "buy-items") {
    renderBuy();
  } else if (state.view === "progress") {
    renderProgress();
    renderSelected();
  } else if (state.view === "stats") {
    renderStats();
  } else if (state.view === "settings") {
    renderSettings();
  }
  saveState();
}

function handleChipClick(evt) {
  const button = evt.target.closest("[data-chip]");
  if (!button) return;
  state.chip = button.dataset.chip;
  renderAll();
}

function handleCollectionMode(evt) {
  const button = evt.target.closest("[data-view]");
  if (!button) return;
  state.collectionMode = button.dataset.view;
  renderAll();
}

function chooseItem(name) {
  state.selectedItem = missionItems().find((item) => item.name === name) || null;
  renderSelected();
}

function markSelectedBlueprintOwned() {
  if (state.view !== "blueprints") return;
  const item = state.selectedItem || currentItemDetail();
  if (!item) return;
  state.owned.add(norm(item.name));
  renderAll();
}

function removeSelectedBlueprintOwned() {
  if (state.view !== "blueprints") return;
  const item = state.selectedItem || currentItemDetail();
  if (!item) return;
  state.owned.delete(norm(item.name));
  renderAll();
}

function activateRail(section) {
  state.view = normalizeRailView(section);
  renderAll();
  if (state.view === "buy-items" && !hasBuyDataLoaded() && !buyDataLoadPromise) {
    void ensureBuyDataReady({ render: true });
  }

  const targets = {
    dashboard: ".step-shell",
    missions: ".mission-browser-shell",
    blueprints: ".collection-card",
    "buy-items": ".buy-shell",
    progress: ".progress-shell",
    stats: ".stats-shell",
    settings: ".settings-shell",
  };

  const target = document.querySelector(targets[section] || ".topbar");
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function logReward() {
  const type = els.missionTypeSelect.value;
  const company = els.companySelect.value;
  const mission = els.missionSelect.value;
  const rewardName = els.rewardSelect.value === "__other__" ? els.customReward.value.trim() : els.rewardSelect.value || els.customReward.value.trim();

  if (!type || !company || !mission) return;

  const rewardItem = currentRewardOptions().find((item) => item.name === rewardName);
  if (rewardItem) state.owned.add(norm(rewardItem.name));

  state.logs.push({
    at: new Date().toISOString(),
    type,
    company,
    mission,
    reward: rewardName || rewardItem?.name || "Unknown reward",
    note: rewardName ? "Logged from the mission wizard." : "No reward name entered.",
  });

  state.customReward = "";
  state.reward = rewardItem?.name || rewardName || "";
  renderAll();
}

function clearSelection() {
  clearWizardSelection();
  state.selectedItem = null;
  renderAll();
}

async function startWatch() {
  if (!window.showOpenFilePicker) {
    els.watchState.textContent = "File picker unavailable";
    els.filePreview.textContent = "This browser does not support the File System Access API here.";
    return;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Text or log files",
          accept: {
            "text/plain": [".txt", ".log"],
            "application/json": [".json"],
          },
        },
      ],
    });

    state.watch.handle = handle;
    state.watch.name = handle.name;
    state.watch.lastText = "";
    els.watchState.textContent = "Watching";
    if (state.watch.timer) clearInterval(state.watch.timer);
    state.watch.timer = window.setInterval(() => pollWatch(false), 3000);
    await pollWatch(true);
    renderAll();
  } catch (error) {
    if (String(error?.name) !== "AbortError") {
      els.watchState.textContent = "Watch failed";
      els.filePreview.textContent = String(error?.message || error);
    }
  }
}

async function pollWatch(initial) {
  if (!state.watch.handle) return;
  try {
    const file = await state.watch.handle.getFile();
    const text = await file.text();
    if (text !== state.watch.lastText || initial) {
      state.watch.lastText = text;
      els.filePreview.textContent = text.split(/\r?\n/).slice(-80).join("\n") || "File is empty.";
      els.watchState.textContent = `Watching ${state.watch.name}`;
      els.footerWatch.textContent = `Watching: ${state.watch.name}`;
    }
  } catch (error) {
    els.watchState.textContent = "Watch stopped";
    els.filePreview.textContent = String(error?.message || error);
    stopWatch();
  }
}

function stopWatch() {
  if (state.watch.timer) clearInterval(state.watch.timer);
  state.watch.timer = null;
  state.watch.handle = null;
  state.watch.name = "";
  state.watch.lastText = "";
  localStorage.removeItem(WATCH_KEY);
  els.watchState.textContent = "Not watching";
  els.filePreview.textContent = "No file selected.";
  renderSummary();
}

function exportState() {
  const blob = new Blob(
    [JSON.stringify({ owned: [...state.owned], logs: state.logs }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "blueprint-tracker-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

function resetState() {
  if (!confirm("Reset owned blueprints and logs?")) return;
  state.owned = new Set();
  state.logs = [];
  state.search = "";
  state.chip = "All";
  state.selectedItem = null;
  clearWizardSelection();
  renderAll();
}

async function init() {
  [
    "userCount",
    "userSelect",
    "addUser",
    "deleteUser",
    "currentUserName",
    "currentUserIndex",
    "userSelectSide",
    "addUserSide",
    "deleteUserSide",
    "ownedTotal",
    "missingTotal",
    "ownedBreakdown",
    "missingBreakdown",
    "collectionList",
    "typeChips",
    "missionTypeSelect",
    "companySelect",
    "missionSelect",
    "rewardSelect",
    "customReward",
    "logReward",
    "clearSelection",
    "selectedDetails",
    "selectedMeta",
    "missionLog",
    "missionStatus",
    "searchBlueprintInput",
    "searchResults",
    "missionSearchInput",
    "missionFilterTypeSelect",
    "missionFilterPointsSelect",
    "missionFilterReputationSelect",
    "missionFilterLocationSelect",
    "missionFilterDifficultySelect",
    "missionSearchReset",
    "missionScriptOnlyToggle",
    "missionSearchResults",
    "buyTabs",
    "buySearchInput",
    "buySystemSelect",
    "buyOrbitSelect",
    "buyAreaSelect",
    "buyTypeChips",
    "buyItemCategoryChips",
    "buySubtypeChips",
    "buyShipFilters",
    "buyShipSupportFilters",
    "buyShipCareerSelect",
    "buyShipRoleSelect",
    "buyShipSizeSelect",
    "buyShipWeaponSelect",
    "buyShipComponentSelect",
    "buyResultsSummary",
    "buyResults",
    "buySelectedMeta",
    "buySelectedDetails",
    "scminersDbPanel",
    "scminersDbCount",
    "scminersDbSummary",
    "scminersDbSelectedCount",
    "scminersDbCategory",
    "scminersDbPreview",
    "scminersDbSwitch",
    "statsOwnedCount",
    "statsOwnedList",
    "statsMissingCount",
    "statsMissingList",
    "progressByType",
    "progressByRank",
    "progressMissing",
    "toggleUnrankedCompanies",
    "footerOwned",
    "footerMissing",
    "footerWatch",
    "searchInput",
    "missionAttempts",
    "exportState",
    "updateInfo",
    "resetState",
    "themeDark",
    "themeLight",
    "scminersDbManifestUrl",
    "saveScminersDbManifestUrl",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  loadState();
  await ensureBundledScminersDbPayload();
  useBundledScminersDbData();
  els.searchInput.value = state.search;
  renderAll();
  void bootstrapAppData();
  if (!bundledScminersDbPayload()) void loadScminersDbBridge();
  scheduleScminersDbRefresh();

    els.typeChips.addEventListener("click", handleChipClick);
  document.querySelectorAll(".segmented").forEach((group) => group.addEventListener("click", handleCollectionMode));
  els.collectionList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-item]");
    if (!item) return;
    chooseItem(item.dataset.item);
  });
  els.selectedDetails.addEventListener("click", (event) => {
    const blueprintButton = event.target.closest("[data-blueprint]");
    if (blueprintButton) {
      chooseItem(blueprintButton.dataset.blueprint);
      if (state.view !== "blueprints") state.view = "blueprints";
      renderAll();
      return;
    }
    const missionButton = event.target.closest("[data-mission-link]");
    if (missionButton) {
      const type = missionButton.dataset.missionType || "";
      const company = missionButton.dataset.missionCompany || "";
      const title = missionButton.dataset.missionTitle || "";
      selectMission(type, company, title);
      activateRail("missions");
      return;
    }
    const subtypeButton = event.target.closest("[data-progress-subtype]");
    if (subtypeButton) {
      state.progressSubtype = subtypeButton.dataset.progressSubtype || "";
      renderSelected();
      saveState();
      return;
    }
    const button = event.target.closest("[data-action='mark-owned']");
    if (button) {
      markSelectedBlueprintOwned();
      return;
    }
    const removeButton = event.target.closest("[data-action='remove-owned']");
    if (!removeButton) return;
    removeSelectedBlueprintOwned();
  });
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderAll();
  });
  if (els.searchBlueprintInput) {
    els.searchBlueprintInput.addEventListener("input", (event) => {
      state.blueprintSearch = event.target.value;
      renderSearchResults();
      saveState();
    });
  }
  els.missionSearchInput.addEventListener("input", (event) => {
    state.missionSearch = event.target.value;
    renderMissionBrowser();
    saveState();
  });
  els.missionSearchReset?.addEventListener("click", () => {
    state.missionSearch = "";
    state.missionFilterType = "All";
    state.missionFilterPoints = "All";
    state.missionFilterReputation = "All";
    state.missionFilterLocation = "All";
    state.missionFilterDifficulty = "All";
    state.missionFilterMoney = "All";
    state.missionScriptOnly = false;
    renderMissionBrowser();
    saveState();
  });
  els.missionFilterTypeSelect?.addEventListener("change", (event) => {
    state.missionFilterType = event.target.value || "All";
    renderMissionBrowser();
    saveState();
  });
  els.missionFilterPointsSelect?.addEventListener("change", (event) => {
    state.missionFilterPoints = event.target.value || "All";
    renderMissionBrowser();
    saveState();
  });
  els.missionFilterReputationSelect?.addEventListener("change", (event) => {
    state.missionFilterReputation = event.target.value || "All";
    renderMissionBrowser();
    saveState();
  });
  els.missionFilterLocationSelect?.addEventListener("change", (event) => {
    state.missionFilterLocation = event.target.value || "All";
    renderMissionBrowser();
    saveState();
  });
  els.missionFilterDifficultySelect?.addEventListener("change", (event) => {
    state.missionFilterDifficulty = event.target.value || "All";
    renderMissionBrowser();
    saveState();
  });
  ensureMissionMoneyFilterControl()?.addEventListener("change", (event) => {
    state.missionFilterMoney = event.target.value || "All";
    renderMissionBrowser();
    saveState();
  });
  els.missionScriptOnlyToggle?.addEventListener("click", () => {
    state.missionScriptOnly = !state.missionScriptOnly;
    renderMissionBrowser();
    saveState();
  });
  els.missionSearchResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mission]");
    if (!button) return;
    const type = button.dataset.missionType || "";
    const company = button.dataset.missionCompany || "";
    const title = button.dataset.missionTitle || "";
    selectMission(type, company, title);
    state.view = "missions";
    renderAll();
  });
  if (els.searchResults) {
    els.searchResults.addEventListener("click", (event) => {
      const button = event.target.closest("[data-blueprint]");
      if (!button) return;
      chooseItem(button.dataset.blueprint);
      if (state.view !== "blueprints") state.view = "blueprints";
      renderAll();
    });
  }
  els.buyTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-buy-tab]");
    if (!button) return;
    selectBuyTab(button.dataset.buyTab);
  });
  els.scminersDbSwitch?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scminersdb-category]");
    if (!button) return;
    state.scminersDbCategory = button.dataset.scminersdbCategory || "1h";
    renderBuy();
    saveState();
  });
  els.buyTypeChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-buy-filter='type']");
    if (!button) return;
    state.buyType = button.dataset.value || "All";
    state.buySubtype = "All";
    renderBuy();
    saveState();
  });
  els.buyItemCategoryChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-buy-filter='itemCategory']");
    if (!button) return;
    state.buyItemCategory = button.dataset.value || "All";
    renderBuy();
    saveState();
  });
  els.buySubtypeChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-buy-filter='subtype']");
    if (!button) return;
    state.buySubtype = button.dataset.value || "All";
    renderBuy();
    saveState();
  });
  els.buyShipCareerSelect?.addEventListener("change", (event) => {
    state.buyShipCareer = event.target.value || "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyShipRoleSelect?.addEventListener("change", (event) => {
    state.buyShipRole = event.target.value || "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyShipSizeSelect?.addEventListener("change", (event) => {
    state.buyShipSize = event.target.value || "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyShipWeaponSelect?.addEventListener("change", (event) => {
    state.buyShipWeapon = event.target.value || "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyShipComponentSelect?.addEventListener("change", (event) => {
    state.buyShipComponent = event.target.value || "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyResults?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-buy-id]");
    if (!button) return;
    const entry = filteredBuyEntries().find((item) => String(item.id || buyEntryName(item)) === String(button.dataset.buyId));
    if (!entry) return;
    selectBuyEntry(entry);
    saveState();
  });
  els.buySearchInput?.addEventListener("input", (event) => {
    state.buySearch = event.target.value;
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buySystemSelect?.addEventListener("change", (event) => {
    state.buySystem = event.target.value;
    state.buyOrbit = "All";
    state.buyArea = "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyOrbitSelect?.addEventListener("change", (event) => {
    state.buyOrbit = event.target.value;
    state.buyArea = "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyAreaSelect?.addEventListener("change", (event) => {
    state.buyArea = event.target.value;
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.missionTypeSelect.addEventListener("change", (event) => {
    state.missionType = event.target.value;
    state.company = "";
    state.mission = "";
    state.reward = "";
    renderAll();
  });
  els.companySelect.addEventListener("change", (event) => {
    state.company = event.target.value;
    state.mission = "";
    state.reward = "";
    renderAll();
  });
  els.missionSelect.addEventListener("change", (event) => {
    state.mission = event.target.value;
    state.reward = "";
    renderAll();
  });
  els.rewardSelect.addEventListener("change", (event) => {
    state.reward = event.target.value === "__other__" ? "__other__" : event.target.value;
    renderAll();
  });
  els.customReward.addEventListener("input", (event) => {
    state.customReward = event.target.value;
    saveState();
  });
  els.userSelect.addEventListener("change", (event) => applyUserSelection(event.target.value));
  els.userSelectSide.addEventListener("change", (event) => applyUserSelection(event.target.value));
  els.addUser.addEventListener("click", () => {
    const name = promptForUserName();
    if (name !== null) createUser(name);
  });
  els.addUserSide.addEventListener("click", () => {
    const name = promptForUserName();
    if (name !== null) createUser(name);
  });
  els.deleteUser.addEventListener("click", deleteCurrentUser);
  els.deleteUserSide.addEventListener("click", deleteCurrentUser);
  els.logReward.addEventListener("click", logReward);
  els.clearSelection.addEventListener("click", clearSelection);
  els.exportState.addEventListener("click", exportState);
  els.updateInfo.addEventListener("click", async () => {
    try {
      const result = await updateScminersDb();
      if (result) {
        els.footerWatch.textContent = `Updated ${formatCount(result?.updated?.files || 0)} exports`;
      }
    } catch (error) {
      const message = cleanDisplayText(error?.message || error);
      els.footerWatch.textContent = `Update failed: ${message}`;
      console.warn("SCMinersDB update failed:", error);
    }
  });
  els.resetState.addEventListener("click", resetState);
  els.toggleUnrankedCompanies?.addEventListener("click", () => {
    state.hideUnrankedCompanies = !state.hideUnrankedCompanies;
    renderAll();
  });
  els.themeDark.addEventListener("click", () => {
    localStorage.setItem("sc-blueprint-tracker-theme", "dark");
    renderSettings();
  });
  els.themeLight.addEventListener("click", () => {
    localStorage.setItem("sc-blueprint-tracker-theme", "light");
    renderSettings();
  });
  els.saveScminersDbManifestUrl?.addEventListener("click", () => {
    setScminersDbManifestUrl(els.scminersDbManifestUrl?.value || SCMINERSDB_DEFAULT_MANIFEST_URL);
    renderAll();
  });
  els.scminersDbManifestUrl?.addEventListener("change", () => {
    setScminersDbManifestUrl(els.scminersDbManifestUrl.value || SCMINERSDB_DEFAULT_MANIFEST_URL);
    renderAll();
  });
  document.querySelectorAll(".rail-item").forEach((button) => {
    button.addEventListener("click", () => {
      const label = (button.getAttribute("aria-label") || "").toLowerCase();
      activateRail(label);
    });
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-collection-filter]");
    if (!button) return;
    state.collectionMode = button.dataset.collectionFilterMode || "owned";
    state.chip = button.dataset.collectionFilterChip || "All";
    activateRail("blueprints");
  });
  document.querySelectorAll(".progress-shell").forEach((shell) => {
    shell.addEventListener("click", (event) => {
      const button = event.target.closest("[data-progress-kind]");
      if (!button) return;
      state.progressFocus = { kind: button.dataset.progressKind, value: button.dataset.progressValue || "" };
      state.progressSubtype = "";
      renderAll();
    });
  });
}

init().catch((error) => {
  document.body.innerHTML = `<pre style="color:#fff;padding:20px;white-space:pre-wrap">${error.stack || error}</pre>`;
});



