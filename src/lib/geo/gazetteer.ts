import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GazetteerCity } from "../matchmaking/types.ts";
import { GLOBAL_LOGISTICS_CORRIDORS } from "../international-trade.js";

let cachedCities: GazetteerCity[] | null = null;
let cityIndexByName: Map<string, GazetteerCity> | null = null;

export function loadGazetteer(): GazetteerCity[] {
  if (cachedCities) {
    return cachedCities;
  }

  const gazetteerPath = resolve(process.cwd(), "data/world-cities.json");
  const rawData = readFileSync(gazetteerPath, "utf-8");
  cachedCities = JSON.parse(rawData) as GazetteerCity[];

  cityIndexByName = new Map();
  for (const item of cachedCities) {
    cityIndexByName.set(item.city.toLowerCase(), item);
  }

  return cachedCities;
}

export function lookupCity(query: string): GazetteerCity | null {
  if (!query || typeof query !== "string") {
    return null;
  }

  loadGazetteer();
  const normalized = query.trim().toLowerCase();

  const directMatch = cityIndexByName!.get(normalized);
  if (directMatch) {
    return directMatch;
  }

  for (const [key, value] of cityIndexByName!.entries()) {
    if (key.startsWith(normalized) || normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function findNearestCity(lat: number, lng: number): GazetteerCity {
  const cities = loadGazetteer();
  let nearestCity = cities[0];
  let minDistance = Infinity;

  for (const city of cities) {
    const dist = calculateHaversineDistanceKm(lat, lng, city.lat, city.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestCity = city;
    }
  }

  return nearestCity;
}

export function getCorridorEfficiency(
  origin: GazetteerCity,
  destination: GazetteerCity
): { score: number; corridorId?: string; isDomestic: boolean; distanceKm: number } {
  const distanceKm = calculateHaversineDistanceKm(
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng
  );

  const isDomestic = origin.countryCode === destination.countryCode;

  if (isDomestic) {
    const decay = Math.exp(-distanceKm / 1200);
    const score = Math.max(0.70, Math.min(1.0, 0.70 + 0.30 * decay));
    return {
      score: Math.round(score * 1000) / 1000,
      isDomestic: true,
      distanceKm: Math.round(distanceKm)
    };
  }

  let matchedCorridorId: string | undefined;
  let corridorBonus = 0.0;

  const originCountry = origin.countryCode;
  const destCountry = destination.countryCode;

  for (const corridor of GLOBAL_LOGISTICS_CORRIDORS) {
    if (
      (originCountry === "CN" && destCountry === "US") ||
      (originCountry === "IN" && destCountry === "DE") ||
      (originCountry === "CO" && destCountry === "DE") ||
      (originCountry === "DE" && destCountry === "IT") ||
      (originCountry === "KE" && destCountry === "NL") ||
      (originCountry === "JP" && destCountry === "KR")
    ) {
      matchedCorridorId = corridor.id;
      corridorBonus = 0.15;
      break;
    }
  }

  const globalDistanceScore = Math.max(0.40, Math.min(0.85, 1.0 - distanceKm / 20000));
  const finalScore = Math.min(0.98, globalDistanceScore + corridorBonus);

  return {
    score: Math.round(finalScore * 1000) / 1000,
    corridorId: matchedCorridorId,
    isDomestic: false,
    distanceKm: Math.round(distanceKm)
  };
}
