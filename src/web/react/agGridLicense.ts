import { LicenseManager } from "ag-grid-enterprise";
import { AgStudioLicenseManager } from "ag-studio";

declare const process: { env: { AG_LICENSE_KEY?: string; AG_STUDIO_LICENSE_KEY?: string } };

// Injected at bundle time from AG_LICENSE_KEY. It is never committed.
export const AG_GRID_LICENSE_KEY = process.env.AG_LICENSE_KEY ?? "";
// AG Grid and AG Studio can use different keys. Studio falls back to the Grid key.
export const AG_STUDIO_LICENSE_KEY = process.env.AG_STUDIO_LICENSE_KEY || AG_GRID_LICENSE_KEY;

let initialized = false;
export function initAgGridLicense(): void {
  if (initialized || !AG_GRID_LICENSE_KEY) return;
  initialized = true;
  LicenseManager.setLicenseKey(AG_GRID_LICENSE_KEY);
  AgStudioLicenseManager.setLicenseKey(AG_STUDIO_LICENSE_KEY);
}
