import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Standalone reference for capacity planning with synthetic student teams.
// List catalogs: node planner.mjs
// Inspect plans: node planner.mjs campus-support ticket-triage

export function analyzeScenario(scenario) {
  const {
    id,
    title,
    teamSize,
    hoursPerMember,
    overheadPercent,
    availableWeeks,
    plannedWork,
    reserveHours,
    checkpointWeek,
    requiredRoles,
    primaryRisk,
  } = scenario;
  if (!Number.isInteger(teamSize) || teamSize < 1 ||
      !Number.isFinite(hoursPerMember) || hoursPerMember <= 0 ||
      !Number.isInteger(availableWeeks) || availableWeeks < 1 ||
      !Number.isFinite(overheadPercent) || overheadPercent < 0 || overheadPercent >= 100 ||
      !Number.isFinite(reserveHours) || reserveHours < 0 ||
      !Number.isInteger(checkpointWeek) || checkpointWeek < 1 || checkpointWeek > availableWeeks ||
      Object.values(plannedWork).some((hours) => !Number.isFinite(hours) || hours < 0)) {
    throw new RangeError(`Invalid capacity or workload in ${id}`);
  }

  const weeklyCapacity = teamSize * hoursPerMember * (100 - overheadPercent) / 100;
  const capacity = Math.floor(weeklyCapacity * availableWeeks);
  const workload = Object.values(plannedWork).reduce((total, hours) => total + hours, 0);
  const scheduled = workload + reserveHours;
  const spareHours = capacity - scheduled;
  const staffingGap = Math.max(0, new Set(requiredRoles).size - teamSize);
  const checkpointCapacity = Math.floor(weeklyCapacity * checkpointWeek);

  return {
    id,
    title,
    capacity,
    workload,
    reserveHours,
    spareHours,
    staffingGap,
    checkpointCapacity,
    primaryRisk,
    status: spareHours < 0 || staffingGap > 0 ? "needs-adjustment" : "within-capacity",
  };
}

export async function listCatalogs() {
  const entries = await readdir(new URL(".", import.meta.url), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^catalog-[a-z-]+\.mjs$/.test(entry.name))
    .map((entry) => entry.name.slice("catalog-".length, -".mjs".length))
    .sort();
}

export async function loadCatalog(name) {
  const catalogs = await listCatalogs();
  if (!catalogs.includes(name)) {
    throw new RangeError(`Catalog not found: ${name}`);
  }
  const { default: scenarios } = await import(new URL(`catalog-${name}.mjs`, import.meta.url));
  return scenarios;
}

async function run(args) {
  const [catalog, filter, extra] = args;
  if (extra !== undefined) {
    throw new Error(`Usage: node ${basename(import.meta.filename)} [catalog [scenario]]`);
  }
  if (catalog === undefined) {
    console.log((await listCatalogs()).join("\n"));
    return;
  }
  const scenarios = await loadCatalog(catalog);
  const selected = filter === undefined
    ? scenarios
    : scenarios.filter(({ id }) => id === filter || id.startsWith(`${filter}:`));
  if (selected.length === 0) {
    throw new RangeError(`Scenario not found in ${catalog}: ${filter}`);
  }
  console.log(JSON.stringify(selected.map(analyzeScenario), null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
