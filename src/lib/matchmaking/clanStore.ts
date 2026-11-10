import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ClanCandidate, MatchVector } from "./types.ts";
import { lookupCity, getCorridorEfficiency } from "../geo/gazetteer.ts";

let clanIndexById: Map<string, ClanCandidate> | null = null;
let allClansCache: ClanCandidate[] | null = null;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 1);
}

function computeJaccardCosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccard = unionSize === 0 ? 0 : intersectionCount / unionSize;
  const cosine = intersectionCount / Math.sqrt(tokensA.length * tokensB.length);

  return 0.4 * jaccard + 0.6 * cosine;
}

export function loadClans(): ClanCandidate[] {
  if (allClansCache) {
    return allClansCache;
  }

  const seededPath = resolve(process.cwd(), "data/seeded-clans.json");
  const rawData = readFileSync(seededPath, "utf-8");
  allClansCache = JSON.parse(rawData) as ClanCandidate[];

  clanIndexById = new Map();
  for (const clan of allClansCache) {
    clanIndexById.set(clan.id, clan);
  }

  return allClansCache;
}

export function getClanById(clanId: string): ClanCandidate | null {
  loadClans();
  return clanIndexById!.get(clanId) || null;
}

export function getAllClans(): ClanCandidate[] {
  return loadClans();
}

export function saveClan(clan: ClanCandidate): void {
  loadClans();
  clanIndexById!.set(clan.id, clan);

  const existingIndex = allClansCache!.findIndex(c => c.id === clan.id);
  if (existingIndex >= 0) {
    allClansCache![existingIndex] = clan;
  } else {
    allClansCache!.unshift(clan);
  }

  // Test runs keep new groups in memory so they never leak into the shipped catalog.
  if (process.env.NODE_TEST_CONTEXT || process.env.WHOLESHARE_PERSIST_CLANS === "0") return;
  const seededPath = resolve(process.cwd(), "data/seeded-clans.json");
  writeFileSync(seededPath, JSON.stringify(allClansCache, null, 2), "utf-8");
}

export function retrieveCandidateClans(
  matchVector: MatchVector,
  limit: number = 20
): ClanCandidate[] {
  const clans = loadClans();
  const queryTokens = [
    ...tokenize(matchVector.canonicalSku),
    ...tokenize(matchVector.industryVertical)
  ];

  const userCity = lookupCity(matchVector.city);

  const scoredCandidates = clans.map(clan => {
    const clanTokens = [
      ...tokenize(clan.canonicalSku),
      ...tokenize(clan.industryVertical)
    ];

    const semanticSim = computeJaccardCosineSimilarity(queryTokens, clanTokens);

    let hsBonus = 0;
    if (
      matchVector.hsCodePrefix &&
      clan.hsCodePrefix &&
      (clan.hsCodePrefix.startsWith(matchVector.hsCodePrefix.slice(0, 4)) ||
        matchVector.hsCodePrefix.startsWith(clan.hsCodePrefix.slice(0, 4)))
    ) {
      hsBonus = 0.25;
    }

    const isDomestic = clan.countryCode === matchVector.countryCode;
    let geoCorridorScore = 0.5;

    if (userCity) {
      const clanCity = lookupCity(clan.city);
      if (clanCity) {
        const corridor = getCorridorEfficiency(userCity, clanCity);
        geoCorridorScore = corridor.score;
      }
    }

    const retrievalScore =
      0.60 * (semanticSim + hsBonus) +
      0.25 * geoCorridorScore +
      (isDomestic ? 0.15 : 0.05);

    return {
      clan: {
        ...clan,
        isCrossBorder: !isDomestic
      },
      retrievalScore
    };
  });

  scoredCandidates.sort((a, b) => b.retrievalScore - a.retrievalScore);

  return scoredCandidates.slice(0, limit).map(item => item.clan);
}

