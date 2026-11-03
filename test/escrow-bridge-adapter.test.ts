import { describe, it } from "node:test";
import assert from "node:assert";
import {
  EscrowBridgeAdapter,
  EscrowBridgeError,
  type BridgeCoalition,
} from "../src/adapter/escrow-bridge.adapter.ts";
import {
  PayPalMoneyGateway,
  type AuthorizeHoldResult,
  type FinalBatchCaptureResult,
  type VoidAuthorizationResult,
} from "../src/gateway/PayPalMoneyGateway.ts";
import { getGatewayConfig } from "../src/config/gateway.config.ts";
import { IdempotencyStorage } from "../src/storage/idempotency.storage.ts";

describe("EscrowBridgeAdapter Seam Invariant Tests", () => {
  const config = getGatewayConfig();
  const dummyStorage = new IdempotencyStorage();

  it("fails fast with INVALID_COALITION on missing coalition object", async () => {
    const adapter = new EscrowBridgeAdapter(new PayPalMoneyGateway(config, dummyStorage));
    await assert.rejects(
      async () => {
        // @ts-expect-error test invalid param
        await adapter.authorizeCoalitionEscrow(null);
      },
      (err: unknown) => {
        assert(err instanceof EscrowBridgeError);
        assert.strictEqual(err.code, "INVALID_COALITION");
        return true;
      }
    );
  });

  it("fails fast with EMPTY_MEMBERS when coalition contains no members", async () => {
    const adapter = new EscrowBridgeAdapter(new PayPalMoneyGateway(config, dummyStorage));
    const emptyCoalition: BridgeCoalition = {
      id: "coalition_empty",
      sku: "flour-50lb",
      targetUnits: 100,
      currentUnits: 0,
      unitPriceCents: 580,
      status: "FORMING",
      members: [],
    };

    await assert.rejects(
      async () => {
        await adapter.authorizeCoalitionEscrow(emptyCoalition);
      },
      (err: unknown) => {
        assert(err instanceof EscrowBridgeError);
        assert.strictEqual(err.code, "EMPTY_MEMBERS");
        return true;
      }
    );
  });

  it("flags stepUpRequired for members with orders exceeding $1,000 threshold", async () => {
    const adapter = new EscrowBridgeAdapter(new PayPalMoneyGateway(config, dummyStorage));
    const coalition: BridgeCoalition = {
      id: "coalition_flour_test",
      sku: "organic-flour-50lb",
      skuName: "Organic Bread Flour 50lb",
      targetUnits: 500,
      currentUnits: 300,
      unitPriceCents: 580, // $5.80
      status: "FORMING",
      members: [
        {
          smeId: "sme_maria_artisan",
          name: "Maria's Artisan Bakery",
          pledgedUnits: 100,
          authorizedCents: 58000, // $580.00 <= $1,000 threshold
          status: "PLEDGED",
          stepUpRequired: false,
        },
        {
          smeId: "sme_golden_crust",
          name: "Golden Crust Wholesale",
          pledgedUnits: 200,
          authorizedCents: 116000, // $1,160.00 > $1,000 threshold
          status: "PLEDGED",
          stepUpRequired: false,
        },
      ],
    };

    const origAuthorizeHold = adapter.getGateway().authorizeHold;
    const origGenerateQr = adapter.getGateway().generateInvoiceQrCode;

    let qrCalled = false;
    adapter.getGateway().generateInvoiceQrCode = async (params) => {
      qrCalled = true;
      return {
        invoiceId: `INV-${params.memberId}`,
        qrCodeBase64: "data:image/png;base64,mockqr",
        paymentUrl: `https://sandbox.paypal.com/invoice/p/#INV-${params.memberId}`,
      };
    };

    adapter.getGateway().authorizeHold = async (params): Promise<AuthorizeHoldResult> => {
      const clanId = params.clanId || params.coalitionId || "test_clan";
      const memberId = params.memberId || params.smeId || "test_member";
      const unitPrice = params.unitPrice ?? (params.unitPriceCents ? params.unitPriceCents / 100 : 0);
      return {
        orderId: `ORD-${memberId}`,
        status: "CREATED",
        approvalUrl: `https://sandbox.paypal.com/checkout?token=EC-${memberId}`,
        idempotencyKey: `key_${memberId}`,
        clanId,
        memberId,
        quantity: params.quantity,
        unitPrice,
        orderAmount: params.quantity * unitPrice,
        currency: "USD",
        rawResponse: {},
      };
    };

    try {
      const result = await adapter.authorizeCoalitionEscrow(coalition);

      assert.strictEqual(result.coalitionId, "coalition_flour_test");
      assert.strictEqual(result.membersCount, 2);
      assert.strictEqual(result.totalEscrowAmountUsd, 1740.0);
      assert.strictEqual(result.coalition.status, "LOCKED");

      const m1 = result.holds.find((h) => h.smeId === "sme_maria_artisan");
      const m2 = result.holds.find((h) => h.smeId === "sme_golden_crust");

      assert.ok(m1);
      assert.strictEqual(m1.stepUpRequired, false);
      assert.strictEqual(m1.holdAmountUsd, 580.0);

      assert.ok(m2);
      assert.strictEqual(m2.stepUpRequired, true);
      assert.strictEqual(m2.holdAmountUsd, 1160.0);
      assert.ok(m2.invoiceQrUrl?.includes("INV-sme_golden_crust"));
      assert.strictEqual(qrCalled, true);
    } finally {
      adapter.getGateway().authorizeHold = origAuthorizeHold;
      adapter.getGateway().generateInvoiceQrCode = origGenerateQr;
    }
  });

  it("captureCoalitionEscrow fails if any member lacks authorization", async () => {
    const adapter = new EscrowBridgeAdapter(new PayPalMoneyGateway(config, dummyStorage));
    const coalition: BridgeCoalition = {
      id: "coalition_unauth",
      sku: "flour-50lb",
      targetUnits: 100,
      currentUnits: 100,
      unitPriceCents: 580,
      status: "LOCKED",
      members: [
        {
          smeId: "sme_unauthorized",
          pledgedUnits: 50,
          authorizedCents: 29000,
          status: "PLEDGED", // Not AUTHORIZED or CAPTURED
        },
      ],
    };

    await assert.rejects(
      async () => {
        await adapter.captureCoalitionEscrow(coalition);
      },
      (err: unknown) => {
        assert(err instanceof EscrowBridgeError);
        assert.strictEqual(err.code, "UNAUTHORIZED_MEMBERS_EXIST");
        return true;
      }
    );
  });

  it("captureCoalitionEscrow maps tiers, invokes batch capture, and transitions to FULFILLING", async () => {
    const adapter = new EscrowBridgeAdapter(new PayPalMoneyGateway(config, dummyStorage));
    const coalition: BridgeCoalition = {
      id: "coalition_batch_capture",
      sku: "organic-flour-50lb",
      skuName: "Organic Bread Flour 50lb",
      targetUnits: 500,
      currentUnits: 500,
      unitPriceCents: 720, // Initial tier $7.20
      status: "LOCKED",
      members: [
        {
          smeId: "sme_maria_artisan",
          pledgedUnits: 250,
          authorizedCents: 180000, // Authorized at $7.20 = $1,800
          authorizationId: "AUTH-MARIA-001",
          status: "AUTHORIZED",
        },
        {
          smeId: "sme_golden_crust",
          pledgedUnits: 250,
          authorizedCents: 180000,
          authorizationId: "AUTH-GOLDEN-002",
          status: "AUTHORIZED",
        },
      ],
    };

    const origFinalBatchCapture = adapter.getGateway().finalBatchCapture;
    adapter.getGateway().finalBatchCapture = async (clanId, options): Promise<FinalBatchCaptureResult> => {
      // 500 units unlocks Tier 2 at $5.80
      return {
        clanId,
        clanState: "LOCKED",
        totalQuantity: 500,
        effectiveTier: { minQuantity: 500, unitPrice: 5.80 },
        totalCapturedAmount: 2900.0, // 500 * $5.80
        totalReleasedHoldAmount: 700.0, // 500 * ($7.20 - $5.80)
        captures: [
          {
            memberId: "sme_maria_artisan",
            authorizationId: "AUTH-MARIA-001",
            captureId: "CAP-MARIA-01",
            quantity: 250,
            unitPrice: 5.80,
            initialHoldAmount: 1800.0,
            finalCapturedAmount: 1450.0,
            releasedHoldAmount: 350.0,
            finalCapture: true,
            status: "COMPLETED",
            readBackVerified: true,
          },
          {
            memberId: "sme_golden_crust",
            authorizationId: "AUTH-GOLDEN-002",
            captureId: "CAP-GOLDEN-02",
            quantity: 250,
            unitPrice: 5.80,
            initialHoldAmount: 1800.0,
            finalCapturedAmount: 1450.0,
            releasedHoldAmount: 350.0,
            finalCapture: true,
            status: "COMPLETED",
            readBackVerified: true,
          },
        ],
      };
    };

    try {
      const result = await adapter.captureCoalitionEscrow(coalition, {
        tiers: [
          { minUnits: 200, unitPriceUsd: 7.20 },
          { minUnits: 500, unitPriceUsd: 5.80 },
        ],
      });

      assert.strictEqual(result.coalitionId, "coalition_batch_capture");
      assert.strictEqual(result.totalCapturedAmountUsd, 2900.0);
      assert.strictEqual(result.totalReleasedHoldAmountUsd, 700.0);
      assert.strictEqual(result.effectiveUnitPriceUsd, 5.80);
      assert.strictEqual(result.coalition.status, "FULFILLING");
      assert.strictEqual(result.coalition.unitPriceCents, 580);

      const m1 = result.coalition.members.find((m) => m.smeId === "sme_maria_artisan");
      assert.ok(m1);
      assert.strictEqual(m1.status, "CAPTURED");
      assert.strictEqual(m1.captureId, "CAP-MARIA-01");
    } finally {
      adapter.getGateway().finalBatchCapture = origFinalBatchCapture;
    }
  });

  it("voidCoalitionEscrow voids active member holds and transitions to CANCELLED", async () => {
    const adapter = new EscrowBridgeAdapter(new PayPalMoneyGateway(config, dummyStorage));
    const coalition: BridgeCoalition = {
      id: "coalition_void_test",
      sku: "flour-50lb",
      targetUnits: 100,
      currentUnits: 50,
      unitPriceCents: 580,
      status: "FORMING",
      members: [
        {
          smeId: "sme_maria",
          pledgedUnits: 50,
          authorizedCents: 29000,
          authorizationId: "AUTH-MARIA-VOID",
          status: "AUTHORIZED",
        },
      ],
    };

    const origVoid = adapter.getGateway().voidAuthorization;
    adapter.getGateway().voidAuthorization = async (
      authorizationId: string,
      clanId: string,
      memberId?: string
    ): Promise<VoidAuthorizationResult> => {
      return {
        authorizationId,
        status: "VOIDED",
        rawResponse: {},
      };
    };

    try {
      const result = await adapter.voidCoalitionEscrow(coalition, "Threshold not reached.");
      assert.strictEqual(result.voidedMembersCount, 1);
      assert.strictEqual(result.coalition.status, "CANCELLED");
      assert.strictEqual(result.coalition.members[0].status, "VOIDED");
    } finally {
      adapter.getGateway().voidAuthorization = origVoid;
    }
  });
});
