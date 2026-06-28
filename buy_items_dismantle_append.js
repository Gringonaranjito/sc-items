(() => {
  const rows = Array.isArray(window.SCMINERSDB_DISMANTLE_RETURNS) ? window.SCMINERSDB_DISMANTLE_RETURNS : [];
  const catalog = window.BUY_ITEMS_DATA && Array.isArray(window.BUY_ITEMS_DATA.items) ? window.BUY_ITEMS_DATA.items : [];
  if (!rows.length || !catalog.length) return;

  const clean = (value) => String(value || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const norm = (value) => clean(value).toLowerCase();
  const nameOf = (entry) =>
    clean(
      entry?.source_item?.item_name ||
        entry?.source_item?.item_record_name ||
        entry?.source_item?.name ||
        entry?.source_item?.label ||
        entry?.source_item?.display_name ||
        entry?.source_item?.item_class_name ||
        entry?.source_item?.class_name ||
        entry?.name ||
        entry?.source_id ||
        "",
    );
  const classify = (name) => {
    const lower = norm(name);
    if (/battery\b/.test(lower)) return { type: "Ammo", subtype: "Energy" };
    if (/magazine|clip|cap\b/.test(lower)) return { type: "Ammo", subtype: "Ballistic" };
    if (/beam|tool|salvage|repair|mining|tractor/.test(lower)) return { type: "Utility", subtype: "Utility" };
    return { type: "Miscellaneous", subtype: "Miscellaneous" };
  };

  const existing = new Set(catalog.map((item) => norm(item?.name)));
  const seen = new Set();
  const additions = [];

  for (const entry of rows) {
    const name = nameOf(entry);
    const key = norm(name);
    if (!key || seen.has(key) || existing.has(key)) continue;
    seen.add(key);
    const { type, subtype } = classify(name);
    additions.push({
      id: clean(entry?.source_id || entry?.source_item?.item_id || entry?.source_item?.item_class_id || name),
      name,
      type,
      subtype,
      missions: [],
      craftable: false,
      blueprint: "",
      craftTime: 0,
      materials: [],
      offers: [],
      source_path: clean(entry?.source_item_source_path || entry?.source_item?.source_path || ""),
      source_id: clean(entry?.source_id || entry?.source_item?.item_id || entry?.source_item?.item_class_id || ""),
      source_item: entry?.source_item || null,
      synthetic: true,
    });
  }

  if (additions.length) {
    window.BUY_ITEMS_DATA.items.push(...additions);
  }
})();
