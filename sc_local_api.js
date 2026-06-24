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
    const raw = clean(offer?.location || offer?.locationPath || offer?.locationLabel || offer?.locationName || "");
    const parts = splitPath(raw);
    if (!parts.length) {
      return {
        orbit: clean(offer?.orbit || offer?.planet || offer?.body || offer?.area || ""),
        location: clean(offer?.locationPath || offer?.locationLabel || offer?.locationName || ""),
      };
    }
    if (parts.length === 1) {
      return {
        orbit: clean(offer?.area || offer?.orbit || offer?.planet || offer?.body || parts[0]),
        location: "",
      };
    }
    return {
      orbit: parts[1] || clean(offer?.area || offer?.orbit || offer?.planet || offer?.body || ""),
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
