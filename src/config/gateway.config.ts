import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

function maskSecret(value: string | undefined): string {
  if (!value) return "[NOT_SET]";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export const GatewayConfigSchema = z
  .object({
    PAYPAL_MODE: z.enum(["sandbox", "live"], {
      errorMap: () => ({ message: "PAYPAL_MODE must be either 'sandbox' or 'live'" }),
    }),
    PAYPAL_CLIENT_ID: z
      .string()
      .min(1, "PAYPAL_CLIENT_ID is required and cannot be empty"),
    PAYPAL_CLIENT_SECRET: z
      .string()
      .min(1, "PAYPAL_CLIENT_SECRET is required and cannot be empty"),
    PAYPAL_BASE_URL: z
      .string()
      .url("PAYPAL_BASE_URL must be a valid URL string"),
    PAYPAL_WEBHOOK_ID: z
      .string()
      .min(1)
      .optional()
      .nullable()
      .transform((val) => (val ? val.trim() : null)),
    PORT: z
      .coerce
      .number()
      .int()
      .positive("PORT must be a positive integer")
      .default(3000),
    PAYPAL_KEY_RETENTION_HOURS: z
      .coerce
      .number()
      .positive("PAYPAL_KEY_RETENTION_HOURS must be a positive number with no default fallback"),
    MAX_PENDING_RECHECK_COUNT: z
      .coerce
      .number()
      .int()
      .positive("MAX_PENDING_RECHECK_COUNT must be a positive integer with no default fallback"),
    AUTHORIZATION_VALIDITY_DAYS: z
      .coerce
      .number()
      .positive("AUTHORIZATION_VALIDITY_DAYS must be a positive number with no default fallback"),
    RECONCILIATION_POLL_INTERVAL_SECONDS: z
      .coerce
      .number()
      .positive("RECONCILIATION_POLL_INTERVAL_SECONDS must be positive")
      .default(300),
    INSPECTION_WINDOW_HOURS: z
      .coerce
      .number()
      .positive("INSPECTION_WINDOW_HOURS must be positive")
      .default(48),
  })
  .superRefine((data, ctx) => {
    const pollIntervalHours = data.RECONCILIATION_POLL_INTERVAL_SECONDS / 3600;
    if (pollIntervalHours >= data.INSPECTION_WINDOW_HOURS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RECONCILIATION_POLL_INTERVAL_SECONDS"],
        message: `Poll interval (${data.RECONCILIATION_POLL_INTERVAL_SECONDS}s) must be strictly shorter than the inspection window (${data.INSPECTION_WINDOW_HOURS}h).`,
      });
    }

    const validityHours = data.AUTHORIZATION_VALIDITY_DAYS * 24;
    if (data.PAYPAL_KEY_RETENTION_HOURS >= validityHours) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PAYPAL_KEY_RETENTION_HOURS"],
        message: `Key retention window (${data.PAYPAL_KEY_RETENTION_HOURS}h) must be strictly shorter than authorization validity (${data.AUTHORIZATION_VALIDITY_DAYS}d = ${validityHours}h).`,
      });
    }

    const urlLower = data.PAYPAL_BASE_URL.toLowerCase();
    const isSandboxUrl = urlLower.includes("sandbox");

    if (data.PAYPAL_MODE === "sandbox" && !isSandboxUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PAYPAL_BASE_URL"],
        message: `PAYPAL_MODE is 'sandbox' but PAYPAL_BASE_URL ('${data.PAYPAL_BASE_URL}') does not target the sandbox environment.`,
      });
    }

    if (data.PAYPAL_MODE === "live" && isSandboxUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PAYPAL_BASE_URL"],
        message: `PAYPAL_MODE is 'live' but PAYPAL_BASE_URL ('${data.PAYPAL_BASE_URL}') targets the sandbox environment.`,
      });
    }
  });

export type RawGatewayConfig = z.infer<typeof GatewayConfigSchema>;

export interface GatewayConfig extends RawGatewayConfig {
  mode: "sandbox" | "live";
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webhookId: string | null;
  port: number;
  keyRetentionHours: number;
  maxPendingRecheckCount: number;
  authorizationValidityDays: number;
  reconciliationPollIntervalSeconds: number;
  inspectionWindowHours: number;
}

export class GatewayConfigValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Gateway configuration validation failed:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "GatewayConfigValidationError";
    this.issues = issues;
  }
}

export function validateGatewayConfig(sourceEnv: Record<string, string | undefined> = process.env): GatewayConfig {
  const result = GatewayConfigSchema.safeParse(sourceEnv);

  if (!result.success) {
    const sanitizedIssues = result.error.issues.map((issue) => {
      const fieldPath = issue.path.join(".");
      let issueMessage = issue.message;

      const clientId = sourceEnv.PAYPAL_CLIENT_ID;
      const clientSecret = sourceEnv.PAYPAL_CLIENT_SECRET;

      if (clientId && issueMessage.includes(clientId)) {
        issueMessage = issueMessage.replaceAll(clientId, maskSecret(clientId));
      }
      if (clientSecret && issueMessage.includes(clientSecret)) {
        issueMessage = issueMessage.replaceAll(clientSecret, maskSecret(clientSecret));
      }

      return `[${fieldPath || "CONFIG"}]: ${issueMessage}`;
    });

    throw new GatewayConfigValidationError(sanitizedIssues);
  }

  const raw = result.data;
  return {
    ...raw,
    mode: raw.PAYPAL_MODE,
    clientId: raw.PAYPAL_CLIENT_ID,
    clientSecret: raw.PAYPAL_CLIENT_SECRET,
    baseUrl: raw.PAYPAL_BASE_URL.replace(/\/$/, ""),
    webhookId: raw.PAYPAL_WEBHOOK_ID ?? null,
    port: raw.PORT,
    keyRetentionHours: raw.PAYPAL_KEY_RETENTION_HOURS,
    maxPendingRecheckCount: raw.MAX_PENDING_RECHECK_COUNT,
    authorizationValidityDays: raw.AUTHORIZATION_VALIDITY_DAYS,
    reconciliationPollIntervalSeconds: raw.RECONCILIATION_POLL_INTERVAL_SECONDS,
    inspectionWindowHours: raw.INSPECTION_WINDOW_HOURS,
  };
}

let cachedGatewayConfig: GatewayConfig | null = null;

export function getGatewayConfig(): GatewayConfig {
  if (!cachedGatewayConfig) {
    cachedGatewayConfig = validateGatewayConfig(process.env);
  }
  return cachedGatewayConfig;
}

export function resetGatewayConfig(): void {
  cachedGatewayConfig = null;
}
