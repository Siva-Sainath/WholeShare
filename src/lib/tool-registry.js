import { actionDispatcher } from "./web-actions.js";
import {
  createOrderAuthorization,
  authorizeOrderHold,
  captureOrderHold,
  generateInvoiceWithQr,
  registerShipmentTracking,
  getOrder,
  getInvoice,
  getShipmentTracking,
  createSubscriptionPlan,
  createSubscription
} from "./paypal-bridge.js";
import { interceptToolExecution } from "./interceptor.js";
import { instinctFs } from "./instinct-fs.js";
import {
  ingestDocument,
  queryProcurementBaseline,
  importGoogleDriveFile
} from "./ingestion-pipeline.js";
import { existsSync, readFileSync } from "node:fs";
import { supplierScraper } from "../kernel/supplier-scraper.js";



export const WHOLESHARE_TOOL_DECLARATIONS = [
  {
    type: "function",
    function: {
      name: "discover_wholesale_catalog",
      description: "Retrieve available wholesale catalog products, base prices, and volume discount tiers.",
      parameters: {
        type: "object",
        properties: {
          sku: {
            type: "string",
            description: "Product SKU to query, such as organic-flour-50lb"
          }
        },
        required: ["sku"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "spawn_sme_mandate",
      description: "Onboard a verified SME buyer with an ACP mandate, spend cap, and step-up threshold.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Unique SME identifier"
          },
          name: {
            type: "string",
            description: "Legal business name of the buyer"
          },
          sku: {
            type: "string",
            description: "Target wholesale SKU"
          },
          pledgedUnits: {
            type: "integer",
            description: "Initial volume demand in units"
          },
          maxAutoAuthorizeUsd: {
            type: "number",
            description: "Autonomous spend ceiling in USD"
          },
          stepUpThresholdUsd: {
            type: "number",
            description: "Step-up authentication threshold in USD"
          }
        },
        required: ["id", "name", "sku", "pledgedUnits", "maxAutoAuthorizeUsd"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "join_syndicate",
      description: "Pledge buyer volume to an active group purchasing coalition.",
      parameters: {
        type: "object",
        properties: {
          smeId: {
            type: "string",
            description: "SME buyer identifier"
          },
          sku: {
            type: "string",
            description: "Wholesale SKU"
          },
          units: {
            type: "integer",
            description: "Number of units to pledge"
          }
        },
        required: ["smeId", "sku", "units"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_coalition_negotiation",
      description: "Execute volume discount discovery and price optimization for a coalition.",
      parameters: {
        type: "object",
        properties: {
          coalitionId: {
            type: "string",
            description: "Target coalition identifier"
          }
        },
        required: ["coalitionId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_step_up_invoice",
      description: "Generate a PayPal Invoicing QR code when buyer allocation exceeds threshold.",
      parameters: {
        type: "object",
        properties: {
          buyerId: {
            type: "string",
            description: "SME buyer identifier"
          },
          amountCents: {
            type: "integer",
            description: "Invoice amount in integer cents"
          },
          memo: {
            type: "string",
            description: "Invoice memo or line item description"
          }
        },
        required: ["buyerId", "amountCents"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "authorize_paypal_escrow",
      description: "Lock member funds into PayPal Orders v2 soft authorization holds.",
      parameters: {
        type: "object",
        properties: {
          coalitionId: {
            type: "string",
            description: "Coalition identifier to lock"
          }
        },
        required: ["coalitionId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "register_shipment_tracking",
      description: "Register carrier shipment tracking number to advance fulfillment toward settlement.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "PayPal order identifier"
          },
          trackingNumber: {
            type: "string",
            description: "Carrier shipment tracking number"
          },
          carrier: {
            type: "string",
            description: "Shipping carrier name"
          }
        },
        required: ["orderId", "trackingNumber"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_escrow_ledger",
      description: "Query current state of all coalitions, member allocations, and escrow status.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description: "PayPal Agent Toolkit Orders v2 action. Soft-authorizes buyer payment hold with intent AUTHORIZE.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            description: "Must be AUTHORIZE"
          },
          amountCents: {
            type: "integer",
            description: "Total amount in integer cents"
          },
          referenceId: {
            type: "string",
            description: "Reference identifier for the order"
          }
        },
        required: ["intent", "amountCents"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_invoice_qr_code",
      description: "PayPal Agent Toolkit Invoicing action. Generates an interactive payment QR code for step-up verification.",
      parameters: {
        type: "object",
        properties: {
          totalCents: {
            type: "integer",
            description: "Total invoice amount in integer cents"
          },
          recipientEmail: {
            type: "string",
            description: "Recipient email address"
          },
          memo: {
            type: "string",
            description: "Invoice memo or line item details"
          }
        },
        required: ["totalCents", "recipientEmail"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_shipment_tracking",
      description: "PayPal Agent Toolkit Shipment Tracking action. Registers carrier tracking information for escrow settlement.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "Associated PayPal order identifier"
          },
          trackingNumber: {
            type: "string",
            description: "Carrier tracking number"
          },
          carrier: {
            type: "string",
            description: "Shipping carrier name"
          }
        },
        required: ["orderId", "trackingNumber"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_order",
      description: "PayPal Agent Toolkit read action. Fetches current status and authorization details of a PayPal order.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "PayPal order identifier"
          }
        },
        required: ["orderId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_invoice",
      description: "PayPal Agent Toolkit read action. Fetches details and status of an issued PayPal invoice.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: {
            type: "string",
            description: "PayPal invoice identifier"
          }
        },
        required: ["invoiceId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_shipment_tracking",
      description: "PayPal Agent Toolkit read action. Fetches tracking milestones and transit status for a package.",
      parameters: {
        type: "object",
        properties: {
          trackingNumber: {
            type: "string",
            description: "Carrier shipment tracking number"
          }
        },
        required: ["trackingNumber"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep_memory",
      description: "Instinct Memory tool. Greps Git-tracked markdown entities using keyword and alias matching.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keyword or alias to search in memory files"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_memory_entity",
      description: "Instinct Memory tool. Reads full markdown entity file with YAML frontmatter, facts, and [[links]].",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Entity or knowledge identifier, such as sme_austin_01"
          }
        },
        required: ["id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ingest_business_document",
      description: "Business Data Pipeline tool. Parses and ingests vendor invoices, price sheets, and POs into structured procurement entities and Instinct Memory.",
      parameters: {
        type: "object",
        properties: {
          buyerId: {
            type: "string",
            description: "Unique identifier of the buyer business"
          },
          documentJson: {
            type: "string",
            description: "JSON string containing raw invoice or document fields"
          },
          fileName: {
            type: "string",
            description: "Original document file name"
          }
        },
        required: ["buyerId", "documentJson"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_procurement_baseline",
      description: "Business Data Pipeline tool. Retrieves the historical unit price, consumption rate, and specifications for a buyer and SKU from Instinct Memory.",
      parameters: {
        type: "object",
        properties: {
          buyerId: {
            type: "string",
            description: "Buyer business identifier"
          },
          sku: {
            type: "string",
            description: "Target commodity SKU, such as organic-flour-50lb"
          }
        },
        required: ["buyerId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "import_google_drive_document",
      description: "Business Data Pipeline tool. Imports a procurement document or invoice from Google Drive using its file ID.",
      parameters: {
        type: "object",
        properties: {
          buyerId: {
            type: "string",
            description: "Buyer business identifier"
          },
          fileId: {
            type: "string",
            description: "Google Drive unique file ID"
          },
          fileName: {
            type: "string",
            description: "Google Drive file name"
          }
        },
        required: ["buyerId", "fileId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "capture_order_hold",
      description: "PayPal Orders v2 settlement action. Captures previously authorized escrow funds once delivery is verified.",
      parameters: {
        type: "object",
        properties: {
          authorizationId: {
            type: "string",
            description: "PayPal authorization identifier to capture"
          },
          amountCents: {
            type: "integer",
            description: "Amount to capture in integer cents"
          },
          isFinalCapture: {
            type: "boolean",
            description: "Whether this is the final capture"
          }
        },
        required: ["authorizationId", "amountCents"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_subscription_plan",
      description: "PayPal Subscriptions action. Creates recurring group billing plan for wholesale buyer clans.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Plan name"
          },
          description: {
            type: "string",
            description: "Plan description"
          },
          amountCents: {
            type: "integer",
            description: "Recurring billing amount in integer cents"
          },
          intervalUnit: {
            type: "string",
            description: "MONTH or WEEK billing frequency"
          }
        },
        required: ["name", "amountCents"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_subscription",
      description: "PayPal Subscriptions action. Subscribes a buyer clan member to a wholesale recurring billing plan.",
      parameters: {
        type: "object",
        properties: {
          planId: {
            type: "string",
            description: "Target PayPal subscription plan identifier"
          },
          subscriberEmail: {
            type: "string",
            description: "Buyer subscriber email address"
          },
          customId: {
            type: "string",
            description: "Buyer member identifier"
          }
        },
        required: ["planId", "subscriberEmail"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "scrape_supplier_catalog",
      description: "Extract structured wholesale commodity catalog pricing from an approved supplier URL or HTML table.",
      parameters: {
        type: "object",
        properties: {
          supplierUrl: {
            type: "string",
            description: "Target supplier URL within approved domains (such as sysco.com, wholeshare.local)"
          },
          htmlContent: {
            type: "string",
            description: "Optional raw HTML table string to parse"
          },
          vendorName: {
            type: "string",
            description: "Supplier legal business name"
          }
        },
        required: ["supplierUrl"]
      }
    }
  }
];



export async function executeTool(toolName, args = {}) {
  const interception = interceptToolExecution(toolName, args);
  if (!interception.valid) {
    return {
      status: "REJECTED_BY_INTERCEPTOR",
      error: "INTERCEPTOR_VIOLATION",
      violations: interception.violations
    };
  }

  try {
    switch (toolName) {
    case "discover_wholesale_catalog": {
      const sku = args.sku || "organic-flour-50lb";
      const item = actionDispatcher.catalog.get(sku);
      if (!item) {
        return { error: `SKU ${sku} not found in catalog.` };
      }
      return {
        sku: item.sku,
        name: item.name,
        basePriceUsd: item.basePriceUsd,
        tiers: item.tiers
      };
    }

    case "spawn_sme_mandate": {
      const result = actionDispatcher.spawnSme({
        id: args.id,
        name: args.name,
        sku: args.sku,
        pledgedUnits: args.pledgedUnits,
        maxAutoAuthorizeUsd: args.maxAutoAuthorizeUsd,
        stepUpThresholdUsd: args.stepUpThresholdUsd || 1000
      });
      return {
        status: "SPAWNED",
        smeId: result.sme.id,
        name: result.sme.name,
        tokenId: result.token.tokenId,
        maxAuthorizedCents: result.token.maxAuthorizedCents
      };
    }

    case "join_syndicate": {
      const coalition = actionDispatcher.joinCoalition({
        smeId: args.smeId,
        sku: args.sku,
        units: args.units
      });
      return {
        status: "JOINED",
        coalitionId: coalition.id,
        currentUnits: coalition.currentUnits,
        targetUnits: coalition.targetUnits,
        coalitionStatus: coalition.status
      };
    }

    case "run_coalition_negotiation": {
      const coalitionId = args.coalitionId || "coalition_flour_01";
      const result = await actionDispatcher.runNegotiation(coalitionId);
      return {
        status: "NEGOTIATED",
        coalitionId,
        unitPriceCents: result.proposal.unitPriceCents,
        discountPct: result.proposal.discountPct,
        allocationsCount: result.proposal.allocations.length,
        executionSource: result.executionSource
      };
    }

    case "generate_step_up_invoice": {
      const invoice = await generateInvoiceWithQr({
        totalCents: args.amountCents,
        recipientEmail: `${args.buyerId}@wholeshare.local`,
        memo: args.memo || "Wholeshare Group Escrow Step-Up Invoice"
      });
      return {
        status: "INVOICE_GENERATED",
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        qrCodeUrl: invoice.qrCodeUrl,
        totalCents: invoice.totalCents
      };
    }

    case "authorize_paypal_escrow": {
      const coalitionId = args.coalitionId || "coalition_flour_01";
      const coalition = actionDispatcher.authorizeEscrow(coalitionId);

      for (const m of coalition.members) {
        const auth = await createOrderAuthorization({
          amountCents: m.authorizedCents,
          referenceId: m.smeId
        });
        m.paypalOrderId = auth.orderId;
      }

      const totalEscrowCents = coalition.members.reduce((sum, m) => sum + m.authorizedCents, 0);
      return {
        status: "ESCROW_LOCKED",
        coalitionId,
        totalEscrowCents,
        membersCount: coalition.members.length,
        coalitionStatus: coalition.status
      };
    }

    case "register_shipment_tracking": {
      const tracking = await registerShipmentTracking({
        orderId: args.orderId,
        trackingNumber: args.trackingNumber,
        carrier: args.carrier || "UPS"
      });
      return {
        status: "TRACKING_REGISTERED",
        trackingId: tracking.trackingId,
        orderId: tracking.orderId,
        carrier: tracking.carrier,
        statusLabel: tracking.status
      };
    }

    case "create_order": {
      const auth = await createOrderAuthorization({
        amountCents: args.amountCents,
        referenceId: args.referenceId,
        currency: args.currency || "USD"
      });
      return {
        status: "CREATED",
        orderId: auth.orderId,
        intent: "AUTHORIZE",
        amountCents: auth.amountCents,
        currency: auth.currency,
        referenceId: auth.referenceId
      };
    }

    case "generate_invoice_qr_code": {
      const invoice = await generateInvoiceWithQr({
        totalCents: args.totalCents,
        recipientEmail: args.recipientEmail,
        memo: args.memo
      });
      return {
        status: "INVOICE_GENERATED",
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        qrCodeUrl: invoice.qrCodeUrl,
        totalCents: invoice.totalCents
      };
    }

    case "create_shipment_tracking": {
      const tracking = await registerShipmentTracking({
        orderId: args.orderId,
        trackingNumber: args.trackingNumber,
        carrier: args.carrier
      });
      return {
        status: "TRACKING_REGISTERED",
        trackingId: tracking.trackingId,
        orderId: tracking.orderId,
        carrier: tracking.carrier,
        statusLabel: tracking.status
      };
    }

    case "get_order": {
      return await getOrder(args.orderId);
    }

    case "get_invoice": {
      return await getInvoice(args.invoiceId);
    }

    case "get_shipment_tracking": {
      return await getShipmentTracking(args.trackingNumber);
    }

    case "grep_memory": {
      const results = instinctFs.grepMemory(args.query);
      return {
        query: args.query,
        matchesCount: results.length,
        results
      };
    }

    case "read_memory_entity": {
      const entity = instinctFs.readEntity(args.id);
      if (!entity) {
        return { error: `Memory entity ${args.id} not found.` };
      }
      return {
        id: entity.id,
        frontmatter: entity.frontmatter,
        facts: entity.body,
        links: entity.links
      };
    }

    case "query_escrow_ledger": {
      const ledger = actionDispatcher.getLedgerState();
      return {
        coalitionsCount: ledger.length,
        coalitions: ledger
      };
    }

    case "ingest_business_document": {
      let fileBuffer;
      let mimeType = args.mimeType || "application/json";
      let fileName = args.fileName || "agent_upload.json";

      if (args.base64Content) {
        fileBuffer = Buffer.from(args.base64Content, "base64");
      } else if (args.filePath && existsSync(args.filePath)) {
        fileBuffer = readFileSync(args.filePath);
        fileName = args.filePath.split("/").pop();
        if (args.filePath.endsWith(".pdf")) mimeType = "application/pdf";
        else if (args.filePath.endsWith(".xlsx")) mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        else if (args.filePath.endsWith(".csv")) mimeType = "text/csv";
        else if (args.filePath.endsWith(".png")) mimeType = "image/png";
      } else if (args.documentJson) {
        fileBuffer = Buffer.from(args.documentJson, "utf-8");
      } else {
        throw new Error("Missing document content (base64Content, filePath, or documentJson required).");
      }

      return ingestDocument({
        fileBuffer,
        fileName,
        mimeType,
        buyerId: args.buyerId
      });
    }

    case "capture_order_hold": {
      return await captureOrderHold({
        authorizationId: args.authorizationId,
        amountCents: args.amountCents,
        currency: args.currency || "USD",
        isFinalCapture: args.isFinalCapture !== false
      });
    }

    case "create_subscription_plan": {
      return await createSubscriptionPlan({
        name: args.name,
        description: args.description || "Wholeshare Clan Subscription",
        amountCents: args.amountCents,
        intervalUnit: args.intervalUnit || "MONTH"
      });
    }

    case "create_subscription": {
      return await createSubscription({
        planId: args.planId,
        subscriberEmail: args.subscriberEmail,
        customId: args.customId
      });
    }

    case "query_procurement_baseline": {
      return queryProcurementBaseline(args.buyerId, args.sku);
    }

    case "import_google_drive_document": {
      return importGoogleDriveFile({
        fileId: args.fileId,
        fileName: args.fileName,
        buyerId: args.buyerId
      });
    }

    case "scrape_supplier_catalog": {
      supplierScraper.assertDomainAllowed(args.supplierUrl);
      if (args.htmlContent) {
        return supplierScraper.parseHtmlCatalogTable(args.htmlContent, args.vendorName || "Wholesale Supplier");
      }
      return {
        supplierUrl: args.supplierUrl,
        vendorName: args.vendorName || "Wholesale Supplier",
        status: "DOMAIN_VERIFIED",
        message: "Domain verified in kernel allowlist. Tabular extraction ready."
      };
    }


    default:
      return { error: `Unknown tool name: ${toolName}` };
    }
  } catch (err) {
    return {
      status: "ERROR",
      tool: toolName,
      error: err.message
    };
  }
}

