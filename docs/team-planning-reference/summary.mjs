import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { analyzeScenario, listCatalogs, loadCatalog } from "./planner.mjs";

// Usage: node summary.mjs [--json] [catalog ...]

function parseArguments(args) {
  const catalogs = [];
  let json = false;
  for (const arg of args) {
    if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("-")) {
      throw new RangeError("Unknown option " + arg);
    } else if (!catalogs.includes(arg)) {
      catalogs.push(arg);
    }
  }
  return { catalogs, json };
}

function tallyRisk(counts, report) {
  const risk = report.primaryRisk;
  counts.set(risk, (counts.get(risk) ?? 0) + 1);
}

function comparePriority(left, right) {
  return right.staffingGap - left.staffingGap ||
    left.spareHours - right.spareHours ||
    left.id.localeCompare(right.id);
}

export function summarizeCatalog(catalog, scenarios) {
  const riskCounts = new Map();
  const priorities = [];
  let capacityHours = 0;
  let plannedHours = 0;
  let reserveHours = 0;
  let shortfallHours = 0;
  let missingRoles = 0;

  for (const scenario of scenarios) {
    const report = analyzeScenario(scenario);
    capacityHours += report.capacity;
    plannedHours += report.workload;
    reserveHours += report.reserveHours;
    if (report.status === "needs-adjustment") {
      priorities.push(report);
      tallyRisk(riskCounts, report);
      shortfallHours += Math.max(0, -report.spareHours);
      missingRoles += report.staffingGap;
    }
  }
  const risks = Array.from(riskCounts, ([risk, count]) => ({ risk, count }));
  risks.sort((left, right) => right.count - left.count || left.risk.localeCompare(right.risk));
  priorities.sort(comparePriority);

  return {
    catalog,
    scenarios: scenarios.length,
    withinCapacity: scenarios.length - priorities.length,
    needsAdjustment: priorities.length,
    capacityHours,
    plannedHours,
    reserveHours,
    shortfallHours,
    missingRoles,
    risks,
    priorities: priorities.slice(0, 3),
  };
}

function formatSummary(report) {
  const lines = [
    report.catalog,
    "  Scenarios: " + report.scenarios,
    "  Within capacity: " + report.withinCapacity,
    "  Need adjustment: " + report.needsAdjustment,
    "  Total capacity: " + report.capacityHours + " h",
    "  Planned work and reserve: " + (report.plannedHours + report.reserveHours) + " h",
    "  Combined shortfall: " + report.shortfallHours + " h",
    "  Combined staffing gap: " + report.missingRoles,
  ];

  if (report.risks.length > 0) {
    lines.push("  Risks among plans needing adjustment:");
    for (const { risk, count } of report.risks) {
      lines.push("    " + risk + " (" + count + ")");
    }
  }

  if (report.priorities.length > 0) {
    lines.push("  First plans to review:");
    for (const item of report.priorities) {
      const hours = Math.max(0, -item.spareHours);
      lines.push("    " + item.id + " (" + hours + " h and " + item.staffingGap + " roles short)");
    }
  }

  return lines.join("\n");
}

async function main(args) {
  const options = parseArguments(args);
  const names = options.catalogs.length > 0 ? options.catalogs : await listCatalogs();
  const summaries = [];
  for (const name of names) {
    const scenarios = await loadCatalog(name);
    summaries.push(summarizeCatalog(name, scenarios));
  }
  const output = options.json
    ? JSON.stringify(summaries, null, 2)
    : summaries.map(formatSummary).join("\n\n");
  console.log(output);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
