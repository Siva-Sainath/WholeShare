import { getDeliveryStorage } from "../storage/delivery.storage.ts";

// The story shipments are marked rolling. Their dates are moved forward when they go stale, so a judge who opens the app
// days after it was built still finds one shipment in transit and one delivered inside its 48 hour inspection window.
// A shipment the user has already changed is left alone until it goes stale.
const HOUR = 3600 * 1000;

export function rebaseStoryShipments(now = Date.now()) {
  const storage = getDeliveryStorage();
  let moved = 0;
  for (const record of storage.getAll()) {
    if (!record.rolling) continue;
    const iso = (offsetHours) => new Date(now + offsetHours * HOUR).toISOString();
    if (record.rolling === "IN_TRANSIT") {
      const due = Date.parse(record.expectedDeliveryAt || "") || 0;
      if (due - now > 12 * HOUR) continue;
      storage.upsert({ ...record, status: "IN_TRANSIT", buyerDeliveredAt: null, inspectionWindowEndsAt: null, createdAt: iso(-54), shipDate: iso(-30), supplierDeliveredAt: iso(-30), expectedDeliveryAt: iso(60) });
      moved += 1;
    } else if (record.rolling === "DELIVERED") {
      const delivered = Date.parse(record.buyerDeliveredAt || "") || 0;
      if (now - delivered < 30 * HOUR && delivered) continue;
      storage.upsert({ ...record, status: "DELIVERED", createdAt: iso(-96), shipDate: iso(-72), supplierDeliveredAt: iso(-24), expectedDeliveryAt: iso(-12), buyerDeliveredAt: iso(-10), inspectionWindowEndsAt: iso(38) });
      moved += 1;
    }
  }
  return moved;
}
