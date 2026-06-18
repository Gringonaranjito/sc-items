const STORAGE_KEY = "sc-blueprint-tracker-v1";
const WATCH_KEY = "sc-blueprint-tracker-watch-v1";
const USERS_KEY = "sc-blueprint-tracker-users-v1";
const USER_PREFIX = "sc-blueprint-tracker-user-v1-";

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
  buyLocation: "All",
  buyType: "All",
  buySubtype: "All",
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
};

const els = {};

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeText(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

function cleanDisplayText(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/Ã‚/g, "")
    .replace(/Ã¢â‚¬â€œ/g, "â€“")
    .replace(/Ã¢â‚¬â€/g, "â€”")
    .replace(/Ã¢â‚¬Ëœ/g, "'")
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Å“/g, '"')
    .replace(/Ã¢â‚¬Â/g, '"')
    .replace(/ï¿½/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadLabel(v) {
  const value = norm(v);
  return !value || value.includes("placeholder") || value.includes("null");
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

function isHiddenShipLoadoutName(value) {
  const text = norm(cleanDisplayText(value));
  if (!text) return true;
  return /varipuck|manned turret|remote turret/i.test(text);
}

function visibleShipLoadoutNames(values) {
  return (Array.isArray(values) ? values : []).filter((value) => !isHiddenShipLoadoutName(value));
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
      ...Array(7).fill('VT-T10 "Veritas" Torpedo'),
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
    missionType: "",
    company: "",
    mission: "",
    reward: "",
    customReward: "",
    selectedItem: null,
    buyTab: "items",
    buySearch: "",
    buySystem: "All",
    buyArea: "All",
    buyLocation: "All",
    buyType: "All",
    buySubtype: "All",
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
  if (state.view === "missions") state.view = "dashboard";
  state.collectionMode = parsed.collectionMode || parsed.view || "owned";
  state.search = parsed.search || "";
  state.blueprintSearch = parsed.blueprintSearch || "";
  state.missionSearch = parsed.missionSearch || "";
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
  state.buyLocation = parsed.buyLocation || "All";
  state.buyType = parsed.buyType || "All";
  state.buySubtype = parsed.buySubtype || "All";
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
      buyLocation: state.buyLocation,
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
  if (window.BLUEPRINT_EXPLORER_DATA) return window.BLUEPRINT_EXPLORER_DATA;
  throw new Error("Local blueprint data was not loaded. Make sure blueprint_explorer_data.js is next to index.html.");
}

async function loadBuyData() {
  const baseData = window.BUY_ITEMS_DATA || { items: [], ships: [], rentals: [] };
  const partsData = window.BUY_ITEMS_DATA_PARTS || {};

  const normalizeKey = (entry) => norm(entry?.id || entry?.name || entry?.title || "");
  const mergeRecord = (primary = {}, secondary = {}) => {
    const merged = { ...primary, ...secondary };
    merged.offers = Array.isArray(secondary.offers) && secondary.offers.length ? secondary.offers : Array.isArray(primary.offers) ? primary.offers : [];
    merged.loadoutCategories = Array.isArray(secondary.loadoutCategories) && secondary.loadoutCategories.length ? secondary.loadoutCategories : Array.isArray(primary.loadoutCategories) ? primary.loadoutCategories : [];
    merged.loadoutWeapons = Array.isArray(secondary.loadoutWeapons) && secondary.loadoutWeapons.length ? secondary.loadoutWeapons : Array.isArray(primary.loadoutWeapons) ? primary.loadoutWeapons : [];
    merged.loadoutComponents = Array.isArray(secondary.loadoutComponents) && secondary.loadoutComponents.length ? secondary.loadoutComponents : Array.isArray(primary.loadoutComponents) ? primary.loadoutComponents : [];
    merged.prices = secondary.prices || primary.prices || merged.prices || {};
    merged.status = secondary.status || primary.status || merged.status || "";
    return merged;
  };
  const mergeByKey = (primary = [], secondary = []) => {
    const map = new Map();
    for (const entry of Array.isArray(primary) ? primary : []) {
      const key = normalizeKey(entry);
      if (key) map.set(key, entry);
    }
    for (const entry of Array.isArray(secondary) ? secondary : []) {
      const key = normalizeKey(entry);
      if (!key) continue;
      map.set(key, mergeRecord(map.get(key) || {}, entry));
    }
    return [...map.values()];
  };

  const buyKnownOrbits = [
    "ArcCorp",
    "Bloom",
    "Crusader",
    "Delamar",
    "Hurston",
    "microTech",
    "Monox",
    "Nyx",
    "Pyro",
    "Terminus",
    "Yela",
  ];

  const buyKnownAreas = [
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
    "PYR2-L4",
    "PYR3-L1",
    "PYR3-L3",
    "PYR5-L2",
    "PYR5-L4",
    "PYR5-L5",
    "PYR6-L3",
    "PYR6-L4",
    "PYR6-L5",
    "Rat's Nest",
    "Ruin Station",
    "Seraphim Station",
    "Stanton Gateway",
    "Starlight Service Station",
    "Teasa Spaceport",
    "The Commons",
    "Traveler Rentals",
  ];

  const buyAreaToOrbit = {
    nyx: {
      levski: "Delamar",
      "nyx gateway": "Nyx",
    },
    pyro: {
      bloom: "Bloom",
      checkmate: "Pyro",
      "dudley & daughters": "Pyro",
      endgame: "Pyro",
      gaslight: "Pyro",
      "rat's nest": "Pyro",
      "ruin station": "Terminus",
      "starlight service station": "Pyro",
      "pyro gateway": "Pyro",
      "pyr2-l4": "Pyro",
      "pyr3-l1": "Pyro",
      "pyr3-l3": "Pyro",
      "pyr5-l2": "Pyro",
      "pyr5-l4": "Pyro",
      "pyr5-l5": "Pyro",
      "pyr6-l3": "Pyro",
      "pyr6-l4": "Pyro",
      "pyr6-l5": "Pyro",
      "orbituary": "Pyro",
      "pyro i": "Pyro",
      "pyro iv": "Pyro",
      "pyro v": "Pyro",
      "monox": "Pyro",
      "terminus": "Pyro",
    },
    stanton: {
      "area 18": "ArcCorp",
      area18: "ArcCorp",
      "astro armada": "ArcCorp",
      "baijini point": "ArcCorp",
      "crusader showroom": "Crusader",
      "everus harbor": "Hurston",
      "grim hex": "Crusader",
      "galleria": "Stanton",
      hurston: "Hurston",
      lorville: "Hurston",
      "microtech": "microTech",
      "new babbage": "microTech",
      "new deal": "Hurston",
      "port tressler": "microTech",
      "platinum bay": "Stanton",
      "seraphim station": "Crusader",
      "teasa spaceport": "Hurston",
      "teach's ship shop": "Delamar",
      "the commons": "microTech",
      "tammany and sons": "Hurston",
      "dumper's depot": "ArcCorp",
    },
  };

  const buyBusinessToArea = {
    "astro armada": "Area 18",
    "buy and fly": "",
    "covalex shipping office": "Orison",
    "cordy's armor & more": "Levski",
    "dumper's depot": "Area 18",
    "hats & more": "Levski",
    "hidden tigerscawl shop": "Levski",
    "kel-to": "New Babbage",
    "new deal": "Lorville",
    "omega pro": "New Babbage",
    "platinum bay": "",
    "shop_terminal": "",
    "tammany and sons": "Lorville",
    "teach's ship shop": "Levski",
  };

  const isKnownBuyArea = (value) => {
    const label = norm(value);
    if (!label) return false;
    return buyKnownAreas.some((entry) => norm(entry) === label);
  };

  const isKnownBuyOrbit = (value) => {
    const label = norm(value);
    if (!label) return false;
    return buyKnownOrbits.some((entry) => norm(entry) === label);
  };

  const isKnownBuyLocation = (value) => {
    const label = norm(value);
    if (!label) return false;
    return [
      "astro armada",
      "buy and fly",
      "cafe musain",
      "cordy's armor & more",
      "covalex shipping office",
      "dumper's depot",
      "hats & more",
      "hidden tigerscawl shop",
      "kel-to",
      "new deal",
      "omega pro",
      "platinum bay",
      "shop_terminal",
      "tammany and sons",
      "teach's ship shop",
    ].some((entry) => label.includes(entry));
  };

  const orbitFromArea = (system, area) => {
    const map = buyAreaToOrbit[norm(system)] || {};
    return cleanDisplayText(map[norm(area)] || "");
  };

  const areaFromBusiness = (value) => cleanDisplayText(buyBusinessToArea[norm(value)] || "");

  const businessMatch = (text) => {
    const hay = norm(text);
    if (!hay) return "";
    const labels = Object.keys(buyBusinessToArea).sort((a, b) => b.length - a.length);
    return cleanDisplayText(labels.find((label) => label && hay.includes(label)) || "");
  };

  const splitKnownTail = (text) => {
    const value = cleanDisplayText(text);
    const lower = norm(value);
    const sorted = [...buyKnownAreas].sort((a, b) => b.length - a.length);
    for (const label of sorted) {
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
  };

  const deriveBuyOfferFields = (offer) => {
    const raw = cleanDisplayText(offer?.locationLabel || offer?.locationPath || offer?.location || "");
    const system = cleanDisplayText(String(offer?.system || "").trim().split(/\s*>\s*/)[0] || "");
    const pieces = raw.split(/\s*-\s*|\s*>\s*/).map((part) => cleanDisplayText(part)).filter(Boolean);
    const hasParens = raw.match(/^(.+?)\s*\((.+)\)\s*$/);

    const rawArea = cleanDisplayText(offer?.area || "");
    let orbit = cleanDisplayText(offer?.orbit || offer?.planet || offer?.body || "");
    let area = "";
    let locationName = cleanDisplayText(offer?.locationName || offer?.locationLabel || offer?.location || "");
    const business = businessMatch([raw, offer?.locationPath || "", offer?.location || "", rawArea].join(" "));

    if (isKnownBuyOrbit(rawArea) && !orbit) {
      orbit = rawArea;
    } else if (isKnownBuyArea(rawArea)) {
      area = rawArea;
    } else if (rawArea && !buyIsBusinessLabel(rawArea) && !isKnownBuyLocation(rawArea)) {
      locationName = locationName || rawArea;
    }

    if (hasParens) {
      const outer = cleanDisplayText(hasParens[1]);
      const inner = cleanDisplayText(hasParens[2]);
      if (isKnownBuyArea(outer)) {
        area = area || outer;
        orbit = orbit || inner;
        if (!locationName) locationName = area;
      } else {
        locationName = locationName || outer;
        area = area || inner;
        orbit = orbit || orbitFromArea(system, area) || inner;
      }
    }

    if (!locationName && business) {
      locationName = business;
    }

    if (!area && business) {
      area = areaFromBusiness(business) || area;
    }

    if (pieces.length) {
      if (norm(system) === "nyx") {
        area = area || pieces[0];
        locationName = locationName || pieces[pieces.length - 1] || area;
      } else if (pieces.length >= 3) {
        if (isKnownBuyArea(pieces[0])) {
          area = area || pieces[0];
          locationName = locationName || pieces[pieces.length - 1] || area;
        } else if (isKnownBuyArea(pieces[1])) {
          area = area || pieces[1];
          locationName = locationName || pieces[0] || pieces[pieces.length - 1] || area;
        } else {
          area = area || pieces[1] || pieces[0];
          locationName = locationName || pieces[pieces.length - 1] || pieces[0] || area;
        }
      } else if (pieces.length === 2) {
        if (isKnownBuyArea(pieces[0])) {
          area = area || pieces[0];
          locationName = locationName || pieces[1] || area;
        } else if (isKnownBuyArea(pieces[1])) {
          area = area || pieces[1];
          locationName = locationName || pieces[0] || area;
        } else {
          area = area || pieces[1] || pieces[0];
          locationName = locationName || pieces[0] || area;
        }
      } else if (pieces.length === 1) {
        const split = splitKnownTail(pieces[0]);
        if (split) {
          locationName = locationName || split.prefix || split.tail;
          area = area || split.tail;
        } else if (!locationName) {
          locationName = pieces[0];
        }
      }
    }

    if (!area && pieces.length === 1) {
      const split = splitKnownTail(pieces[0]);
      if (split) {
        locationName = locationName || split.prefix || split.tail;
        area = area || split.tail;
      }
    }

    if (!area && business) {
      area = areaFromBusiness(business) || area;
    }

    if (!orbit) orbit = orbitFromArea(system, area) || orbitFromArea(system, locationName) || cleanDisplayText(offer?.orbit || offer?.planet || offer?.body || "");
    if (!orbit && norm(area) === "levski" && norm(system) === "nyx") orbit = "Delamar";
    if (!orbit && isKnownBuyArea(raw) && !isKnownBuyArea(area)) orbit = orbitFromArea(system, raw);
    if (!area) area = cleanDisplayText(offer?.area || orbit || "Other") || "Other";
    if (!locationName) locationName = area || raw || "Unknown location";

    const haystack = [raw, locationName, area, orbit].join(" ").toLowerCase();
    let resolvedSystem = system;
    if (!["Nyx", "Pyro", "Stanton"].includes(system)) {
      if (haystack.includes("levski")) resolvedSystem = "Nyx";
      else if (haystack.includes("orbituary") || haystack.includes("checkmate") || haystack.includes("ruin station") || haystack.includes("pyro gateway") || haystack.includes("pyro v") || haystack.includes("pyro i") || haystack.includes("monox") || haystack.includes("terminus") || haystack.includes("gaslight") || haystack.includes("rat's nest") || haystack.includes("endgame") || haystack.includes("dudley & daughters") || haystack.includes("megumi refueling") || haystack.includes("bloom")) resolvedSystem = "Pyro";
      else if (haystack.includes("area 18") || haystack.includes("lorville") || haystack.includes("orison") || haystack.includes("new babbage") || haystack.includes("teasa") || haystack.includes("arccorp") || haystack.includes("crusader") || haystack.includes("hurston") || haystack.includes("microtech") || haystack.includes("riker memorial") || haystack.includes("new deal") || haystack.includes("astro armada") || haystack.includes("teach's ship shop") || haystack.includes("buy and fly") || haystack.includes("port tressler") || haystack.includes("everus harbor") || haystack.includes("baijini point") || haystack.includes("seraphim station") || haystack.includes("tammany and sons") || haystack.includes("covalex shipping office") || haystack.includes("dumper's depot") || haystack.includes("kel-to")) resolvedSystem = "Stanton";
      else resolvedSystem = "Other";
    }

    return {
      raw,
      system: resolvedSystem || "Other",
      orbit: orbit || "Other",
      area: area || orbit || "Other",
      locationName: locationName || raw || "Unknown location",
      locationLabel: locationName || raw || "Unknown location",
    };
  };

  const normalizeRecord = (entry) => ({
    ...entry,
    offers: Array.isArray(entry?.offers)
      ? entry.offers.map((offer) => {
          const fields = deriveBuyOfferFields(offer);
          return { ...offer, system: fields.system, orbit: fields.orbit, area: fields.area, locationLabel: fields.locationLabel, locationName: fields.locationName };
        })
      : [],
  });

  const items = mergeByKey(baseData.items || [], partsData.items?.items || []).map(normalizeRecord);
  const ships = mergeByKey(baseData.ships || [], partsData.ships?.ships || []).map(normalizeRecord);
  const shipByName = new Map(ships.map((entry) => [norm(entry?.name), entry]));
  const rentalsSource = mergeByKey(baseData.rentals || [], partsData.rentals?.rentals || []).map(normalizeRecord);
  const rentals = rentalsSource.map((entry) => {
    const ship = shipByName.get(norm(entry?.name));
    return ship ? normalizeRecord(mergeRecord(ship, entry)) : entry;
  });
  return { items, ships, rentals };
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

function buyEntryShipCareer(entry) {
  return normalizeText(entry?.career || entry?.careerRole || entry?.careerType || "");
}

function buyEntryShipRole(entry) {
  return normalizeText(entry?.role || entry?.shipRole || entry?.roleType || "");
}

function buyEntryShipSize(entry) {
  const text = String(entry?.size || "").trim();
  const match = text.match(/^(Small|Medium|Large|Capital|Snub)\b/i);
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : "";
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
  return cleanDisplayText(offer?.orbit || offer?.planet || offer?.body || "");
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

function offerSystem(offer) {
  const system = cleanDisplayText(String(offer?.system || "").trim().split(/\s*>\s*/)[0] || "Other");
  if (["Nyx", "Pyro", "Stanton"].includes(system)) return system;
  return system || "Other";
}

function offerArea(offer) {
  return cleanDisplayText(offer?.area || "Other") || "Other";
}

function offerLocationName(offer) {
  return cleanDisplayText(offer?.locationName || offer?.locationLabel || offer?.location || "Unknown location") || "Unknown location";
}

const BUY_KNOWN_ORBITS = [
  "ArcCorp",
  "Bloom",
  "Crusader",
  "Delamar",
  "Hurston",
  "microTech",
  "Monox",
  "Nyx",
  "Pyro",
  "Terminus",
  "Yela",
];

const BUY_KNOWN_AREAS = [
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
  "PYR2-L4",
  "PYR3-L1",
  "PYR3-L3",
  "PYR5-L2",
  "PYR5-L4",
  "PYR5-L5",
  "PYR6-L3",
  "PYR6-L4",
  "PYR6-L5",
  "Rat's Nest",
  "Ruin Station",
  "Seraphim Station",
  "Stanton Gateway",
  "Starlight Service Station",
  "Teasa Spaceport",
  "The Commons",
  "Traveler Rentals",
];

const BUY_KNOWN_LOCATIONS = [
  "astro armada",
  "buy and fly",
  "cafe musain",
  "cordy's armor & more",
  "covalex shipping office",
  "dumper's depot",
  "hats & more",
  "hidden tigerscawl shop",
  "kel-to",
  "new deal",
  "omega pro",
  "platinum bay",
  "shop_terminal",
  "tammany and sons",
  "teach's ship shop",
];

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
  return BUY_KNOWN_LOCATIONS.some((entry) => label.includes(entry));
}

function buyOfferMatches(offer, system, orbit, area, location) {
  if (!offer) return false;
  if (system !== "All" && offerSystem(offer) !== system) return false;
  if (orbit !== "All" && offerOrbit(offer) !== orbit) return false;
  if (area !== "All" && offerArea(offer) !== area) return false;
  if (location !== "All" && offerLocationName(offer) !== location) return false;
  return true;
}

function filteredBuyOffers(entry, system = state.buySystem, orbit = state.buyOrbit, area = state.buyArea, location = state.buyLocation) {
  return buyEntryOffers(entry).filter((offer) => buyOfferMatches(offer, system, orbit, area, location));
}

function buySystems() {
  return ["All", "Nyx", "Pyro", "Stanton"];
}

function buyOrbits(system = state.buySystem) {
  const values = new Set();
  for (const entry of buyEntriesForTab()) {
    for (const offer of buyEntryOffers(entry)) {
      if (system !== "All" && offerSystem(offer) !== system) continue;
      const value = offerOrbit(offer);
      if (!isKnownBuyOrbit(value)) continue;
      if (buyIsBusinessLabel(value) || isKnownBuyArea(value)) continue;
      values.add(value);
    }
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyIsBusinessLabel(value) {
  const label = norm(value);
  if (!label || label === 'all') return false;
  return [
    'astro armada',
    "buy and fly",
    'crusader showroom',
    "dumper's depot",
    'new deal',
    "teach's",
    'hidden tigerscawl shop',
    "cordy's armor & more",
    'hats & more',
    'conscientious objects',
    'cafe musain',
  ].some((prefix) => label.startsWith(prefix));
}

function buyAreas(system = state.buySystem, orbit = state.buyOrbit) {
  const areas = new Set();
  for (const entry of buyEntriesForTab()) {
    for (const offer of buyEntryOffers(entry)) {
      if (system !== 'All' && offerSystem(offer) !== system) continue;
      if (orbit !== "All" && offerOrbit(offer) !== orbit) continue;
      const area = offerArea(offer);
      if (!isKnownBuyArea(area)) continue;
      if (buyIsBusinessLabel(area) || isKnownBuyOrbit(area) || isKnownBuyLocation(area)) continue;
      areas.add(area);
    }
  }
  return ['All', ...[...areas].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
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

function buyLocations(system = state.buySystem, orbit = state.buyOrbit, area = state.buyArea) {
  const locations = new Set();
  for (const entry of buyEntriesForTab()) {
    for (const offer of buyEntryOffers(entry)) {
      if (system !== "All" && offerSystem(offer) !== system) continue;
      if (orbit !== "All" && offerOrbit(offer) !== orbit) continue;
      if (area !== "All" && offerArea(offer) !== area) continue;
      const location = offerLocationName(offer);
      if (buyIsAreaLabel(location) || buyIsBusinessLabel(location) || isKnownBuyOrbit(location) || isKnownBuyArea(location)) continue;
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
    const value = buyEntryShipRole(entry);
    if (!isBadLabel(value)) values.add(value);
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
    for (const value of shipLoadoutDisplayNames(entry, "weapons")) {
      if (!isBadLabel(value)) values.add(value);
    }
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buyShipComponentOptions() {
  const values = new Set();
  for (const entry of buyEntriesForTab("ships")) {
    for (const value of shipLoadoutDisplayNames(entry, "components")) {
      if (!isBadLabel(value)) values.add(value);
    }
  }
  return ["All", ...[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
}

function buySearchText(entry, tab = state.buyTab) {
  const offers = buyEntryOffers(entry).map((offer) => [offer.location, offer.system, offer.orbit, offer.area, offer.price].filter(Boolean).join(" "));
  const shipExtras = tab === "ships" || tab === "rentals"
    ? [
        buyEntryShipCareer(entry),
        buyEntryShipRole(entry),
        buyEntryShipSize(entry),
        ...(Array.isArray(entry?.loadoutCategories) ? entry.loadoutCategories : []),
        ...shipLoadoutDisplayNames(entry, "weapons"),
        ...shipLoadoutDisplayNames(entry, "components"),
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
      if (state.buyType !== "All" && buyEntryType(entry) !== state.buyType) return false;
      if (state.buySubtype !== "All" && buyEntrySubtype(entry) !== state.buySubtype) return false;
      if (state.buyTab !== "items" && state.buyShipCareer !== "All" && buyEntryShipCareer(entry) !== state.buyShipCareer) return false;
      if (state.buyTab !== "items" && state.buyShipSize !== "All" && buyEntrySize(entry) !== state.buyShipSize) return false;
      if (state.buyTab !== "items" && state.buyShipRole !== "All" && buyEntryShipRole(entry) !== state.buyShipRole) return false;
      if (state.buyTab !== "items" && state.buyShipWeapon !== "All") {
        const weapons = shipLoadoutDisplayNames(entry, "weapons");
        if (!weapons.includes(state.buyShipWeapon)) return false;
      }
      if (state.buyTab !== "items" && state.buyShipComponent !== "All") {
        const components = shipLoadoutDisplayNames(entry, "components");
        if (!components.includes(state.buyShipComponent)) return false;
      }
      const offers = buyEntryOffers(entry);
      if (offers.length) {
        if (!offers.some((offer) => buyOfferMatches(offer, state.buySystem, state.buyOrbit, state.buyArea, state.buyLocation))) return false;
      } else if (state.buySystem !== "All" || state.buyOrbit !== "All" || state.buyArea !== "All" || state.buyLocation !== "All") {
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
  state.buyType = "All";
  state.buySubtype = "All";
  state.buyShipCareer = "All";
  state.buyShipSize = "All";
  state.buyShipRole = "All";
  state.buyShipWeapon = "All";
  state.buyShipComponent = "All";
  state.buySystem = "All";
  state.buyArea = "All";
  state.buyLocation = "All";
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
}

function saveState() {
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
      chip: state.chip,
      missionType: state.missionType,
      company: state.company,
      mission: state.mission,
      reward: state.reward,
      customReward: state.customReward,
      buyTab: state.buyTab,
      buySearch: state.buySearch,
      buySystem: state.buySystem,
      buyArea: state.buyArea,
      buyLocation: state.buyLocation,
      buyType: state.buyType,
      buySubtype: state.buySubtype,
      buyShipCareer: state.buyShipCareer,
      buyShipSize: state.buyShipSize,
      buySelectedId: state.buySelectedId,
      rail: state.rail,
      progressFocus: state.progressFocus,
      progressSubtype: state.progressSubtype,
      hideUnrankedCompanies: state.hideUnrankedCompanies,
    },
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

function missionTitle(m) {
  return m.title || m.type || "Unknown mission";
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
  return state.data?.items || [];
}

function missionItems() {
  return allItems().filter((item) => item.name && (item.missions || []).length);
}

function missionCatalog() {
  const map = new Map();
  for (const item of missionItems()) {
    for (const mission of item.missions || []) {
      if (isBadLabel(mission.title) || isBadLabel(mission.type) || isBadLabel(mission.faction)) continue;
      const key = `${mission.type}::${mission.faction}::${missionTitle(mission)}::${mission.system || (mission.systems || []).join(", ")}`;
      if (map.has(key)) continue;
      const rewards = rewardsFor(mission.type, mission.faction, missionTitle(mission));
      map.set(key, {
        ...mission,
        rewards,
        rewardCount: rewards.length,
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    const titleCompare = missionTitle(a).localeCompare(missionTitle(b), undefined, { sensitivity: "base" });
    return titleCompare || missionLabel(a).localeCompare(missionLabel(b));
  });
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
    ? items.slice(0, 40)
    : items.filter((mission) => {
    const rewardText = (mission.rewards || []).map((item) => item.name).join(" ");
    const text = [
      mission.type,
      mission.faction,
      mission.title,
      mission.system,
      mission.difficulty,
      mission.repStanding,
      mission.repReward,
      rewardText,
      missionDescription(mission),
    ].join(" ").toLowerCase();
    return text.includes(query);
  });
  return filtered.sort((a, b) => {
    const titleCompare = missionTitle(a).localeCompare(missionTitle(b), undefined, { sensitivity: "base" });
    return titleCompare || missionLabel(a).localeCompare(missionLabel(b));
  });
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
  return [...new Set(missionItems().flatMap((item) => (item.missions || []).map((m) => m.type)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function companiesForType(type) {
  return [...new Set(
    missionItems()
      .filter((item) => item.missions?.some((m) => m.type === type))
      .flatMap((item) => item.missions.filter((m) => m.type === type).map((m) => m.faction))
      .filter((name) => !isBadLabel(name)),
  )].sort((a, b) => a.localeCompare(b));
}

function missionsFor(type, company) {
  const map = new Map();
  for (const item of missionItems()) {
    for (const m of item.missions || []) {
      if (m.type === type && m.faction === company && !isBadLabel(m.title)) {
        const key = `${m.type}::${m.faction}::${m.title}`;
        if (!map.has(key)) map.set(key, m);
      }
    }
  }
  return [...map.values()].sort((a, b) => missionTitle(a).localeCompare(missionTitle(b)));
}

function rewardsFor(type, company, title) {
  const map = new Map();
  for (const item of missionItems()) {
    if (!item.name) continue;
    const matched = (item.missions || []).some((m) => m.type === type && m.faction === company && missionTitle(m) === title);
    if (matched) map.set(item.name, item);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function currentRewardOptions() {
  return rewardsFor(state.missionType, state.company, state.mission);
}

function currentItemDetail() {
  return state.selectedItem || missionItems().find((item) => !isOwned(item.name)) || missionItems()[0] || null;
}

function currentMissionDetail() {
  if (!state.missionType || !state.company || !state.mission) return null;
  return missionsFor(state.missionType, state.company).find((m) => missionTitle(m) === state.mission) || null;
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
      searchShell: true,
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
  const tone = mission?.lawful ? "Lawful contract" : "Unlawful contract";
  return `${tone} Â· ${missionLocation(mission)} Â· ${missionTitle(mission)}`;
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
    const mission = missionsFor(log.type, log.company).find((m) => missionTitle(m) === log.mission);
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
  const rank = m.repStanding ? m.repStanding : "Any rank";
  const rep = typeof m.minRep === "number" ? `, ${formatCount(m.minRep)} rep` : "";
  const system = m.system || (m.systems || []).join(", ") || "Unknown system";
  return `${rank}${rep} - ${system}`;
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

  const renderRows = (map) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(
        ([label, count]) => `
          <div class="summary-row">
            <div class="name"><span class="dot"></span>${label}</div>
            <div class="value">${formatCount(count)}</div>
          </div>
        `,
      )
      .join("");

  els.ownedTotal.textContent = formatCount(owned);
  els.missingTotal.textContent = formatCount(missing);
  els.ownedBreakdown.innerHTML = renderRows(ownedByType);
  els.missingBreakdown.innerHTML = renderRows(missingByType);
  els.footerOwned.textContent = `Owned: ${formatCount(owned)}`;
  els.footerMissing.textContent = `Missing: ${formatCount(missing)}`;
  els.footerWatch.textContent = state.watch.name ? `Watching: ${state.watch.name}` : "No monitored file";
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
                  <small>${item.subtype || "unknown"} Â· ${item.missions?.length || 0} mission links Â· ${isOwned(item.name) ? "owned" : "missing"}</small>
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
    els.selectedMeta.textContent = `${item.type} Â· ${item.subtype || "unknown"} Â· ${isOwned(item.name) ? "owned" : "missing"}`;
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
          ${missions.slice(0, 16).map((m) => `<button class="mission-line mission-link" type="button" data-mission-link data-mission-type="${m.type || ""}" data-mission-company="${m.faction || ""}" data-mission-title="${missionTitle(m)}"><div><strong>${m.type}</strong> Â· ${m.faction || "Unknown"}</div><div>${missionTitle(m)}</div><div class="muted">${formatMissionRequirement(m)}</div></button>`).join("")}
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
      els.selectedMeta.textContent = `Type Â· ${value}`;
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
      const bestLabel = best ? `${best.repStanding} Â· ${best.title}` : "No rank yet";
      els.selectedMeta.textContent = `Company Â· ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-kv"><span>Current rank</span><strong>${bestLabel}</strong></div>
          <div class="detail-kv"><span>Completed missions</span><strong>${formatCount(completed.length)}</strong></div>
          <div class="detail-kv"><span>Mission history</span><div class="mission-list">${completed.map((log) => `<div class="mission-line"><strong>${log.mission}</strong><div class="muted">${log.type} Â· ${log.reward || "reward logged"}</div></div>`).join("") || `<div class="muted">No missions logged yet.</div>`}</div></div>
        </div>
      `;
      return;
    }

    if (kind === "missing" && value) {
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      els.selectedMeta.textContent = `Still needed Â· ${value}`;
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
      els.selectedMeta.textContent = `Type Â· ${value}`;
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
      const bestLabel = best ? `${best.repStanding} Â· ${best.title}` : "No rank yet";
      els.selectedMeta.textContent = `Company Â· ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-kv"><span>Current rank</span><strong>${bestLabel}</strong></div>
          <div class="detail-kv"><span>Completed missions</span><strong>${formatCount(completed.length)}</strong></div>
          <div class="detail-kv"><span>Mission history</span><div class="mission-list">${completed.map((log) => `<button class="mission-line mission-link" type="button" data-mission-link="${log.type}::${log.company}::${log.mission}"><strong>${log.mission}</strong><div class="muted">${log.type} Â· ${log.reward || "reward logged"}</div></button>`).join("") || `<div class="muted">No missions logged yet.</div>`}</div></div>
        </div>
      `;
      return;
    }

    if (kind === "missing" && value) {
      const subtypeOptions = progressSubtypeOptions(value);
      const matchesSubtype = (item) => !subtype || progressSubtypeLabel(item) === subtype;
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      const missingFiltered = missingOfType.filter(matchesSubtype);
      els.selectedMeta.textContent = `Still needed Â· ${value}`;
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

  els.selectedMeta.textContent = `${mission.type} Â· ${mission.faction || "Unknown"} Â· ${mission.repStanding || "Any rank"}`;
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
          ${mission.lawful ? "Lawful contract" : "Unlawful contract"} Â· ${mission.system || "Unknown system"} Â· ${missionTitle(mission)}
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
    els.selectedMeta.textContent = `${item.type} Â· ${item.subtype || "unknown"} Â· ${isOwned(item.name) ? "owned" : "missing"}`;
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
            ${isOwned(item.name) ? `<button class="ghost-button" type="button" data-action="remove-owned">Remove from collection</button>` : `<button class="primary-button" type="button" data-action="mark-owned">Add to collection</button>`}
          </div>
        </div>
        <div class="detail-kv">
          <span>Mission links</span>
          <div class="mission-list">
            ${missions.slice(0, 16).map((m) => `<button class="mission-line mission-link" type="button" data-mission-link data-mission-type="${m.type || ""}" data-mission-company="${m.faction || ""}" data-mission-title="${missionTitle(m)}"><div><strong>${m.type}</strong> Â· ${m.faction || "Unknown"}</div><div>${missionTitle(m)}</div><div class="muted">${formatMissionRequirement(m)}</div></button>`).join("")}
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
      els.selectedMeta.textContent = `Type Â· ${value}`;
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
      const bestLabel = best ? `${best.repStanding} Â· ${best.title}` : "No rank yet";
      els.selectedMeta.textContent = `Company Â· ${value}`;
      els.selectedDetails.className = "detail-card";
      els.selectedDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-kv"><span>Current rank</span><strong>${bestLabel}</strong></div>
          <div class="detail-kv"><span>Completed missions</span><strong>${formatCount(completed.length)}</strong></div>
          <div class="detail-kv"><span>Mission history</span><div class="mission-list">${completed.map((log) => `<div class="mission-line"><strong>${log.mission}</strong><div class="muted">${log.type} Â· ${log.reward || "reward logged"}</div></div>`).join("") || `<div class="muted">No missions logged yet.</div>`}</div></div>
        </div>
      `;
      return;
    }

    if (kind === "missing" && value) {
      const subtypeOptions = progressSubtypeOptions(value);
      const matchesSubtype = (item) => !subtype || progressSubtypeLabel(item) === subtype;
      const missingOfType = missing.filter((item) => collectionCategory(item) === value);
      const missingFiltered = missingOfType.filter(matchesSubtype);
      els.selectedMeta.textContent = `Still needed Â· ${value}`;
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

  els.selectedMeta.textContent = "";
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
        <span>${formatCount(mission.repReward || 0)} points</span>
      </div>
      <p class="mission-description">${missionDescription(mission)}. Points for completion: ${formatCount(mission.repReward || 0)}.</p>
    </div>
    <div class="mission-section">
      <div class="mission-section-head">
        <span>Possible Rewards</span>
        <span>Total: ${formatCount(rewards.length)}</span>
      </div>
      <div class="mission-summary-line">Rewards left: ${formatCount(missingRewards.length)} Â· Points: ${formatCount(mission.repReward || 0)}</div>
      <div class="mission-list compact">
        ${rewards
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
          .join("")}
      </div>
    </div>
  `;
}

function renderMissionBrowser() {
  if (!els.missionSearchInput || !els.missionSearchResults) return;
  els.missionSearchInput.value = state.missionSearch || "";

  if (state.view !== "missions") {
    els.missionSearchResults.innerHTML = `<div class="muted">Open Missions to browse every mission and its details.</div>`;
    return;
  }

  const results = missionSearchItems();
  els.missionSearchResults.innerHTML = `
    <div class="search-summary">${formatCount(results.length)} missions</div>
    <div class="timeline">
      ${results
        .map(
          (mission) => `
            <button class="log-card search-result" type="button" data-mission="${mission.type}::${mission.faction}::${missionTitle(mission)}">
              <div class="reward">${missionTitle(mission)}</div>
              <div class="meta">
                <span>${mission.type || "Unknown"}</span>
                <span>${mission.faction || "Unknown"}</span>
                <span>${mission.repStanding || "Any rank"}</span>
                <span>${missionLocation(mission)}</span>
                <span>${formatCount(mission.rewardCount || 0)} rewards</span>
              </div>
              <div class="muted mission-snippet">${missionDescription(mission)}</div>
            </button>
          `,
        )
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
    const mission = missionsFor(entry.type, entry.company).find((m) => missionTitle(m) === entry.mission);
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
    .map(([type, stats]) => `<button class="log-card search-result" type="button" data-progress-kind="type" data-progress-value="${type}"><div class="reward">${type}</div><div class="muted">${formatCount(stats.owned)} owned Â· ${formatCount(stats.total)} total</div></button>`)
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
      return `<button class="log-card search-result" type="button" data-progress-kind="company" data-progress-value="${company}"><div class="reward">${company}</div><div class="muted">Current rank: ${rank} Â· from ${mission}</div></button>`;
    })
    .join("") || `<div class="muted">No ranked companies yet.</div>`;

  els.progressMissing.innerHTML = missing
    .slice(0, 40)
    .map((name) => {
      const item = missionItems().find((entry) => entry.name === name);
      return `<button class="log-card search-result" type="button" data-progress-kind="missing" data-progress-value="${collectionCategory(item)}"><div class="reward">${name}</div><div class="muted">Still needed Â· ${item?.type || "unknown"}</div></button>`;
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
  const first = offerLocationName(offers[0]);
  return offers.length === 1 ? first : `${first} + ${formatCount(offers.length - 1)} more`;
}

function renderBuy() {
  if (!els.buyResults || !els.buySelectedDetails) return;
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
    state.buyArea = "All";
    state.buyLocation = "All";
  }

  const orbits = buyOrbits(state.buySystem);
  if (!orbits.includes(state.buyOrbit)) {
    state.buyOrbit = "All";
    state.buyArea = "All";
    state.buyLocation = "All";
  }

  const areas = buyAreas(state.buySystem, state.buyOrbit);
  if (!areas.includes(state.buyArea)) {
    state.buyArea = "All";
    state.buyLocation = "All";
  }

  const locations = buyLocations(state.buySystem, state.buyOrbit, state.buyArea);
  if (!locations.includes(state.buyLocation)) state.buyLocation = "All";

  const types = buyTypeOptions();
  if (!types.includes(state.buyType)) {
    state.buyType = "All";
    state.buySubtype = "All";
  }

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
  if (els.buyLocationSelect) {
    els.buyLocationSelect.innerHTML = locations.map((value) => `<option value="${value}" ${value === state.buyLocation ? "selected" : ""}>${value}</option>`).join("");
    els.buyLocationSelect.value = state.buyLocation;
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
    .sort((a, b) => String(offerLocationName(a)).localeCompare(String(offerLocationName(b))));
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
  const selectedShipWeapons = shipLoadoutDisplayNames(selected, "weapons");
  const selectedShipComponents = shipLoadoutDisplayNames(selected, "components");
  const weaponCounts = countByName(selectedShipWeapons);
  const componentCounts = countByName(selectedShipComponents);
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
      <div class="detail-kv buy-detail-wide">
        <span>Availability</span>
        <div class="mission-list">
          ${sortedOffers
            .map((offer) => {
              const locationText = offerLocationName(offer);
              const system = offerSystem(offer);
              const orbit = offerOrbit(offer);
              const area = offerArea(offer);
              const location = cleanDisplayText(offer?.locationName || offer?.locationLabel || locationText || "");
              const offerPrice = Number(offer.price || 0);
              const offerPriceText = Number.isFinite(offerPrice) && offerPrice > 0 ? `${formatCount(offerPrice)} aUEC` : "";
              const hierarchy = [system, orbit, area, location].filter(Boolean).join(" | ");
              return `<div class="mission-line"><strong>${locationText}</strong><div class="muted">${hierarchy}${offerPriceText ? ` | ${offerPriceText}` : ""}</div></div>`;
            })
            .join("") || `<div class="muted">No availability data found for the current filters.</div>`}
        </div>
      </div>
      ${tab === "ships" || tab === "rentals" ? selectedShipWeapons.length ? `<div class="detail-kv buy-detail-wide"><span>Weapons</span><strong>${weaponCounts.map(([name, count]) => `${name} x ${count}`).join(" · ")}</strong></div>` : "" : ""}
      ${tab === "ships" || tab === "rentals" ? selectedShipComponents.length ? `<div class="detail-kv buy-detail-wide"><span>Components</span><strong>${componentCounts.map(([name, count]) => `${name} x ${count}`).join(" · ")}</strong></div>` : "" : ""}
      ${tab === "rentals" ? `<div class="detail-kv buy-detail-wide"><span>Rental pricing</span><div class="mission-list"><div class="mission-line"><strong>1 day / 3 days / 7 days</strong><div class="muted">${price}</div></div></div></div>` : ""}
    </div>
  `;
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
      .map((item) => `<div class="log-card"><div class="reward">${item.name}</div><div class="muted">${item.type} Â· owned</div></div>`)
      .join("") || `<div class="muted">No owned rewards yet.</div>`;
  els.statsMissingList.innerHTML =
    missing
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 36)
      .map((item) => `<div class="log-card"><div class="reward">${item.name}</div><div class="muted">${item.type} Â· missing</div></div>`)
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
  syncWizardState();
  renderUsers();
  renderRail();
  renderView();
  renderSummary();
  renderChips();
  renderCollection();
  renderWizard();
  renderMissionBrowser();
  renderSelected();
  renderSearchResults();
  renderBuy();
  renderLogs();
  renderProgress();
  renderStats();
  renderSettings();
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
    "missionSearchResults",
    "buyTabs",
    "buySearchInput",
    "buySystemSelect",
    "buyOrbitSelect",
    "buyAreaSelect",
    "buyLocationSelect",
    "buyTypeChips",
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
    "resetState",
    "themeDark",
    "themeLight",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  loadState();
  els.searchInput.value = state.search;

  state.data = await loadBlueprintData();
  state.buyData = await loadBuyData();

  renderAll();

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
  els.missionSearchResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mission]");
    if (!button) return;
    const [type, company, title] = button.dataset.mission.split("::");
    state.missionType = type || "";
    state.company = company || "";
    state.mission = title || "";
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
  els.buyTypeChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-buy-filter='type']");
    if (!button) return;
    state.buyType = button.dataset.value || "All";
    state.buySubtype = "All";
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
    state.buyLocation = "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyOrbitSelect?.addEventListener("change", (event) => {
    state.buyOrbit = event.target.value;
    state.buyArea = "All";
    state.buyLocation = "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyAreaSelect?.addEventListener("change", (event) => {
    state.buyArea = event.target.value;
    state.buyLocation = "All";
    state.buySelectedId = "";
    renderBuy();
    saveState();
  });
  els.buyLocationSelect?.addEventListener("change", (event) => {
    state.buyLocation = event.target.value;
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
  document.querySelectorAll(".rail-item").forEach((button) => {
    button.addEventListener("click", () => {
      const label = (button.getAttribute("aria-label") || "").toLowerCase();
      activateRail(label);
    });
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



