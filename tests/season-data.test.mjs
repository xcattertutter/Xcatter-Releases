import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "desktop");
const read = (name) => fs.readFileSync(path.join(desktop, name), "utf8");
const items = JSON.parse(read("items-tartarus.json"));
const zones = JSON.parse(read("zones-tartarus.json"));
const electron = read("electron.mjs");
const byId = new Map(items.items.map((item) => [String(item.id), item]));
const nameOf = (id) => byId.get(String(id))?.name_en || `Unknown item ${id}`;

function extract(source, pattern) {
  const match = source.match(pattern);
  assert.ok(match, `could not find ${pattern} in electron.mjs`);
  return match[0];
}

test("ships the SS14 Tartarus item catalog", () => {
  assert.equal(items.meta.revision, 2);
  assert.equal(items.items.length, 2191);
  assert.equal(byId.get("100300")?.name_en, "Flame Elementium");
  for (const [id, name] of [["10330", "Darkiron Shackles"], ["10331", "Mercury Shackles"], ["10332", "Redgold Shackles"], ["7347", "Voltaic Ripple"], ["7350", "Forking Thunder"]]) {
    assert.equal(byId.get(id)?.name_en, name);
  }
});

test("recycled config ids carry the SS14 name", () => {
  assert.equal(byId.get("10320")?.name_en, "Afterlight Compass");
  assert.equal(byId.get("10122")?.name_en, "Wild War Compass");
  assert.equal(byId.get("113252")?.name_en, "Crimson Gash");
});

test("seasonal compasses are treated as map costs", () => {
  const catalog = new Map([...byId].map(([id, item]) => [Number(id), { name: item.name_en || null, type: item.type_cn || null }]));
  const source = extract(electron, /function isMapCostItem\(id\) \{[\s\S]*?\n\}/);
  const isMapCostItem = new Function("itemCatalog", "itemName", `${source}; return isMapCostItem;`)(catalog, nameOf);
  // SS14 seasonal compasses ("Shackles") have no "compass" in their English name.
  assert.equal(isMapCostItem(10330), true);
  assert.equal(isMapCostItem(10320), true);
  // Follower skills that happen to be named "... Shackles" are not map costs.
  assert.equal(isMapCostItem(7208), false);
  // Plain loot stays out.
  assert.equal(isMapCostItem(100300), false);
});

test("resolves every SS14 zone", () => {
  const source = extract(electron, /function zoneDetails\(raw, levelId = null\) \{[\s\S]*?\n\}/);
  const zoneDetails = new Function("zoneCatalog", `${source}; return zoneDetails;`)(zones);
  const at = (map, id) => `/Game/Art/Maps/01SD/${map}${id}/PersistentLevel`;
  assert.equal(zoneDetails(at("ZhongZuiDiYu", 235501), 235501).name, "Tartarus in Riot");
  assert.equal(zoneDetails(at("JH_YWMD_00001", 3001), 3001).name, "Voidlands - Yesterday Chamber");
  assert.equal(zoneDetails(at("JH_YWMD_00003", 3003), 3003).name, "Thunder Wastes - Chamber of Confusion");
  // A generic hideout must not shadow the SS14 / voidlands palace map.
  assert.equal(zoneDetails(at("DD_ShengTingZhuangYuan000", 1200), 1200).name, "Voidlands - Mundane Palace");
  // LevelId suffix 07 must still resolve Grimwind Woods to its region.
  assert.equal(zoneDetails(at("YL_BeiFengLinDi", 4607), 4607).name, "Glacial Abyss - Grimwind Woods");
  assert.equal(zoneDetails(at("YL_BeiFengLinDi", 5454), 5454).name, "Voidlands - Grimwind Woods");
  assert.equal(zoneDetails(at("XZ_YuJinZhiXiBiNanSuo", 200), 200).hub, true);
});

test("season detection follows the game log", () => {
  const parts = [
    extract(electron, /const SEASONS = \{[\s\S]*?\n\};/),
    extract(electron, /const LATEST_SEASON_ID = \d+;/),
    extract(electron, /const currentSeason = \{[^}]*\};/),
    extract(electron, /function seasonInfo\(id\) \{[\s\S]*?\n\}/),
    extract(electron, /function applySeason\(id\) \{[\s\S]*?\n\}/),
  ];
  const live = { season: null };
  const cloudConfig = { season: "ss14-tartarus" };
  let saves = 0; let broadcasts = 0;
  const applySeason = new Function("live", "cloudConfig", "saveCloudConfig", "broadcastLive", `${parts.join("\n")}; return applySeason;`)(live, cloudConfig, () => saves++, () => broadcasts++);
  applySeason(1501);
  assert.equal(live.season.label, "SS13 Afterlight");
  assert.equal(cloudConfig.season, "ss13-afterlight");
  assert.equal(broadcasts, 1);
  applySeason(1501);
  assert.equal(broadcasts, 1);
  applySeason(1701);
  assert.equal(live.season.label, "Season 1701");
  assert.equal(cloudConfig.season, "season-1701");
  assert.ok(saves >= 2);
});

test("electron loads the Tartarus data and detects the season from the log", () => {
  assert.match(electron, /items-tartarus\.json/);
  assert.match(electron, /zones-tartarus\.json/);
  assert.doesNotMatch(electron, /afterlight\.json/);
  assert.match(electron, /1601: \{ label: "SS14 Tartarus"/);
  assert.match(electron, /\\\+SeasonId\\s\*\\\[\(\\d\+\)\\\]/);
});
