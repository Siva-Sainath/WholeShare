// Where a group's order is received. One shared point (a warehouse everyone collects from) or several (each member or cluster has its own).
const MAX_POINTS = 5;
const clip = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function normaliseFulfilment(input, fallbackCity = "", fallbackCountry = "") {
  if (input === undefined || input === null) return { fulfilment: { mode: "SINGLE_POINT", points: [{ label: "Receiving point", address: "", city: clip(fallbackCity, 60), countryCode: clip(fallbackCountry, 2).toUpperCase() || undefined }] } };
  if (typeof input !== "object") return { error: "Shipment points must be an object with a mode and a list of points." };
  const mode = input.mode === "MULTIPLE_POINTS" ? "MULTIPLE_POINTS" : input.mode === "SINGLE_POINT" || input.mode === undefined ? "SINGLE_POINT" : null;
  if (!mode) return { error: "Shipment mode must be SINGLE_POINT or MULTIPLE_POINTS." };
  const raw = Array.isArray(input.points) ? input.points : [];
  const points = raw.slice(0, MAX_POINTS).map((point, index) => ({
    label: clip(point?.label, 60) || (mode === "SINGLE_POINT" ? "Receiving point" : `Point ${index + 1}`),
    address: clip(point?.address, 160),
    city: clip(point?.city, 60) || clip(fallbackCity, 60),
    countryCode: clip(point?.countryCode, 2).toUpperCase() || (clip(fallbackCountry, 2).toUpperCase() || undefined)
  }));
  if (points.length === 0) points.push({ label: "Receiving point", address: "", city: clip(fallbackCity, 60), countryCode: clip(fallbackCountry, 2).toUpperCase() || undefined });
  if (mode === "SINGLE_POINT" && points.length > 1) return { error: "A single receiving point can have only one address. Use several points for more." };
  if (mode === "MULTIPLE_POINTS" && points.length < 2) return { error: "Several points need at least two addresses." };
  return { fulfilment: { mode, points } };
}
