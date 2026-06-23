(function () {
  const clean = (value) => String(value || "").trim();
  const norm = (value) => clean(value).toLowerCase();

  const systems = {
    Nyx: {
      orbits: [],
    },
    Pyro: {
      orbits: [],
    },
    Stanton: {
      orbits: [],
    },
  };

  const splitPath = (text) =>
    clean(text)
      .split(/\s*-\s*|\s*>\s*/)
      .map(clean)
      .filter(Boolean);

  const pathParts = (offer) => {
    const raw = clean(offer?.location || offer?.locationPath || offer?.locationLabel || "");
    const parts = splitPath(raw);
    if (!parts.length) return { orbit: "", location: "" };
    if (parts.length === 1) {
      return {
        orbit: clean(offer?.area || offer?.orbit || ""),
        location: "",
      };
    }
    return {
      orbit: parts[1] || clean(offer?.area || offer?.orbit || ""),
      location: parts.slice(2).join(" - "),
    };
  };

  window.SC_ITEMS_API = {
    systems,
    getOrbits(system) {
      const label = clean(system);
      if (!label || !systems[label] || !Array.isArray(systems[label].orbits)) return [];
      return systems[label].orbits.map((orbit) => orbit.label);
    },
    resolveOrbit(offer) {
      return pathParts(offer).orbit;
    },
    resolveLocation(offer) {
      return pathParts(offer).location;
    },
  };
})();
