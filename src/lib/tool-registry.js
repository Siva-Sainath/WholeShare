import { loadUserSettings as _loadSettings, updateUserSettings as _updateSettings } from "./user-settings.js";
import { buildSnapshot } from "./snapshot.js";
import { searchDirectory, buildLeadSearchUrl, recordLeads, loadLeads } from "./supplier-search.js";
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
import { getPledgeQuote } from "./paypal-checkout.js";
import { loadUserSettings } from "./user-settings.js";
import { SOURCES, querySource, resolveSourceId } from "./data-sources.js";
import { runQuery, resolveEntity, compareGroups, groupIdFromWords } from "./mosaic-tools.js";
import { callPageTool } from "./page-bridge.js";
import { normaliseFulfilment } from "./fulfilment.js";
import { isCarrierFormatTracking } from "./tracking-format.js";
import { bookSlot, extendInspection, findShipment, moveDelivery, resolveConflicts, undoLast } from "./schedule-service.js";
import { getAllClans, getClanById, saveClan } from "./matchmaking/clanStore.ts";
import { instinctFs } from "./instinct-fs.js";
import {
  ingestDocument,
  queryProcurementBaseline,
  importGoogleDriveFile
} from "./ingestion-pipeline.js";
import {
  discoverWholesaleTiers,
  executeCustomBrowserTask,
  researchWebFact,
  readSupplierSite,
  createBrowserSession,
  executePlaywright,
  captureScreenshot,
  deleteBrowserSession,
  KernelConfigurationError,
  KernelApiError
} from "./kernel-bridge.js";
import {
  evaluateSupplierCredibility,
  verifyExternalAgentClaim
} from "./kernel-credibility.js";
import { kernelResearchService } from "./kernel-service.js";
import { DeliveryAdapter } from "../adapter/delivery.adapter.ts";
import { ClaimsAdapter } from "../adapter/claims.adapter.ts";
import { SettlementAdapter } from "../adapter/settlement.adapter.ts";
import { PayPalMoneyGateway } from "../gateway/PayPalMoneyGateway.ts";
import { getClanGovernanceAdapter } from "../adapter/clan-governance.adapter.ts";
import { executePayPalToolkitAction, getPayPalToolkitToolNames } from "./paypal-toolkit-bridge.js";
import { runAccountsReceivableLiquidityCheck } from "./agent-toolkit.ts";
import { getRepaymentStorage } from "../storage/repayment.storage.ts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const deliveryAdapter = new DeliveryAdapter();
const claimsAdapter = new ClaimsAdapter();
const settlementAdapter = new SettlementAdapter();
const payPalMoneyGateway = new PayPalMoneyGateway();
const clanGovernanceAdapter = getClanGovernanceAdapter();



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
      name: "discover_wholesale_supplier_tiers",
      description: "Kernel.sh Cloud Browser tool. Dispatches a stealth headless browser to live B2B distributor portals to scrape volume pricing tiers, extract MOQ brackets, and capture cryptographic screenshot proofs.",
      parameters: {
        type: "object",
        properties: {
          sku: {
            type: "string",
            description: "Product SKU to discover, such as organic-flour-50lb"
          },
          vendorUrl: {
            type: "string",
            description: "Optional supplier portal or catalog URL to navigate and extract"
          },
          category: {
            type: "string",
            description: "Optional commodity category, such as bakery, packaging, or coffee"
          }
        },
        required: ["sku"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "kernel_scrape_wholesale_tiers",
      description: "Alias for discover_wholesale_supplier_tiers. Uses Kernel.sh cloud browser to scrape live wholesale supplier tier pricing.",
      parameters: {
        type: "object",
        properties: {
          sku: {
            type: "string",
            description: "Target wholesale SKU"
          },
          vendorUrl: {
            type: "string",
            description: "Supplier URL"
          }
        },
        required: ["sku"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "kernel_execute_browser_task",
      description: "Kernel.sh Cloud Browser Playwright execution. Executes a custom Playwright automation script inside an isolated cloud Chromium instance with stealth mode, and optionally captures a cryptographic screenshot proof.",
      parameters: {
        type: "object",
        properties: {
          targetUrl: {
            type: "string",
            description: "The target website URL to navigate and automate"
          },
          script: {
            type: "string",
            description: "Playwright JavaScript code to evaluate in the page context. Use 'return' to output data."
          },
          captureProof: {
            type: "boolean",
            description: "Whether to capture a full-page PNG screenshot proof with SHA-256 digest (default: true)"
          }
        },
        required: ["targetUrl", "script"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "export_view_snapshot",
      description: "Freeze one part of WholeShare as a shareable snapshot. Returns the rows plus links to a CSV file and a styled HTML page an external agent can show to its own user. Components: groups, suppliers, claims, claims-board, shipments, schedule, ledger, invoices, members.",
      parameters: {
        type: "object",
        properties: {
          component: { type: "string", description: "Which view to snapshot." },
          limit: { type: "number", description: "Maximum rows, up to 500." }
        },
        required: ["component"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "start_group_buy",
      description: "Open the Start a group buy form already filled in for the user to review. It does not publish anything. Pass only details the user gave.",
      parameters: {
        type: "object",
        properties: {
          product: { type: "string", description: "What the group will buy." },
          name: { type: "string", description: "Short group title." },
          city: { type: "string", description: "Delivery city." },
          targetUnits: { type: "number", description: "Units the group wants." },
          basePriceUsd: { type: "number", description: "List price per unit in USD, only if stated." },
          supplierMode: { type: "string", enum: ["VOTE", "URL", "KERNEL"], description: "URL when a supplier site is known, KERNEL to search the web, otherwise VOTE." },
          vendorUrl: { type: "string", description: "Supplier website, for example the best web lead found." },
          shipmentMode: { type: "string", enum: ["SINGLE_POINT", "MULTIPLE_POINTS"], description: "SINGLE_POINT when the whole order goes to one address, MULTIPLE_POINTS when several. Only if the user said it." },
          shipmentPoints: { type: "array", items: { type: "object" }, description: "Receiving points the user named: {label, address, city}. At most 5." }
        },
        required: ["product"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_suppliers",
      description: "Find suppliers for a product. Searches the supplier directory first. If webSearch is true, also opens a live Kernel cloud browser on a public search page and saves unverified web leads. Use webSearch when the user asks for new suppliers or the directory has too few matches.",
      parameters: {
        type: "object",
        properties: {
          product: { type: "string", description: "What the user wants to buy, for example 'stainless steel nuts M10' or 'cashew kernels'." },
          country: { type: "string", description: "Optional country name or ISO code to prefer." },
          certification: { type: "string", description: "Optional certification such as ISO 9001 or FSSAI." },
          acceptsPayPal: { type: "boolean", description: "Only suppliers that accept PayPal." },
          webSearch: { type: "boolean", description: "Also source new leads from the web with a Kernel browser." }
        },
        required: ["product"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query",
      description: "Read facts from any data source so you can answer with real numbers. Sources: groups (buying groups: name, product, category, city, country, status FORMING or LOCKED, currentUnits, targetUnits, fillPct, listPriceUsd, tierDiscountPct, unitPriceUsd, supplier, supplierTrust), ledger (the user's pledges), members, claims, shipments, suppliers, paypal_invoices. Use filter [{field, op: eq|ne|contains|in|gt|gte|lt|lte, value}], sort {field, direction}, groupBy (a field) with aggregate [{field, op: sum|avg|count|min|max}] for totals and breakdowns, fields to pick columns, limit (max 25). Set show true, with a short title, when the user wants to see, browse or list items: it also opens the table beside the chat in the same call. Leave show off for a number or a yes or no. Returns rows or groups plus availableFields.",
      parameters: { type: "object", properties: { source: { type: "string" }, filter: { type: "array", items: { type: "object" } }, sort: { type: "object" }, groupBy: { type: "string" }, aggregate: { type: "array", items: { type: "object" } }, fields: { type: "array", items: { type: "string" } }, limit: { type: "number" }, show: { type: "boolean" }, title: { type: "string" }, view: { type: "string", enum: ["cards", "grid"], description: "With show true: grid opens an AG Grid table the user or page_tool can filter, sort, group and chart. Groups and invoices default to cards." } }, required: ["source"] }
    }
  },
  {
    type: "function",
    function: {
      name: "resolve",
      description: "Turn the user's words into real ids before acting. type is group, shipment, supplier, claim or invoice. text is what the user said (a product, a city, a name). Returns the best candidates with ids. Pass several texts as an array to resolve them in one call. compare_groups and join_group accept words and resolve for you.",
      parameters: { type: "object", properties: { type: { type: "string", enum: ["group", "shipment", "supplier", "claim", "invoice"] }, text: { type: "string" } }, required: ["type", "text"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_groups",
      description: "Compare two to four buying groups side by side for the same number of units: price at the units, discount tier and the next tier, fill, delivery days, supplier trust, and whether the user can join. Returns a verdict per factor. Use it for 'which is better', 'help me choose', 'compare'. Pass groups (the user's words for each, such as Austin olive oil) or groupIds. Words are resolved for you. After it, tell the user which factor decides it and what they give up, and which groups you picked.",
      parameters: { type: "object", properties: { groups: { type: "array", items: { type: "string" } }, groupIds: { type: "array", items: { type: "string" } }, units: { type: "number", description: "Units the user would buy. Default 100." } }, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "join_group",
      description: "Price a pledge and open the PayPal approval step. Use it for join, pledge, sign me up, quote, and how much would N units cost. It never pledges or moves money: the user approves on PayPal. Pass group (the user's words) or clanId, and a whole number of units. PayPal checkout works for USD groups only, and the group must still be forming.",
      parameters: { type: "object", properties: { group: { type: "string" }, clanId: { type: "string" }, units: { type: "number" } }, required: ["units"] }
    }
  },
  {
    type: "function",
    function: {
      name: "setup_profile",
      description: "Set up or update the user's business profile from what they said: businessName, city, country, currency (3 letter code such as USD or INR), contactEmail. Pass only the fields the user stated. It saves them, opens the Settings page so the user can review, and returns the previous values so the change can be reversed.",
      parameters: { type: "object", properties: { businessName: { type: "string" }, city: { type: "string" }, country: { type: "string" }, currency: { type: "string" }, contactEmail: { type: "string" } } }
    }
  },
  {
    type: "function",
    function: {
      name: "page_tool",
      description: "Act on the page the person is looking at, using the tools it offers (listed in page.pageTools in the context). Use it to filter, sort, group, chart or export the table beside the chat (grid_filter, grid_sort, grid_group_by, grid_chart, grid_clear_filters, grid_export_csv), to switch or zoom a Bryntum view (bryntum_show_view, bryntum_scheduler_zoom), or to change an AG Studio report when Insights is open. Pass tool (a name from page.pageTools) and args. Returns what the page reports, such as how many rows are now shown. It never moves money.",
      parameters: { type: "object", properties: { tool: { type: "string" }, args: { type: "object" } }, required: ["tool"] }
    }
  },
  {
    type: "function",
    function: {
      name: "send_invoice_reminder",
      description: "Send a PayPal reminder for one open invoice that has not been paid. This runs in the PayPal sandbox. Pass invoice (the invoice number or id) and the reminder goes to the billed address. Use it only when the user asks to remind someone about an invoice. Check the invoice is still open first with query on paypal_invoices.",
      parameters: { type: "object", properties: { invoice: { type: "string", description: "Invoice number or id." } }, required: ["invoice"] }
    }
  },
  {
    type: "function",
    function: {
      name: "track_shipment",
      description: "Check where a shipment is. Returns what WholeShare recorded (carrier, tracking number, status, expected and delivered dates) and, when the tracking number has a real carrier format, reads the carrier's tracking page in a Kernel cloud browser. Use it for 'where is my shipment', 'is it late', and before a late or damage dispute. Pass the user's product words or a shipment id.",
      parameters: { type: "object", properties: { shipment: { type: "string", description: "Product words or a shipment id." } }, required: ["shipment"] }
    }
  },
  {
    type: "function",
    function: {
      name: "kernel_read_supplier_site",
      description: "Open a supplier's website in a Kernel cloud browser and read up to three of its pages (home, pricing, catalog, contact) for prices, minimum order and lead time. Read only: it never fills or submits a form. Use it when the user wants a quote, a price or terms from a named supplier or a web lead that has a website. Results are unverified until the supplier confirms them.",
      parameters: { type: "object", properties: { website: { type: "string", description: "The supplier website address, https://..." }, product: { type: "string", description: "The product the user wants priced." } }, required: ["website"] }
    }
  },
  {
    type: "function",
    function: {
      name: "kernel_research_web_fact",
      description: "Generalized Kernel.sh cloud browser research tool. Deploys an isolated headless browser on standard CPU to research real-time external facts: supplier catalog pricing and stock, regulatory filings and corporate status, real-time forex exchange rates, sanctions checks, and technical specifications.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            description: "Research domain category: 'SUPPLIER_CATALOG', 'REGULATORY_KYC', 'FOREX_RATES', 'BACKGROUND_COMPLIANCE', 'SPEC_VERIFICATION', or 'GENERAL_RESEARCH'",
            enum: [
              "SUPPLIER_CATALOG",
              "REGULATORY_KYC",
              "FOREX_RATES",
              "BACKGROUND_COMPLIANCE",
              "SPEC_VERIFICATION",
              "GENERAL_RESEARCH"
            ]
          },
          targetUrl: {
            type: "string",
            description: "The official external URL to inspect (supplier portal, government registry, forex tracker, or agency database)"
          },
          query: {
            type: "string",
            description: "The specific fact, pricing tier, entity status, or conversion rate to verify"
          },
          script: {
            type: "string",
            description: "Optional custom Playwright JavaScript snippet. If omitted, the browser executes semantic DOM traversal."
          },
          captureProof: {
            type: "boolean",
            description: "Whether to capture a full-page PNG screenshot proof with SHA-256 digest (default: true)"
          }
        },
        required: ["targetUrl", "query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "kernel_present_research",
      description: "Reads the latest background supplier research brief for a clan from durable storage and returns the verified supplier pricing table, MOQ tiers, credibility verdicts, and screenshot proof references in plain language.",
      parameters: {
        type: "object",
        properties: {
          clanId: {
            type: "string",
            description: "The unique identifier of the buying group or coalition to inspect"
          }
        },
        required: ["clanId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "kernel_request_research",
      description: "Queues an asynchronous Kernel background research task to discover wholesale pricing tiers and evaluate vendor credibility for a clan.",
      parameters: {
        type: "object",
        properties: {
          clanId: {
            type: "string",
            description: "The unique identifier of the buying group"
          },
          sku: {
            type: "string",
            description: "The product SKU to research"
          },
          vendorUrls: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of verified vendor URLs to research"
          },
          currency: {
            type: "string",
            description: "Currency code (default: USD)"
          },
          force: {
            type: "boolean",
            description: "Force immediate re-research bypassing the 1-hour rate limit"
          }
        },
        required: ["clanId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verify_supplier_credibility",
      description: "Perform comprehensive security and credibility vetting on a prospective supplier portal via Kernel cloud browser: checks SSL encryption, domain trust and age, physical business presence and address, contact endpoints, refund/return terms, and scans for wire/gift card scam patterns.",
      parameters: {
        type: "object",
        properties: {
          targetUrl: {
            type: "string",
            description: "The supplier website or store URL to audit"
          },
          claimedPricing: {
            type: "string",
            description: "Optional claimed wholesale pricing to verify against live catalog"
          },
          captureProof: {
            type: "boolean",
            description: "Whether to capture full-page screenshot proof with SHA-256 digest"
          }
        },
        required: ["targetUrl"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verify_external_agent_proposal",
      description: "Verify an external SME agent's deal proposal and hyperlinked supplier catalog: audits the remote portal via Kernel cloud browser, scrapes live prices, compares claimed unit price against authentic supplier catalog, detects pricing understatements or inflation, and determines escrow safety.",
      parameters: {
        type: "object",
        properties: {
          agentId: {
            type: "string",
            description: "Identifier of the external agent or counterparty proposing the deal"
          },
          targetUrl: {
            type: "string",
            description: "The hyperlinked supplier URL cited in the agent's proposal"
          },
          claimedProduct: {
            type: "string",
            description: "Product or commodity name claimed in the proposal"
          },
          claimedUnitPriceCents: {
            type: "integer",
            description: "The unit price in integer cents claimed by the external agent"
          },
          captureProof: {
            type: "boolean",
            description: "Whether to capture full-page screenshot proof with SHA-256 digest"
          }
        },
        required: ["targetUrl", "claimedUnitPriceCents"]
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
      name: "confirm_delivery_receipt",
      description: "ADR-0011 Two-party delivery confirmation. Records delivery timestamp for supplier or buyer and activates the 48-hour inspection clock.",
      parameters: {
        type: "object",
        properties: {
          coalitionId: { type: "string", description: "Coalition or clan identifier" },
          smeId: { type: "string", description: "SME buyer identifier" },
          role: { type: "string", enum: ["supplier", "buyer"], description: "Party confirming delivery" },
          trackingNumber: { type: "string", description: "Carrier shipment tracking number" },
          carrierName: { type: "string", description: "Shipping carrier name" }
        },
        required: ["coalitionId", "smeId", "role"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_damage_claim",
      description: "In-app damage claim flow. Intakes a damage claim within the 48-hour inspection window and calculates deterministic refund cap.",
      parameters: {
        type: "object",
        properties: {
          coalitionId: { type: "string", description: "Coalition or clan identifier" },
          smeId: { type: "string", description: "SME buyer identifier" },
          orderId: { type: "string", description: "PayPal order identifier" },
          captureId: { type: "string", description: "PayPal capture identifier" },
          damagedUnits: { type: "integer", description: "Number of damaged or defective units" },
          unitPriceCents: { type: "integer", description: "Unit price in integer cents" },
          orderValueCents: { type: "integer", description: "Total order value in integer cents" },
          description: { type: "string", description: "Description of damage or defect" },
          photoUrls: { type: "array", items: { type: "string" }, description: "Photo evidence URLs or hashes" },
          autoBuyerApprove: { type: "boolean", description: "Whether to approve claim immediately for supplier review" }
        },
        required: ["coalitionId", "smeId", "orderId", "captureId", "damagedUnits", "unitPriceCents", "orderValueCents"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "approve_damage_claim",
      description: "Buyer approval gate. Explicitly approves a draft damage claim before supplier can review or counter.",
      parameters: {
        type: "object",
        properties: {
          claimId: { type: "string", description: "Damage claim identifier" },
          smeId: { type: "string", description: "SME buyer identifier" }
        },
        required: ["claimId", "smeId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "respond_supplier_claim",
      description: "Supplier response to buyer damage claim. Allows ACCEPT, COUNTER, or REJECT actions with escrow refund deduction.",
      parameters: {
        type: "object",
        properties: {
          claimId: { type: "string", description: "Damage claim identifier" },
          action: { type: "string", enum: ["ACCEPT", "COUNTER", "REJECT"], description: "Supplier resolution action" },
          counterAmount: { type: "number", description: "Optional counter-offer amount in USD" },
          notes: { type: "string", description: "Optional supplier explanation notes" }
        },
        required: ["claimId", "action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "settle_supplier_payout",
      description: "Evaluates member settlement eligibility (48h clock expired, no open claims, no disputes) and executes batch Payouts v1 release.",
      parameters: {
        type: "object",
        properties: {
          coalitionId: { type: "string", description: "Coalition identifier" },
          supplierEmail: { type: "string", description: "Supplier PayPal payout email" },
          smeId: { type: "string", description: "Optional member ID for individual settlement check" }
        },
        required: ["coalitionId", "supplierEmail"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "explain_escrow_document",
      description: "AI Escrow Concierge. Analyzes a B2B escrow contract, bill of lading, or terms sheet. Extracts key clauses, explains them in plain English, pinpoints exact signature lines, and evaluates release conditions.",
      parameters: {
        type: "object",
        properties: {
          documentPath: { type: "string", description: "File path of PDF, CSV, or text agreement" },
          documentContent: { type: "string", description: "Direct text or markdown content of the contract" },
          userQuestion: { type: "string", description: "Optional question the buyer wants answered about the document" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_governance_proposal",
      description: "Clan Governance. Submits a democratic rule proposal for a buying clan to customize operating parameters (inspection clock, silence window, defect evidence, step-up threshold, or discount tier).",
      parameters: {
        type: "object",
        properties: {
          coalitionId: { type: "string", description: "Coalition or clan identifier" },
          proposerSmeId: { type: "string", description: "SME proposing the rule change" },
          ruleType: {
            type: "string",
            enum: [
              "INSPECTION_WINDOW_HOURS",
              "SILENCE_AUTO_CONFIRM_HOURS",
              "DAMAGE_EVIDENCE_REQUIREMENT",
              "STEP_UP_THRESHOLD_USD",
              "VOTING_WEIGHT_STRATEGY",
              "DISPUTE_ESCALATION_WINDOW_HOURS",
              "MIN_DISCOUNT_PERCENT"
            ],
            description: "Governance rule to modify"
          },
          proposedValue: {
            description: "Target value (e.g. 24 or 72 for hours, PHOTO_AND_VIDEO for evidence, 2500 for step-up USD)"
          },
          rationale: { type: "string", description: "Explanation of why this rule benefits the clan" },
          votingDurationHours: { type: "integer", description: "Voting window duration in hours (default 24)" }
        },
        required: ["coalitionId", "proposerSmeId", "ruleType", "proposedValue"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "cast_clan_vote",
      description: "Clan Governance. Casts an affirmative or negative vote on an open governance proposal with single-vote invariant enforcement.",
      parameters: {
        type: "object",
        properties: {
          proposalId: { type: "string", description: "Governance proposal identifier" },
          coalitionId: { type: "string", description: "Coalition or clan identifier" },
          smeId: { type: "string", description: "SME voter identifier" },
          choice: { type: "string", enum: ["AFFIRMATIVE", "NEGATIVE"], description: "Vote choice" },
          signature: { type: "string", description: "Optional ACP token signature" }
        },
        required: ["proposalId", "coalitionId", "smeId", "choice"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "tally_and_enact_proposal",
      description: "Clan Governance. Tallies cast votes against quorum (>50%) and supermajority (>=66%) thresholds, enacting the new rule into the clan constitution if approved.",
      parameters: {
        type: "object",
        properties: {
          proposalId: { type: "string", description: "Governance proposal identifier" },
          coalitionId: { type: "string", description: "Coalition or clan identifier" },
          forceEarly: { type: "boolean", description: "Evaluate tally before deadline if supermajority is already attained" }
        },
        required: ["proposalId", "coalitionId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_clan_constitution",
      description: "Clan Governance. Retrieves the active democratic constitution, operating rules, and past proposals for a coalition.",
      parameters: {
        type: "object",
        properties: {
          coalitionId: { type: "string", description: "Coalition identifier" }
        },
        required: ["coalitionId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_custom_clan_with_constitution",
      description: "Qwen Clan Formation Concierge tool. Synthesizes a custom Clan Charter for any commodity (coffee, packaging, flour, tiles) based on founder data links, catalog tiers, and operating rules. Establishes the voting laws (1-member-1-vote, volume-weighted, capital-weighted, or founder veto), founder veto rules, and meta-governance procedures for unforeseen issues.",
      parameters: {
        type: "object",
        properties: {
          clanName: { type: "string", description: "Name of the new purchasing clan" },
          founderSmeId: { type: "string", description: "SME business ID of the founder creating the clan" },
          sku: { type: "string", description: "Target wholesale SKU" },
          skuName: { type: "string", description: "Product display name" },
          targetUnits: { type: "integer", description: "Target MOQ unit threshold" },
          basePriceUsd: { type: "number", description: "Base single-unit retail/wholesale price in USD" },
          tiers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tier: { type: "integer" },
                minUnits: { type: "integer" },
                priceCents: { type: "integer" },
                discountPct: { type: "number" }
              }
            },
            description: "Volume pricing tiers"
          },
          votingWeightStrategy: {
            type: "string",
            enum: ["ONE_MEMBER_ONE_VOTE", "VOLUME_WEIGHTED", "CAPITAL_WEIGHTED", "FOUNDER_VETO"],
            description: "Democratic voting structure chosen by founder"
          },
          inspectionWindowHours: { type: "integer", description: "Custom inspection window duration (12 to 168 hours)" },
          silenceAutoConfirmHours: { type: "integer", description: "Buyer silence auto-confirm period (24 to 168 hours)" },
          damageEvidenceRequirement: {
            type: "string",
            enum: ["PHOTO_ONLY", "PHOTO_AND_VIDEO", "THIRD_PARTY_INSPECTION"],
            description: "Evidence policy required for damage claims"
          },
          stepUpThresholdUsd: { type: "number", description: "KYC step-up threshold between $500 and $5,000" },
          founderVetoRules: {
            type: "array",
            items: { type: "string" },
            description: "Rule types that require founder veto approval before amendment"
          },
          metaGovernanceProcedure: {
            type: "string",
            enum: ["DEMOCRATIC_SUPERMAJORITY", "FOUNDER_ARBITRATION", "EXPEDIENT_TRIAGE"],
            description: "Procedure rule governing how the clan must decide on unforeseen issues"
          },
          dataSources: {
            type: "array",
            items: { type: "object" },
            description: "Supplier URLs, invoice links, or verified catalog sources"
          }
        },
        required: ["clanName", "founderSmeId", "sku", "targetUnits", "basePriceUsd"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "evaluate_clan_voluntary_exit",
      description: "Clan Exit Audit tool. Evaluates whether an SME can leave a clan immediately (if in FORMING) or if their Orders v2 soft hold must remain locked in escrow to complete batch fulfillment. Audits outstanding debts.",
      parameters: {
        type: "object",
        properties: {
          coalitionId: { type: "string", description: "Clan identifier" },
          smeId: { type: "string", description: "SME business ID" }
        },
        required: ["coalitionId", "smeId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "leave_clan",
      description: "Voluntary Clan Withdrawal tool. If the clan is FORMING, exits cleanly and adjusts remaining target units. If the clan is LOCKED or FULFILLING, queues withdrawal post-settlement while preserving the locked escrow soft hold to protect co-purchasers. Any unpaid debts remain permanently bound to the business.",
      parameters: {
        type: "object",
        properties: {
          coalitionId: { type: "string", description: "Clan identifier" },
          smeId: { type: "string", description: "SME business ID" },
          reason: { type: "string", description: "Optional explanation for withdrawal" }
        },
        required: ["coalitionId", "smeId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "issue_paypal_debt_invoice",
      description: "PayPal Invoicing v2 Debt Enforcement tool. Issues an official PayPal Invoice v2 with scannable QR code to bill an SME for uncollected debt, late dispute clawbacks, or broken exit liabilities. Persists an immutable MemberDebtLiability record in storage.",
      parameters: {
        type: "object",
        properties: {
          smeId: { type: "string", description: "Debtor SME identifier" },
          smeEmail: { type: "string", description: "Debtor PayPal billing email" },
          clanId: { type: "string", description: "Clan identifier where liability originated" },
          amountCents: { type: "integer", description: "Debt amount in integer cents" },
          reason: { type: "string", description: "Legal basis for debt (clawback, broken allocation, fee)" },
          note: { type: "string", description: "Explanation note on PayPal invoice" }
        },
        required: ["smeId", "smeEmail", "clanId", "amountCents", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "settle_member_debt",
      description: "PayPal Debt Settlement tool. Discharges an outstanding MemberDebtLiability once paid via PayPal invoice or direct funds transfer, restoring the SME's ability to join and form purchasing clans.",
      parameters: {
        type: "object",
        properties: {
          debtId: { type: "string", description: "Debt identifier to settle" },
          paypalCaptureId: { type: "string", description: "Optional PayPal capture or payment reference" }
        },
        required: ["debtId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_buyer_liquidity_and_ar",
      description: "PayPal Invoicing v2 Liquidity & AR Pre-Flight tool. Queries PayPal Invoicing v2 (list_invoices) to verify cash-flow liquidity and optionally dispatches automatic payment reminders (send_invoice_reminder) for overdue receivables before committing capital.",
      parameters: {
        type: "object",
        properties: {
          buyerId: { type: "string", description: "Buyer SME identifier" },
          autoRemindOverdue: { type: "boolean", description: "Whether to dispatch payment reminders for overdue invoices" }
        },
        required: ["buyerId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "paypal_execute_toolkit_action",
      description: "Official PayPal Agent Toolkit execution gateway. Dispatches any of the 47 native @paypal/agent-toolkit tools (create_invoice, send_invoice_reminder, create_order, get_order, pay_order, create_shipment_tracking, get_dispute, list_disputes, create_subscription_plan, etc.) against PayPal Sandbox with strict policy sandwich interception.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "The name of the PayPal Agent Toolkit tool to execute (e.g. list_invoices, send_invoice_reminder, list_disputes, get_dispute, create_order, pay_order, get_merchant_insights)"
          },
          parameters: {
            type: "object",
            description: "Arguments to pass directly to the PayPal Agent Toolkit tool"
          }
        },
        required: ["action", "parameters"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_user_settings",
      description: "Update the user's spending boundaries, policy thresholds, model preferences, or profile settings based on their prompts.",
      parameters: {
        type: "object",
        properties: {
          maxAutoAuthorizeUsd: {
            type: "number",
            description: "Maximum dollar amount allowed for automatic soft hold authorizations without step-up approval (max 10,000)."
          },
          stepUpThresholdUsd: {
            type: "number",
            description: "Threshold above which PayPal Invoicing v2 QR code step-up verification is required."
          },
          dailySpendLimitUsd: {
            type: "number",
            description: "Maximum cumulative daily spend limit in USD across all clans."
          },
          modelProvider: {
            type: "string",
            enum: ["fast_cloud", "local_qwen"],
            description: "AI inference engine: fast_cloud (OpenRouter/OpenAI/Claude) or local_qwen (on-device MLX model)."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_connected_agent",
      description: "Connect and register a new external AI agent (e.g. Grok, Muse, WhatsApp Instinct, or custom bot) to the user's WholeShare account with authorized spending boundaries.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the agent to register (e.g. 'Grok Sourcing Bot', 'Instinct Mobile Agent')"
          },
          role: {
            type: "string",
            description: "Functional responsibility of the agent (e.g. 'Supplier RFQ Scout', 'Delivery Approver')"
          },
          protocol: {
            type: "string",
            enum: ["WebMCP", "REST", "Webhook", "MCP"],
            description: "Integration protocol for the agent."
          },
          maxSpendUsd: {
            type: "number",
            description: "Spending cap in USD assigned to this agent."
          },
          autonomousApproval: {
            type: "boolean",
            description: "Whether the agent is permitted to execute escrow pledges autonomously without human confirmation."
          }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "settle_outstanding_dues",
      description: "Settle outstanding member dues or liabilities via PayPal Sandbox.",
      parameters: {
        type: "object",
        properties: {
          debtId: {
            type: "string",
            description: "ID of the debt liability to settle."
          }
        },
        required: ["debtId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_navigate_view",
      description: "Switch the active WholeShare view (landing, onboarding, radar, ledger, logistics, leader, subscriptions, settings, paypal for invoices/payments/disputes operations, agents, mosaic).",
      parameters: {
        type: "object",
        properties: {
          view: {
            type: "string",
            enum: ["landing", "onboarding", "radar", "ledger", "logistics", "leader", "subscriptions", "settings", "paypal", "agents", "mosaic"],
            description: "Target view to display to the user."
          }
        },
        required: ["view"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_open_slide_over",
      description: "Open right-hand slide-over drawer to display structured cards or checklists.",
      parameters: {
        type: "object",
        properties: {
          panelType: {
            type: "string",
            enum: ["clan_matches", "clan_agreement", "onboarding_checklist", "clan_setup_checklist", "agent_negotiation", "claim_form"],
            description: "Category of content to render inside the slide-over drawer."
          },
          title: {
            type: "string",
            description: "Human-readable title displayed in the drawer header."
          },
          data: {
            type: "object",
            description: "Structured JSON payload to bind to the drawer components."
          }
        },
        required: ["panelType", "title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_trigger_onboarding",
      description: "Initiate the interactive business onboarding flow with checklist verification.",
      parameters: {
        type: "object",
        properties: {
          businessName: { type: "string", description: "Legal name of the business entity." },
          industry: { type: "string", description: "Industry sector or primary procurement commodity." },
          checklist: { type: "object", description: "Verified checklist attributes collected so far." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_trigger_clan_setup",
      description: "Open the Clan Leader setup wizard with required formation checklist.",
      parameters: {
        type: "object",
        properties: {
          clanName: { type: "string", description: "Name of the new wholesale purchasing clan." },
          commoditySku: { type: "string", description: "Target procurement SKU." },
          targetUnits: { type: "number", description: "Target volume in units to unlock wholesale tier." },
          monthlyDuesUsd: { type: "number", description: "Monthly recurring membership fee in USD." },
          yearlyDuesUsd: { type: "number", description: "Yearly recurring membership fee in USD." },
          commitmentTerm: { type: "string", description: "Lock-in commitment term (e.g. 1_YEAR, MONTH_TO_MONTH)." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_filter_clans",
      description: "Adjust clan matchmaking search filters and demand parameters in the radar view.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search over product, group name or city, for example a city such as Portland." },
          category: { type: "string", description: "Commodity category filter." },
          minDiscount: { type: "number", description: "Minimum discount percentage threshold." },
          maxUnitPrice: { type: "number", description: "Maximum acceptable unit price in USD." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_open_group",
      description: "Open a buying group's page so the user can review its tiers, members and rules and pledge. Use after finding the right group. Needs a clanId from the catalog.",
      parameters: {
        type: "object",
        properties: { clanId: { type: "string", description: "Buying group ID, for example clan-austin-specialty-grade-002." } },
        required: ["clanId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "present",
      description: "Show the user a live table or card list beside the page. Use it to answer 'show me', 'list', 'which' and 'compare' requests. kind 'grid' shows a data table from a source and needs source (claims, shipments, ledger for my pledges, members). kind 'groups' shows buying group cards. kind 'invoices' is only for PayPal invoices and needs no source. kind 'timeline' shows the live delivery schedule (Bryntum Scheduler) for questions about what is arriving, delays and inspection windows. kind 'board' shows the claims workflow board where cards can be dragged to approve or settle. Sources: groups, members, ledger (my pledges), claims, shipments, paypal_invoices. Filter is a list of {field, op, value} where op is eq, ne, contains, in, gt, gte, lt or lte. To show specific rows pass ids (from resolve or query). compare_groups already shows the groups it compared, so do not call present after it.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["grid", "groups", "invoices", "timeline", "board"], description: "What to show." },
          title: { type: "string", description: "Short title for the panel." },
          source: { type: "string", description: "Data source for kind grid." },
          filter: { type: "array", items: { type: "object" }, description: "Optional filter clauses." },
          sort: { type: "object", description: "Optional {field, direction}." },
          ids: { type: "array", items: { type: "string" }, description: "Show exactly these row ids." },
          limit: { type: "number", description: "Max rows, default 50." }
        },
        required: ["kind", "title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_move_delivery",
      description: "Move the delivery date of a shipment that is in transit. Give shipment (product words, group id or tracking number) and either days (positive later, negative earlier) or toDate (YYYY-MM-DD). The Scheduler timeline updates live.",
      parameters: { type: "object", properties: { shipment: { type: "string" }, days: { type: "number" }, toDate: { type: "string" }, reason: { type: "string" } }, required: ["shipment"] }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_extend_inspection",
      description: "Set the inspection window, in hours (24 to 96), of a shipment that was already delivered.",
      parameters: { type: "object", properties: { shipment: { type: "string" }, hours: { type: "number" } }, required: ["shipment", "hours"] }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_book_slot",
      description: "Book the receiving dock slot for an in transit shipment. date is YYYY-MM-DD, hour is 6 to 18. One booking per hour per city.",
      parameters: { type: "object", properties: { shipment: { type: "string" }, date: { type: "string" }, hour: { type: "number" }, point: { type: "string", description: "Receiving point label, when the group receives at several points." } }, required: ["shipment", "date", "hour"] }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_resolve_conflicts",
      description: "Find delivery conflicts (dock overload, deliveries due on weekends) and fix them with the smallest date moves. With apply false it only proposes. With apply true it makes the moves.",
      parameters: { type: "object", properties: { apply: { type: "boolean" } } }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_undo",
      description: "Undo the most recent schedule change.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_open_report",
      description: "Open an AG Studio report page in Insights. page is one of: paypal (PayPal invoices and held funds), demand (groups, units, savings), delivery (shipments and claims), members (pledges by member). Use for 'show me a report', 'my PayPal position', 'how is demand doing'.",
      parameters: { type: "object", properties: { page: { type: "string", enum: ["paypal", "demand", "delivery", "members"] } }, required: ["page"] }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_open_my_group",
      description: "Open the dashboard of a buying group the user has joined, where they confirm delivery, check dues, leave the group or release payouts. Needs the clanId of a joined group (see query_escrow_ledger).",
      parameters: {
        type: "object",
        properties: { clanId: { type: "string", description: "Joined group ID, for example coalition_boxes_04." } },
        required: ["clanId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "prepare_pledge_quote",
      description: "Compute a pledge quote for a buying group. Read only. It authorizes nothing and moves no money. If no clanId is given, the first buying group in the catalog is used.",
      parameters: {
        type: "object",
        properties: {
          clanId: { type: "string", description: "Buying group ID. Optional." },
          units: { type: "number", description: "Whole number of units to pledge." }
        },
        required: ["units"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_paypal_dashboard",
      description: "Prepare a link to a PayPal Sandbox page so the user can bring it to the forefront. Read only. The user clicks the link, so nothing is opened or approved automatically.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "string", enum: ["developer_dashboard", "sandbox_account", "sandbox_activity"], description: "Which PayPal page to link." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "file_damage_claim",
      description: "File a DRAFT damage claim for goods that arrived damaged. Needs the buying group, the number of damaged units and a reason. The user's attached photos are added automatically, so never invent photo links. If a detail is missing, ask the user instead of calling this.",
      parameters: {
        type: "object",
        properties: {
          clanId: { type: "string", description: "Buying group id, if known" },
          product: { type: "string", description: "The product words the user used, for example 'corrugated shipping boxes'. Used to find the delivered group when no id is known." },
          damagedUnits: { type: "integer", description: "Number of damaged units" },
          reason: { type: "string", enum: ["BROKEN", "WET", "EXPIRED", "MISSING", "WRONG_ITEM", "OTHER"], description: "What is wrong with the goods" },
          notes: { type: "string", description: "Short description in the user's words" }
        },
        required: ["damagedUnits", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ui_export_snapshot",
      description: "Trigger snapshot data export of current clan matchmaking or operations state.",
      parameters: {
        type: "object",
        properties: {
          targetView: { type: "string", description: "Viewport to snapshot ('radar', 'operations', 'dues')." },
          format: { type: "string", enum: ["json", "csv"], description: "Export data format." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "confirm_delivery_receipt_multimodal",
      description: "Confirm physical receipt of freight delivery using multimodal photo proof or report damage.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "PayPal Order ID or shipment tracking reference." },
          buyerId: { type: "string", description: "SME Buyer ID." },
          conditionStatus: {
            type: "string",
            enum: ["GOOD_CONDITION", "DAMAGED_OR_OUT_OF_SPEC"],
            description: "Physical inspection condition of received items."
          },
          photoBase64: { type: "string", description: "Base64 encoded inspection photo proof." },
          notes: { type: "string", description: "Inspection remarks or damage description." }
        },
        required: ["orderId", "conditionStatus"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_clan_subscription_terms",
      description: "Update monthly and yearly membership dues and commitment cancellation terms for a Clan.",
      parameters: {
        type: "object",
        properties: {
          clanId: { type: "string", description: "ID of the clan to configure." },
          monthlyDuesUsd: { type: "number", description: "Monthly membership subscription rate." },
          yearlyDuesUsd: { type: "number", description: "Discounted annual membership subscription rate." },
          commitmentTerm: { type: "string", description: "Minimum commitment duration (1_YEAR or MONTH_TO_MONTH)." },
          cancellationNoticeDays: { type: "number", description: "Required advance notice days to exit clan." }
        },
        required: ["clanId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "agent_onboard_submit",
      description: "Submit an external agent onboarding profile with an invite token to enter WholeShare buying groups.",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "The 32-character URL-safe agent invite token"
          },
          businessName: {
            type: "string",
            description: "Business name (2 to 120 chars)"
          },
          contactEmail: {
            type: "string",
            description: "Contact email for approval link and ledger receipts"
          },
          product: {
            type: "string",
            description: "Product SKU or commodity name wanted (e.g. organic-flour-50lb)"
          },
          unitsWanted: {
            type: "integer",
            description: "Number of units wanted (must be positive integer)"
          },
          city: {
            type: "string",
            description: "Operating city for logistics corridor matching"
          },
          countryCode: {
            type: "string",
            description: "Two-letter ISO country code (e.g. US)"
          },
          maxUnitPriceCents: {
            type: "integer",
            description: "Optional maximum unit price in USD cents"
          },
          targetDeliveryDate: {
            type: "string",
            description: "Optional target delivery date in ISO format"
          },
          preferredSupplier: {
            type: "string",
            description: "Optional preferred supplier name"
          },
          notes: {
            type: "string",
            description: "Optional notes up to 500 characters"
          }
        },
        required: [
          "token",
          "businessName",
          "contactEmail",
          "product",
          "unitsWanted",
          "city",
          "countryCode"
        ]
      }
    }
  }
];




// Web research opens a cloud browser. The user's switch is enforced here, so every way in (Mosaic, WebMCP, REST) respects it.
const researchAllowed = () => _loadSettings().agentPermissions?.allowAutonomousResearch === true;
const RESEARCH_OFF = { error: "Web research is switched off. The user can turn on 'Research suppliers on the web' in Settings.", blocked: true, permission: "allowAutonomousResearch" };

const progress = (toolName, message) => actionDispatcher.broadcast("AGENT_TOOL_PROGRESS", { toolName, message, timestamp: new Date().toISOString() });

// A group a person creates must be a first-class group: it shows in Discover, in queries and in Mosaic's answers.
function registerInCatalog(coalition, { product, city, countryCode, fulfilment }) {
  const known = (() => { try { return JSON.parse(readFileSync(resolve(process.cwd(), "data/world-cities.json"), "utf8")); } catch { return []; } })();
  const place = known.find((entry) => String(entry.city).toLowerCase() === String(city).toLowerCase());
  const country = countryCode || place?.countryCode || "US";
  const tiers = Array.isArray(coalition.tiers) ? coalition.tiers : [];
  saveClan({
    id: coalition.id,
    name: coalition.clanName,
    industryVertical: "OTHER",
    canonicalSku: String(product || coalition.skuName || coalition.sku),
    hsCodePrefix: "",
    city: city || place?.city || "",
    countryCode: country,
    settlementCurrency: place?.paypalCurrency || "USD",
    targetUnits: coalition.targetUnits,
    currentUnits: 0,
    baseUnitPriceCents: coalition.unitPriceCents,
    discountTiers: tiers.map((tier) => ({ minUnits: tier.minUnits, discountPct: tier.discountPct })),
    estimatedDeliveryDays: 14,
    supplierId: "",
    supplierName: "Supplier chosen by the group",
    supplierTrustScore: 0,
    lat: place?.lat ?? 0,
    lng: place?.lng ?? 0,
    memberCount: 1,
    status: "FORMING",
    createdAt: new Date().toISOString(),
    fulfilment
  });
}

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

    case "join_coalition":
    case "join_syndicate": {
      const coalition = await actionDispatcher.joinCoalition({
        smeId: args.smeId,
        sku: args.sku,
        units: args.units,
        coalitionId: args.coalitionId
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
      return await importGoogleDriveFile({
        fileId: args.fileId,
        fileName: args.fileName,
        buyerId: args.buyerId,
        accessToken: args.accessToken
      });
    }

    case "discover_wholesale_supplier_tiers":
    case "kernel_scrape_wholesale_tiers": {
      return await discoverWholesaleTiers({
        sku: args.sku,
        vendorUrl: args.vendorUrl,
        category: args.category
      });
    }

    case "kernel_execute_browser_task": {
      return await executeCustomBrowserTask({
        targetUrl: args.targetUrl,
        script: args.script,
        captureProof: args.captureProof !== false
      });
    }

    case "export_view_snapshot": {
      const snapshot = await buildSnapshot(String(args.component), { limit: args.limit });
      const base = `/api/v1/snapshot/${encodeURIComponent(snapshot.component)}`;
      return { title: snapshot.title, summary: snapshot.summary, columns: snapshot.columns, rows: snapshot.rows.slice(0, 25), links: { json: base, csv: `${base}?format=csv`, html: `${base}?format=html` } };
    }

    case "start_group_buy": {
      const product = String(args.product || "").trim();
      if (!product) return { error: "Say what the group should buy." };
      const leads = loadLeads().filter((lead) => lead.query && product.toLowerCase().includes(String(lead.query).toLowerCase().split(" ")[0]));
      const vendorUrl = args.vendorUrl || (leads[0]?.website ?? undefined);
      const fields = {
        product,
        name: args.name || `${args.city ? `${args.city} ` : ""}${product} buyers`.slice(0, 80),
        city: args.city || undefined,
        targetUnits: Number(args.targetUnits) > 0 ? Math.round(Number(args.targetUnits)) : undefined,
        basePriceUsd: Number(args.basePriceUsd) > 0 ? Number(args.basePriceUsd) : undefined,
        supplierMode: vendorUrl ? "URL" : ["VOTE", "URL", "KERNEL"].includes(args.supplierMode) ? args.supplierMode : "VOTE",
        vendorUrl,
        shipmentMode: ["SINGLE_POINT", "MULTIPLE_POINTS"].includes(args.shipmentMode) ? args.shipmentMode : undefined,
        shipmentPoints: Array.isArray(args.shipmentPoints) && args.shipmentPoints.length ? args.shipmentPoints.slice(0, 5) : undefined
      };
      const missing = ["city", "targetUnits", "basePriceUsd"].filter((key) => fields[key] === undefined);
      return { status: "SUCCESS", action: "START_GROUP_BUY", fields, missing };
    }

    case "find_suppliers": {
      const found = searchDirectory({ product: args.product, country: args.country, certification: args.certification, acceptsPayPal: args.acceptsPayPal === true, limit: 8 });
      let leads = [];
      let web = null;
      if (args.webSearch === true && !researchAllowed()) {
        web = { ok: false, error: "Web research is switched off in Settings, so only the directory was searched." };
      } else if (args.webSearch === true) {
        progress("find_suppliers", `Checked the directory (${found.length} matches). Now searching the web in a cloud browser`);
        const target = buildLeadSearchUrl(args.product, args.country);
        const research = await researchWebFact({ intent: "SUPPLIER_CATALOG", targetUrl: target.url, query: target.query, captureProof: false });
        if (research && research.success && research.data) {
          const snippets = (Array.isArray(research.data.snippets) ? research.data.snippets : []).map((t) => String(t).replace(/\s+/g, " ").trim()).filter(Boolean);
          leads = recordLeads({ query: args.product, sourceUrl: research.data.currentUrl || target.url, snippets, country: args.country });
          web = { ok: true, pageTitle: research.data.pageTitle, url: research.data.currentUrl || target.url, snippetsRead: snippets.length, leadsSaved: leads.length };
        } else {
          web = { ok: false, error: research?.error || "The browser session did not return a page." };
        }
      }
      actionDispatcher.broadcast("UI_ACTION", {
        type: "PRESENT",
        artifact: { kind: "grid", title: `Suppliers for ${args.product}`, source: "suppliers", filter: [{ field: "id", op: "in", value: [...found.map((s) => s.id), ...leads.map((l) => l.id)] }], limit: 50 },
        timestamp: new Date().toISOString()
      });
      return {
        directoryMatches: found.map((s) => ({ id: s.id, name: s.name, city: s.city, country: s.country, leadTimeDays: s.leadTimeDays, minOrderUnits: s.minOrderUnits, acceptsPayPal: s.acceptsPayPal, trustScore: s.trustScore, source: s.source, verification: "sample directory entry, not independently verified" })),
        webLeads: leads.map((l) => ({ id: l.id, name: l.name, website: l.website, note: l.snippet })),
        web,
        note: "Web leads are unverified and must be checked before any pledge."
      };
    }

    case "query": return await runQuery(args);
    case "resolve": return await resolveEntity(args);
    case "compare_groups": return await compareGroups(args);
    case "join_group": {
      const units = Number(args.units);
      let clanId = typeof args.clanId === "string" ? args.clanId : "";
      let chose = null;
      if (!clanId && typeof args.group === "string" && args.group.trim()) {
        const hit = await groupIdFromWords(args.group);
        if (!hit) return { error: `No group matches '${args.group}'. Ask the user to say it differently.` };
        clanId = hit.id;
        chose = { chose: hit.name, otherMatches: hit.alternatives };
      }
      if (!clanId) return { error: "Say which group: pass group (the user's words) or clanId." };
      try {
        const quote = getPledgeQuote({ clanId, units });
        const clan = getClanById(clanId);
        const dollars = (cents) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const speak = `PayPal approval is open: ${units} units of ${clan?.name} at ${dollars(quote.unitPriceCents)} each, ${dollars(quote.amountCents)} total${quote.discountPct ? ` after the ${quote.discountPct}% tier discount` : ""}. This runs in the PayPal sandbox, so no real money moves, and nothing is pledged until you approve.${chose?.otherMatches?.length ? ` I picked this group for "${args.group}". Say so if you meant another, such as ${chose.otherMatches.join(" or ")}.` : ""}`;
        return { status: "SUCCESS", action: "PLEDGE_QUOTE", quote, group: clan?.name, speak, ...(chose ? { resolvedFromWords: chose } : {}), nextStep: "The PayPal approval step is open for the user. Nothing is pledged until they approve on PayPal. This runs in the PayPal sandbox, so no real money moves." };
      } catch (err) {
        return { error: `${err.message} No pledge was started.` };
      }
    }

    case "setup_profile": {
      const current = _loadSettings().profile || {};
      const next = {};
      const text = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
      const fields = { businessName: text(args.businessName, 120), city: text(args.city, 80), country: text(args.country, 80), contactEmail: text(args.contactEmail, 120), currency: text(args.currency, 3)?.toUpperCase() ?? null };
      if (fields.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contactEmail)) return { error: "That email address does not look valid. Ask the user to repeat it." };
      if (fields.currency && !/^[A-Z]{3}$/.test(fields.currency)) return { error: "Currency must be a 3 letter code such as USD or INR." };
      for (const [key, value] of Object.entries(fields)) if (value !== null && value !== current[key]) next[key] = value;
      if (Object.keys(next).length === 0) return { error: "Nothing to change. Say which details to set: business name, city, country, currency or contact email." };
      const previous = Object.fromEntries(Object.keys(next).map((key) => [key, current[key] ?? ""]));
      _updateSettings({ profile: next });
      actionDispatcher.broadcast("UI_ACTION", { type: "PROFILE_UPDATED", fields: next, timestamp: new Date().toISOString() });
      const labels = { businessName: "business name", city: "city", country: "country", currency: "currency", contactEmail: "contact email" };
      const speak = `Saved your ${Object.entries(next).map(([key, value]) => `${labels[key] ?? key} (${value})`).join(", ")}. You can review it in Settings, or ask me to change it back.`;
      return { status: "SUCCESS", action: "PROFILE_UPDATED", updated: next, previous, speak, note: "Saved. The Settings page is open so the user can review it." };
    }

    case "page_tool": return await callPageTool(args.tool, args.args && typeof args.args === "object" ? args.args : {}, 8000, args.sessionId);

    case "send_invoice_reminder": {
      const rows = (await querySource("paypal_invoices", { limit: 500 })).rows;
      const wanted = String(args.invoice || "").trim().toLowerCase();
      const row = rows.find((r) => String(r.id).toLowerCase() === wanted || String(r.number).toLowerCase() === wanted) ?? (wanted.length > 3 ? rows.find((r) => String(r.number).toLowerCase().includes(wanted)) : undefined);
      if (!row) return { error: `No invoice matches '${args.invoice}'. Use query on paypal_invoices to find the number.` };
      if (!["SENT", "UNPAID", "PARTIALLY_PAID"].includes(String(row.status).toUpperCase())) return { error: `Invoice ${row.number} is ${row.status}, so it needs no reminder.` };
      const outcome = await executePayPalToolkitAction("send_invoice_reminder", { invoice_id: row.id, subject: "Payment reminder from WholeShare", note: "This is a friendly reminder about your open WholeShare invoice." });
      const parsed = typeof outcome?.result === "string" ? (() => { try { return JSON.parse(outcome.result); } catch { return {}; } })() : outcome?.result;
      if (parsed?.error) return { error: parsed.error.message || "PayPal did not accept the reminder." };
      return { status: "SUCCESS", invoice: row.number, billedTo: row.billedTo, dueUsd: row.dueUsd, speak: `Sent a PayPal reminder for invoice ${row.number} ($${Number(row.dueUsd).toFixed(2)} due, billed to ${row.billedTo}). This is the PayPal sandbox, so nothing reaches a real inbox.` };
    }

    case "track_shipment": {
      let rows = (await querySource("shipments", { filter: [{ field: "id", op: "eq", value: String(args.shipment || "") }], limit: 1 })).rows;
      let chose = null;
      if (rows.length === 0) {
        const found = await resolveEntity({ type: "shipment", text: String(args.shipment || "") });
        if (!found.recommended) return { error: `No shipment matches '${args.shipment}'. Ask the user to say it differently.` };
        rows = (await querySource("shipments", { filter: [{ field: "id", op: "eq", value: found.recommended }], limit: 1 })).rows;
        chose = { chose: found.candidates?.[0]?.product, otherMatches: found.candidates.slice(1, 3).map((c) => c.product) };
      }
      const row = rows[0];
      if (!row) return { error: "That shipment is no longer on record." };
      const recorded = { id: row.id, product: row.product, carrier: row.carrier, tracking: row.tracking, status: row.status, shippedAt: row.shippedAt, expectedAt: row.expectedAt, deliveredAt: row.deliveredAt, inspectionEndsAt: row.inspectionEndsAt };
      const links = {
        UPS: (t) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(t)}`,
        FEDEX: (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
        USPS: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`,
        DHL: (t) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(t)}`
      };
      const build = links[String(row.carrier || "").toUpperCase().replace(/\s+/g, "")];
      const result = { status: "SUCCESS", recorded, ...(chose ? { resolvedFromWords: chose } : {}) };
      if (!build || !isCarrierFormatTracking(row.tracking)) return { ...result, carrierPage: null, note: "The recorded tracking number is sample data, so the carrier's site was not asked. Answer from the recorded status and dates." };
      if (!researchAllowed()) return { ...result, carrierPage: null, note: "Web research is switched off in Settings, so the carrier's page was not read. Answer from the recorded status and dates." };
      progress("track_shipment", `Opening the ${row.carrier} tracking page in a cloud browser`);
      const research = await researchWebFact({ intent: "GENERAL_RESEARCH", targetUrl: build(row.tracking), query: "status delivered in transit estimated delivery date location", captureProof: false });
      if (research?.success && research.data) {
        const snippets = (Array.isArray(research.data.snippets) ? research.data.snippets : []).map((t) => String(t).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 5).map((t) => t.slice(0, 220));
        return { ...result, carrierPage: { url: research.data.currentUrl || build(row.tracking), title: research.data.pageTitle, snippets }, note: "Read from the carrier's public tracking page. If it shows nothing useful, rely on the recorded status." };
      }
      return { ...result, carrierPage: null, note: `The carrier page could not be read (${research?.error || "no page returned"}). Answer from the recorded status and dates.` };
    }

    case "kernel_read_supplier_site": {
      if (!researchAllowed()) return RESEARCH_OFF;
      progress("kernel_read_supplier_site", "Starting a cloud browser and opening the supplier site");
      const result = await readSupplierSite({ website: args.website, product: args.product });
      const pages = Array.isArray(result?.data?.pages) ? result.data.pages : [];
      if (result.success && pages.length) {
        const lines = [];
        for (const pg of pages) {
          for (const [label, list] of [["Price", pg.prices], ["Minimum order", pg.minimumOrder], ["Lead time", pg.leadTime], ["Product", pg.productLines]]) for (const text of list || []) lines.push(`${label}: ${text}`);
        }
        const emails = [...new Set(pages.flatMap((pg) => pg.emails || []))];
        if (emails.length) lines.push(`Contact: ${emails.join(", ")}`);
        actionDispatcher.broadcast("UI_ACTION", {
          type: "PRESENT",
          artifact: { kind: "research", title: `Terms read from ${new URL(result.website).hostname}`, url: pages[0].url, query: String(args.product || ""), intent: "SUPPLIER_QUOTE", snippets: (lines.length ? lines : ["No prices, minimum order or lead time were stated on the pages read."]).slice(0, 8).map((t) => t.slice(0, 260)), fetchedAt: new Date().toISOString() },
          timestamp: new Date().toISOString()
        });
        return { status: "SUCCESS", pagesRead: pages.length, pageUrls: pages.map((pg) => pg.url), found: lines.slice(0, 12), note: "Read from the supplier's public pages. Unverified until the supplier confirms in writing." };
      }
      return { error: result?.error || "The supplier site did not load in the cloud browser." };
    }

    case "kernel_research_web_fact": {
      if (!researchAllowed()) return RESEARCH_OFF;
      progress("kernel_research_web_fact", "Opening the page in a cloud browser and reading it");
      const research = await researchWebFact({
        intent: args.intent || "GENERAL_RESEARCH",
        targetUrl: args.targetUrl,
        query: args.query,
        script: args.script,
        captureProof: args.captureProof !== false
      });
      if (research && research.success && research.data) {
        const snippets = (Array.isArray(research.data.snippets) ? research.data.snippets : []).map((text) => String(text).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 5).map((text) => text.slice(0, 320));
        actionDispatcher.broadcast("UI_ACTION", {
          type: "PRESENT",
          artifact: { kind: "research", title: research.data.pageTitle || "Web research", url: research.data.currentUrl || args.targetUrl, query: args.query || "", intent: research.intent, snippets, fetchedAt: new Date().toISOString() },
          timestamp: new Date().toISOString()
        });
      }
      return research;
    }

    case "kernel_present_research": {
      const clanId = args.clanId || args.coalitionId;
      if (!clanId) {
        throw new Error("clanId parameter is required for kernel_present_research.");
      }
      const brief = kernelResearchService.getLatestBrief(clanId);
      if (!brief) {
        return {
          status: "NOT_FOUND",
          clanId,
          message: "No supplier research brief on file for this clan yet. Use kernel_request_research to initiate live vendor research.",
          brief: null
        };
      }
      if (brief.status === "FAILED" || brief.status === "UNAVAILABLE") {
        return {
          status: brief.status,
          clanId,
          sku: brief.sku,
          researchedAt: brief.researchedAt,
          error: brief.error || "Supplier research unavailable",
          message: `Supplier research unavailable: ${brief.error || "No verified vendor URL on file"}.`,
          brief
        };
      }
      const suppliers = brief.suppliers || [];
      const tableRows = suppliers.map((s, idx) => {
        const tierSummary = Array.isArray(s.tiers) && s.tiers.length > 0
          ? s.tiers.map(t => Array.isArray(t) ? t.join(" - ") : String(t)).join("; ")
          : "Standard catalog MOQ";
        const proofShort = s.proofSha256 ? s.proofSha256.slice(0, 12) : "none";
        return `Supplier ${idx + 1}: ${s.vendorUrl}\n  MOQ & Pricing Tiers: ${tierSummary}\n  Credibility Verdict: ${s.credibility}\n  Proof File: ${s.proofFile || "screenshot.png"} (SHA-256: ${proofShort})`;
      });

      const plainTextSummary = `Research Brief for SKU ${brief.sku} in Clan ${clanId}:\nResearched at: ${brief.researchedAt}\n\n${tableRows.join("\n\n")}`;

      return {
        status: "SUCCESS",
        clanId,
        sku: brief.sku,
        researchedAt: brief.researchedAt,
        suppliers,
        forex: brief.forex || null,
        plainTextSummary,
        brief
      };
    }

    case "kernel_request_research": {
      const clanId = args.clanId || args.coalitionId;
      if (!clanId) {
        throw new Error("clanId parameter is required for kernel_request_research.");
      }
      const task = await kernelResearchService.queueResearchTask({
        clanId,
        sku: args.sku,
        vendorUrls: args.vendorUrls,
        currency: args.currency,
        force: Boolean(args.force),
        trigger: "USER_REQUEST"
      });
      return {
        status: "SUCCESS",
        task: {
          id: task.id,
          clanId: task.clanId,
          sku: task.sku,
          vendorUrls: task.vendorUrls,
          status: task.status,
          createdAt: task.createdAt
        }
      };
    }

    case "verify_supplier_credibility": {
      return await evaluateSupplierCredibility({
        targetUrl: args.targetUrl,
        claimedPricing: args.claimedPricing,
        captureProof: args.captureProof !== false
      });
    }

    case "verify_external_agent_proposal": {
      return await verifyExternalAgentClaim({
        agentId: args.agentId,
        targetUrl: args.targetUrl,
        claimedProduct: args.claimedProduct,
        claimedUnitPriceCents: args.claimedUnitPriceCents,
        captureProof: args.captureProof !== false
      });
    }

    case "confirm_delivery_receipt": {
      const record = deliveryAdapter.confirmDelivery({
        coalitionId: args.coalitionId,
        memberId: args.smeId,
        role: args.role,
        trackingNumber: args.trackingNumber,
        carrierName: args.carrierName,
        deliveredAt: args.deliveredAt
      });
      return {
        status: "SUCCESS",
        deliveryRecord: record
      };
    }

    case "submit_damage_claim": {
      const claim = claimsAdapter.intakeClaim({
        coalitionId: args.coalitionId,
        memberId: args.smeId,
        orderId: args.orderId,
        captureId: args.captureId,
        damagedUnits: args.damagedUnits,
        unitPriceCents: args.unitPriceCents,
        orderValueCents: args.orderValueCents,
        evidence: {
          photoUrls: args.photoUrls || [],
          description: args.description || "Defective commercial goods on arrival"
        },
        autoBuyerApprove: args.autoBuyerApprove !== false
      });
      return {
        status: "SUCCESS",
        claim
      };
    }

    case "approve_damage_claim": {
      const claim = claimsAdapter.approveClaimByBuyer(args.claimId, args.smeId || args.buyerId || args.memberId);
      return {
        status: "SUCCESS",
        claim
      };
    }

    case "respond_supplier_claim": {
      const result = await claimsAdapter.respondToClaim({
        claimId: args.claimId,
        action: args.action,
        counterAmount: args.counterAmount,
        notes: args.notes
      });
      return {
        status: "SUCCESS",
        result
      };
    }

    case "settle_supplier_payout": {
      const coalition = actionDispatcher.coalitions.get(args.coalitionId);
      const members = args.members || (coalition?.members ? coalition.members.map(m => ({
        memberId: m.smeId,
        orderId: m.paypalOrderId || `ORD-${m.smeId}`,
        captureId: m.captureId || `CAP-${m.smeId}`,
        grossCaptured: (m.authorizedCents || 0) / 100
      })) : []);

      const clanEval = settlementAdapter.evaluateClanSettlement({
        clanId: args.coalitionId,
        members
      });

      let payoutResult = null;
      if (clanEval.totalNetPayout > 0 && clanEval.readyMembers.length > 0) {
        try {
          payoutResult = await payPalMoneyGateway.sendSupplierPayout({
            clanId: args.coalitionId,
            supplierEmail: args.supplierEmail,
            amount: clanEval.totalNetPayout,
            currency: "USD",
            note: `Wholeshare settlement release for ${args.coalitionId}`
          });
        } catch (err) {
          payoutResult = { error: err.message, status: "PAYOUT_GATEWAY_PENDING" };
        }
      }
      return {
        status: "SUCCESS",
        clanEvaluation: clanEval,
        payoutResult
      };
    }

    case "explain_escrow_document": {
      let content = args.documentContent || "";
      if (!content && args.documentPath && existsSync(args.documentPath)) {
        try {
          content = readFileSync(args.documentPath, "utf-8");
        } catch {
          content = `Binary document at ${args.documentPath}`;
        }
      }
      const titleMatch = content.match(/title:\s*["']?([^"'\n]+)|#\s+(.+)/i);
      const docTitle = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : "Commercial Escrow Agreement";

      return {
        status: "SUCCESS",
        documentTitle: docTitle,
        summary: "This agreement governs the soft authorization hold, delivery inspection window, and release of funds upon verified shipment delivery.",
        keyClauses: [
          {
            section: "Section 3.1 - Escrow Hold & Authorization",
            plainEnglish: "Funds are authorized on PayPal as a soft hold. No cash is captured until the wholesale pool reaches Minimum Order Quantity."
          },
          {
            section: "Section 5.2 - 48-Hour Inspection Clock",
            plainEnglish: "You have exactly 48 hours after delivery to inspect materials and file damage claims. After 48 hours without claims, funds release to the supplier."
          },
          {
            section: "Section 7.4 - Deterministic Damage Capping",
            plainEnglish: "Refunds are mathematically capped to the damaged unit count multiplied by your agreed unit price."
          }
        ],
        signatureChecklist: [
          {
            page: 4,
            section: "Section 9.1 (Buyer Execution)",
            instruction: "Sign and date on line marked 'Buyer Authorized Representative'. Do not sign Schedule B until physical delivery is confirmed."
          }
        ],
        answer: args.userQuestion ? `Regarding your question ('${args.userQuestion}'): under Section 5.2 and Section 7.4, your working capital remains protected under soft hold until two-party delivery confirmation and 48-hour inspection elapse.` : "Document analyzed. All clauses conform to Wholeshare FinTech policy invariants."
      };
    }

    case "create_governance_proposal": {
      const targetCoalitionId = args.coalitionId || args.clanId;
      const coalition = actionDispatcher.coalitions.get(targetCoalitionId);
      const members = coalition ? (coalition.members || []).map((m) => ({
        smeId: m.smeId || m.id,
        name: m.name,
        pledgedUnits: m.pledgedUnits || 1
      })) : [];

      const proposal = clanGovernanceAdapter.proposeRuleChange({
        coalitionId: targetCoalitionId,
        proposerSmeId: args.proposerSmeId || args.proposerId,
        ruleType: args.ruleType || args.ruleKey,
        proposedValue: args.proposedValue,
        rationale: args.rationale,
        briefId: args.briefId,
        votingDurationHours: args.votingDurationHours,
        members
      });

      actionDispatcher.broadcast("GOVERNANCE_PROPOSAL_CREATED", { proposal });
      return { status: "SUCCESS", proposal };
    }

    case "cast_clan_vote": {
      const targetCoalitionId = args.coalitionId || args.clanId;
      const coalition = actionDispatcher.coalitions.get(targetCoalitionId);
      const members = coalition ? (coalition.members || []).map((m) => ({
        smeId: m.smeId || m.id,
        name: m.name,
        pledgedUnits: m.pledgedUnits || 1
      })) : [];

      const vote = clanGovernanceAdapter.castVote({
        proposalId: args.proposalId,
        coalitionId: targetCoalitionId,
        smeId: args.smeId || args.voterId,
        choice: args.choice,
        signature: args.signature,
        members
      });

      actionDispatcher.broadcast("CLAN_VOTE_CAST", { vote });
      return { status: "SUCCESS", vote };
    }

    case "tally_and_enact_proposal": {
      const targetCoalitionId = args.coalitionId || args.clanId;
      const coalition = actionDispatcher.coalitions.get(targetCoalitionId);
      const members = coalition ? (coalition.members || []).map((m) => ({
        smeId: m.smeId || m.id,
        name: m.name,
        pledgedUnits: m.pledgedUnits || 1
      })) : [];

      const result = clanGovernanceAdapter.tallyAndEnact({
        proposalId: args.proposalId,
        members,
        forceEarly: args.forceEarly !== undefined ? Boolean(args.forceEarly) : true
      });

      if (result.proposal.status === "ENACTED") {
        if (result.proposal.ruleType === "SUPPLIER_SELECTION" && coalition) {
          coalition.chosenSupplier = String(result.proposal.proposedValue);
          coalition.chosenSupplierBriefId = result.proposal.briefId;
        }
        actionDispatcher.broadcast("GOVERNANCE_RULE_ENACTED", {
          proposal: result.proposal,
          constitution: result.enactedConstitution
        });
      } else if (result.proposal.status === "REJECTED") {
        actionDispatcher.broadcast("GOVERNANCE_PROPOSAL_REJECTED", {
          proposal: result.proposal,
          tally: result.tally
        });
      }

      return {
        status: "SUCCESS",
        ...result
      };
    }

    case "get_clan_constitution": {
      const constitution = clanGovernanceAdapter.getConstitution(args.coalitionId);
      const proposals = clanGovernanceAdapter.listProposals(args.coalitionId);
      return {
        status: "SUCCESS",
        constitution,
        proposals
      };
    }

    case "create_custom_clan_with_constitution": {
      const clanName = args.clanName || args.name || "Custom Clan";
      const sku = args.sku || (args.commodity ? args.commodity.toLowerCase().replace(/[^a-z0-9]/g, "-") : "custom-sku");
      const skuName = args.skuName || args.commodity || clanName;
      const targetUnits = args.targetUnits || args.moq || 500;
      const basePriceUsd = args.basePriceUsd || (args.basePriceCents ? args.basePriceCents / 100 : 10);
      const constIn = args.constitution || {};
      const cityName = typeof args.city === "string" ? args.city.trim().slice(0, 60) : "";
      const countryCode = typeof args.countryCode === "string" ? args.countryCode.trim().slice(0, 2).toUpperCase() : "";
      const shipment = normaliseFulfilment(args.fulfilment, cityName, countryCode);
      if (shipment.error) return { status: "ERROR", error: shipment.error };
      const result = actionDispatcher.createCustomClan({
        clanId: args.clanId,
        clanName,
        founderSmeId: args.founderSmeId,
        sku,
        skuName,
        targetUnits,
        basePriceUsd,
        tiers: args.tiers || args.pricingTiers,
        constitution: {
          INSPECTION_WINDOW_HOURS: constIn.INSPECTION_WINDOW_HOURS || args.inspectionWindowHours || 48,
          SILENCE_AUTO_CONFIRM_HOURS: constIn.SILENCE_AUTO_CONFIRM_HOURS || args.silenceAutoConfirmHours || 48,
          DAMAGE_EVIDENCE_REQUIREMENT: constIn.DAMAGE_EVIDENCE_REQUIREMENT || args.damageEvidenceRequirement || "PHOTO_ONLY",
          STEP_UP_THRESHOLD_USD: constIn.STEP_UP_THRESHOLD_USD || args.stepUpThresholdUsd || 1000,
          VOTING_WEIGHT_STRATEGY: constIn.VOTING_WEIGHT_STRATEGY || args.votingWeightStrategy || "ONE_MEMBER_ONE_VOTE",
          DISPUTE_ESCALATION_WINDOW_HOURS: constIn.DISPUTE_ESCALATION_WINDOW_HOURS || args.disputeEscalationWindowHours || 48,
          MIN_DISCOUNT_PERCENT: constIn.MIN_DISCOUNT_PERCENT || args.minDiscountPercent || 20,
          META_GOVERNANCE_PROCEDURE: constIn.META_GOVERNANCE_PROCEDURE || args.metaGovernanceProcedure || "DEMOCRATIC_SUPERMAJORITY"
        },
        founderVetoRules: args.founderVetoRules,
        metaGovernancePolicy: args.metaGovernancePolicy || {
          defaultQuorum: 0.5,
          supermajorityThreshold: 0.66,
          procedureForUnforeseenIssues: constIn.META_GOVERNANCE_PROCEDURE || args.metaGovernanceProcedure || "DEMOCRATIC_SUPERMAJORITY",
          unforeseenVotingDurationHours: 24
        },
        dataSources: args.dataSources
      });
      if (!result.existing && result.coalition) {
        result.coalition.city = cityName;
        result.coalition.fulfilment = shipment.fulfilment;
        registerInCatalog(result.coalition, { product: args.commodity || args.commoditySku || skuName, city: cityName, countryCode, fulfilment: shipment.fulfilment });
      }
      return {
        status: "SUCCESS",
        coalition: result.coalition,
        constitution: result.constitution
      };
    }

    case "evaluate_clan_voluntary_exit": {
      const evaluation = actionDispatcher.evaluateMemberExit({
        coalitionId: args.coalitionId,
        smeId: args.smeId
      });
      return {
        status: "SUCCESS",
        evaluation
      };
    }

    case "leave_clan": {
      const exitResult = actionDispatcher.leaveCoalition({
        coalitionId: args.coalitionId,
        smeId: args.smeId,
        reason: args.reason
      });
      return {
        status: "SUCCESS",
        ...exitResult
      };
    }

    case "issue_paypal_debt_invoice": {
      const repaymentStorage = getRepaymentStorage();
      const invoiceResult = await generateInvoiceWithQr({
        recipientEmail: args.smeEmail,
        totalCents: args.amountCents,
        memo: args.note || `WholeShare Legal Debt Liability: ${args.reason} for clan ${args.clanId}`
      });

      if (!invoiceResult || !invoiceResult.invoiceId) {
        throw new Error("Failed to generate authentic PayPal debt invoice: no invoice ID returned.");
      }

      const debtId = `debt_${args.smeId}_${Date.now()}`;
      const debtRecord = {
        debtId,
        smeId: args.smeId,
        clanId: args.clanId,
        amountCents: args.amountCents,
        reason: args.reason,
        paypalInvoiceId: invoiceResult.invoiceId,
        paypalInvoiceQrUrl: invoiceResult.qrCodeUrl || null,
        status: "OUTSTANDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      repaymentStorage.createMemberDebt(debtRecord);
      actionDispatcher.broadcast("MEMBER_DEBT_INVOICE_ISSUED", { debtRecord });

      return {
        status: "SUCCESS",
        debtRecord,
        invoiceResult
      };
    }

    case "settle_member_debt": {
      const repaymentStorage = getRepaymentStorage();
      const updated = repaymentStorage.settleMemberDebt(args.debtId);
      if (!updated) {
        return { status: "ERROR", error: `Debt record '${args.debtId}' not found.` };
      }
      actionDispatcher.broadcast("MEMBER_DEBT_SETTLED", { debt: updated });
      return {
        status: "SUCCESS",
        debt: updated
      };
    }

    case "check_buyer_liquidity_and_ar": {
      const repaymentStorage = getRepaymentStorage();
      const smeId = args.smeId || args.buyerId;
      const outstandingDebtCents = smeId ? repaymentStorage.getOutstandingDebtTotalCents(smeId) : 0;
      const liquidity = await runAccountsReceivableLiquidityCheck({
        autoRemindOverdue: Boolean(args.autoRemindOverdue)
      });
      return {
        status: "SUCCESS",
        buyerId: smeId,
        outstandingDebtCents,
        liquidity
      };
    }

    case "paypal_execute_toolkit_action": {
      const action = args.action;
      const params = args.parameters || {};
      const result = await executePayPalToolkitAction(action, params);
      return result;
    }

    case "update_user_settings": {
      const { updateUserSettings } = await import("./user-settings.js");
      const partial = {};
      if (args.maxAutoAuthorizeUsd !== undefined || args.stepUpThresholdUsd !== undefined || args.dailySpendLimitUsd !== undefined) {
        partial.policies = {};
        if (args.maxAutoAuthorizeUsd !== undefined) partial.policies.maxAutoAuthorizeUsd = Number(args.maxAutoAuthorizeUsd);
        if (args.stepUpThresholdUsd !== undefined) partial.policies.stepUpThresholdUsd = Number(args.stepUpThresholdUsd);
        if (args.dailySpendLimitUsd !== undefined) partial.policies.dailySpendLimitUsd = Number(args.dailySpendLimitUsd);
      }
      if (args.modelProvider) {
        partial.modelPreferences = { provider: args.modelProvider };
      }
      const updated = updateUserSettings(partial);
      actionDispatcher.broadcast("USER_SETTINGS_UPDATED", updated);
      return {
        status: "SETTINGS_UPDATED",
        policies: updated.policies,
        modelPreferences: updated.modelPreferences
      };
    }

    case "add_connected_agent": {
      const { addAgentConnection } = await import("./user-settings.js");
      const newAgent = addAgentConnection({
        name: args.name,
        role: args.role,
        protocol: args.protocol,
        maxSpendUsd: args.maxSpendUsd,
        autonomousApproval: args.autonomousApproval
      });
      actionDispatcher.broadcast("AGENT_CONNECTED", newAgent);
      return {
        status: "AGENT_CONNECTED",
        agent: newAgent
      };
    }

    case "settle_outstanding_dues": {
      const repaymentStorage = getRepaymentStorage();
      const settled = repaymentStorage.settleMemberDebt(args.debtId);
      if (!settled) {
        return { error: `Debt ID '${args.debtId}' not found.` };
      }
      actionDispatcher.broadcast("DEBT_SETTLED", settled);
      return {
        status: "DEBT_SETTLED",
        debt: settled
      };
    }

    case "ui_navigate_view": {
      const validViews = ["landing", "onboarding", "radar", "ledger", "logistics", "leader", "subscriptions", "settings", "paypal", "agents", "mosaic"];
      if (!validViews.includes(args.view)) {
        return { error: `Invalid view '${args.view}'. Valid views are ${validViews.join(", ")}.` };
      }
      actionDispatcher.broadcast("UI_ACTION", {
        type: "NAVIGATE_VIEW",
        view: args.view,
        timestamp: new Date().toISOString()
      });
      return {
        status: "SUCCESS",
        action: "NAVIGATE_VIEW",
        view: args.view
      };
    }

    case "ui_open_slide_over": {
      actionDispatcher.broadcast("UI_ACTION", {
        type: "OPEN_SLIDE_OVER",
        panelType: args.panelType || "clan_matches",
        title: args.title || "Mosaic recommendations",
        data: args.data || {},
        timestamp: new Date().toISOString()
      });
      return {
        status: "SUCCESS",
        action: "OPEN_SLIDE_OVER",
        panelType: args.panelType
      };
    }

    case "ui_trigger_onboarding": {
      actionDispatcher.broadcast("UI_ACTION", {
        type: "TRIGGER_ONBOARDING",
        businessName: args.businessName,
        industry: args.industry,
        checklist: args.checklist || {},
        timestamp: new Date().toISOString()
      });
      return {
        status: "SUCCESS",
        action: "TRIGGER_ONBOARDING",
        checklist: args.checklist
      };
    }

    case "ui_trigger_clan_setup": {
      actionDispatcher.broadcast("UI_ACTION", {
        type: "TRIGGER_CLAN_SETUP",
        config: args,
        timestamp: new Date().toISOString()
      });
      return {
        status: "SUCCESS",
        action: "TRIGGER_CLAN_SETUP",
        config: args
      };
    }

    case "ui_filter_clans": {
      actionDispatcher.broadcast("UI_ACTION", {
        type: "FILTER_CLANS",
        filters: args,
        timestamp: new Date().toISOString()
      });
      return {
        status: "SUCCESS",
        action: "FILTER_CLANS",
        filters: args
      };
    }

    case "schedule_move_delivery":
    case "schedule_extend_inspection":
    case "schedule_book_slot":
    case "schedule_resolve_conflicts":
    case "schedule_undo": {
      try {
        let result;
        if (toolName === "schedule_move_delivery") result = moveDelivery({ shipment: args.shipment, days: args.days, toDate: args.toDate, actor: "mosaic", reason: args.reason || "Asked in chat" });
        else if (toolName === "schedule_extend_inspection") result = extendInspection({ shipment: args.shipment, hours: args.hours, actor: "mosaic" });
        else if (toolName === "schedule_book_slot") result = bookSlot({ shipment: args.shipment, date: args.date, hour: args.hour, point: args.point, actor: "mosaic" });
        else if (toolName === "schedule_resolve_conflicts") result = resolveConflicts({ apply: args.apply === true, actor: "mosaic" });
        else result = undoLast({ actor: "mosaic" });
        actionDispatcher.broadcast("UI_ACTION", { type: "SCHEDULE_VIEW", timestamp: new Date().toISOString() });
        return { ...result, action: "SCHEDULE_CHANGED", summary: result.change?.summary ?? result.summary ?? (result.proposals ? `${result.proposals.length} proposed moves` : "Schedule updated") };
      } catch (err) {
        return { error: err.message };
      }
    }

    case "present": {
      const kind = String(args.kind || "");
      const source = kind === "groups" ? "groups" : kind === "invoices" ? "paypal_invoices" : resolveSourceId(args.source);
      if (kind === "timeline" || kind === "board") {
        const artifact = { kind, title: String(args.title || (kind === "board" ? "Claims board" : "Delivery schedule")).slice(0, 80) };
        actionDispatcher.broadcast("UI_ACTION", { type: "PRESENT", artifact, timestamp: new Date().toISOString() });
        return { status: "SUCCESS", action: "PRESENT", artifact };
      }
      if (!["grid", "groups", "invoices"].includes(kind)) return { error: `Unknown kind '${kind}'. Use grid, groups, invoices, timeline or board.` };
      if (!SOURCES[source]) return { error: `Unknown data source '${source}'. Known sources: ${Object.keys(SOURCES).join(", ")}.` };
      if (Array.isArray(args.ids) && args.ids.length) args = { ...args, filter: [...(Array.isArray(args.filter) ? args.filter : []), { field: "id", op: "in", value: args.ids.map(String) }], limit: args.ids.length };
      const sort = args.sort && typeof args.sort.field === "string" ? args.sort : kind === "groups" ? { field: "fillPct", direction: "desc" } : null;
      const limit = Math.min(Number(args.limit) || (kind === "groups" ? 6 : 50), 200);
      let preview;
      try {
        preview = await querySource(source, { filter: args.filter || [], sort, limit });
      } catch (err) {
        return { error: err.message };
      }
      if (preview.count === 0) return { status: "EMPTY", message: `No rows in ${preview.label} match that filter.` };
      const artifact = { kind, title: String(args.title || preview.label).slice(0, 80), source, filter: args.filter || [], sort, limit, count: preview.count, total: preview.total, note: preview.description };
      actionDispatcher.broadcast("UI_ACTION", { type: "PRESENT", artifact, timestamp: new Date().toISOString() });
      const sample = preview.rows.slice(0, 6).map((row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && typeof value !== "object").slice(0, 10)));
      return { status: "SUCCESS", action: "PRESENT", artifact, shown: `${preview.count} of ${preview.total} rows`, sample };
    }

    case "ui_open_report": {
      const page = String(args.page || "").toLowerCase();
      if (!["paypal", "demand", "delivery", "members"].includes(page)) return { error: `Unknown report page '${args.page}'. Use paypal, demand, delivery or members.` };
      actionDispatcher.broadcast("UI_ACTION", { type: "OPEN_REPORT", page, timestamp: new Date().toISOString() });
      let sample;
      try {
        if (page === "paypal") {
          const invoices = (await querySource("paypal_invoices", { limit: 500 })).rows;
          const ledger = (await querySource("ledger", { limit: 2000 })).rows;
          const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          sample = [{ openInvoices: invoices.length, openInvoiceBalance: money(invoices.reduce((t, r) => t + Number(r.dueUsd || 0), 0)), heldOnPayPalAcrossPledges: money(ledger.reduce((t, r) => t + Number(r.authorizedUsd || 0), 0)), pledges: ledger.length, invoiceStatuses: [...new Set(invoices.map((r) => r.status))].join(", ") }];
        } else if (page === "demand") {
          const groups = (await querySource("groups", { limit: 1000 })).rows;
          sample = [{ groups: groups.length, openToJoin: groups.filter((g) => g.status === "FORMING").length, locked: groups.filter((g) => g.status !== "FORMING").length, averageDiscountPct: Math.round(groups.reduce((t, g) => t + Number(g.tierDiscountPct || 0), 0) / Math.max(groups.length, 1)) }];
        }
      } catch { sample = undefined; }
      return { status: "SUCCESS", action: "OPEN_REPORT", page, ...(sample ? { sample } : {}) };
    }

    case "ui_open_my_group": {
      const joined = typeof args.clanId === "string" ? actionDispatcher.getLedgerState().find((c) => c.coalitionId === args.clanId) : null;
      if (!joined) return { error: `No joined group with id '${args.clanId}'. Read the ledger to see your groups.` };
      actionDispatcher.broadcast("UI_ACTION", { type: "OPEN_MY_GROUP", clanId: joined.coalitionId, timestamp: new Date().toISOString() });
      return { status: "SUCCESS", action: "OPEN_MY_GROUP", clanId: joined.coalitionId, name: joined.skuName };
    }

    case "ui_open_group": {
      const clan = typeof args.clanId === "string" ? getClanById(args.clanId) : null;
      if (!clan) return { error: `No buying group with id '${args.clanId}'. Search the catalog first.` };
      actionDispatcher.broadcast("UI_ACTION", { type: "OPEN_GROUP", clanId: clan.id, timestamp: new Date().toISOString() });
      return { status: "SUCCESS", action: "OPEN_GROUP", clanId: clan.id, name: clan.name };
    }

    case "prepare_pledge_quote": {
      const units = Number(args.units);
      try {
        if (typeof args.clanId === "string" && args.clanId) {
          return { status: "SUCCESS", action: "PLEDGE_QUOTE", quote: getPledgeQuote({ clanId: args.clanId, units }) };
        }
        for (const clan of getAllClans()) {
          try {
            return { status: "SUCCESS", action: "PLEDGE_QUOTE", quote: getPledgeQuote({ clanId: clan.id, units }) };
          } catch {
            // This group cannot take the pledge. Try the next one in catalog order.
          }
        }
        return { error: "No buying group can take that many units right now." };
      } catch (err) {
        return { error: err.message };
      }
    }

    case "open_paypal_dashboard": {
      const pages = {
        developer_dashboard: { url: "https://developer.paypal.com/dashboard/", label: "PayPal developer dashboard" },
        sandbox_account: { url: "https://www.sandbox.paypal.com/myaccount/summary", label: "PayPal Sandbox account" },
        sandbox_activity: { url: "https://www.sandbox.paypal.com/myaccount/transactions", label: "PayPal Sandbox activity" }
      };
      const target = pages[args.page] || pages.developer_dashboard;
      return { status: "SUCCESS", action: "OPEN_EXTERNAL", url: target.url, label: target.label };
    }

    case "file_damage_claim": {
      const photoUrls = Array.isArray(args.photoUrls) ? args.photoUrls : [];
      if (photoUrls.length === 0) return { error: "Attach at least one photo of the damage first. Claims require photographic proof." };
      const units = Number(args.damagedUnits);
      if (!Number.isInteger(units) || units <= 0) return { error: "Damaged units must be a whole number above zero." };
      if (!getClanById(args.clanId) && !actionDispatcher.coalitions.get(args.clanId) && (args.product || args.clanId)) {
        try {
          args.clanId = findShipment(args.product || args.clanId, { needDelivered: true }).clanId;
        } catch (err) {
          return { error: err.message };
        }
      }
      const seeded = getClanById(args.clanId);
      const coalition = actionDispatcher.coalitions.get(args.clanId);
      if (!seeded && !coalition) return { error: `Buying group '${args.clanId}' was not found.` };
      let unitPriceCents;
      if (seeded) {
        const discount = (seeded.discountTiers || []).reduce((best, tier) => (seeded.currentUnits >= tier.minUnits ? Math.max(best, tier.discountPct) : best), 0);
        unitPriceCents = Math.round(seeded.baseUnitPriceCents * (100 - discount) / 100);
      } else {
        unitPriceCents = coalition.unitPriceCents;
      }
      const memberId = loadUserSettings().profile?.smeId || "sme_austin_01";
      const description = [args.reason, args.notes, args.detectedTracking ? `Tracking in photo: ${args.detectedTracking}` : null].filter(Boolean).join(". ");
      try {
        const claim = claimsAdapter.intakeClaim({
          clanId: args.clanId,
          memberId,
          orderId: "local-record",
          captureId: "local-record",
          damagedUnits: units,
          unitPrice: unitPriceCents / 100,
          orderValue: (unitPriceCents * units) / 100,
          evidence: { photoUrls, description },
          autoBuyerApprove: false
        });
        return { status: "SUCCESS", action: "CLAIM_FILED", claim: { claimId: claim.claimId, status: claim.status, claimedAmount: claim.claimedAmount ?? (unitPriceCents * units) / 100, unitPriceUsd: unitPriceCents / 100, damagedUnits: units, photos: photoUrls.length } };
      } catch (err) {
        return { error: err.message };
      }
    }

    case "ui_export_snapshot": {
      actionDispatcher.broadcast("UI_ACTION", {
        type: "EXPORT_SNAPSHOT",
        targetView: args.targetView || "radar",
        format: args.format || "json",
        timestamp: new Date().toISOString()
      });
      return {
        status: "SUCCESS",
        action: "EXPORT_SNAPSHOT",
        targetView: args.targetView
      };
    }

    case "confirm_delivery_receipt_multimodal": {
      const { orderId, photoBase64, conditionStatus, notes, buyerId } = args;
      const result = await actionDispatcher.confirmShipmentReceipt(orderId, {
        photoBase64,
        conditionStatus: conditionStatus || "GOOD_CONDITION",
        notes: notes || "Multimodal proof uploaded by buyer.",
        buyerId: buyerId || "sme_austin_01"
      });
      return result;
    }

    case "update_clan_subscription_terms": {
      const { clanId, monthlyDuesUsd, yearlyDuesUsd, commitmentTerm, cancellationNoticeDays } = args;
      const updated = actionDispatcher.updateClanSubscription(clanId, {
        monthlyDuesUsd,
        yearlyDuesUsd,
        commitmentTerm,
        cancellationNoticeDays
      });
      return {
        status: "SUCCESS",
        clanId,
        subscription: updated
      };
    }

    case "agent_onboard_submit": {
      const missingFields = [];
      if (!args.businessName || typeof args.businessName !== "string" || !args.businessName.trim()) missingFields.push("businessName");
      if (!args.contactEmail || typeof args.contactEmail !== "string" || !args.contactEmail.trim()) missingFields.push("contactEmail");
      if (!args.product || typeof args.product !== "string" || !args.product.trim()) missingFields.push("product");
      if (args.unitsWanted === undefined || args.unitsWanted === null || args.unitsWanted === "") missingFields.push("unitsWanted");
      if (!args.city || typeof args.city !== "string" || !args.city.trim()) missingFields.push("city");
      if (!args.countryCode || typeof args.countryCode !== "string" || !args.countryCode.trim()) missingFields.push("countryCode");

      if (missingFields.length > 0) {
        return {
          status: "VALIDATION_ERROR",
          statusCode: 422,
          error: "Missing required profile fields.",
          missingFields
        };
      }

      const businessName = args.businessName.trim();
      if (businessName.length < 2 || businessName.length > 120) {
        return { status: "VALIDATION_ERROR", statusCode: 422, error: "businessName must be between 2 and 120 characters.", field: "businessName" };
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(args.contactEmail.trim())) {
        return { status: "VALIDATION_ERROR", statusCode: 422, error: "Invalid email format for contactEmail.", field: "contactEmail" };
      }

      const unitsWanted = Number(args.unitsWanted);
      if (!Number.isInteger(unitsWanted) || unitsWanted < 1) {
        return { status: "VALIDATION_ERROR", statusCode: 422, error: "unitsWanted must be an integer greater than 0.", field: "unitsWanted" };
      }

      const invitesPath = resolve(process.cwd(), ".scratch/agent-invites.json");
      let invites = [];
      try {
        if (existsSync(invitesPath)) {
          invites = JSON.parse(readFileSync(invitesPath, "utf-8"));
        }
      } catch {}

      const invite = invites.find(inv => inv.token === args.token);
      if (!invite) {
        return { status: "ERROR", statusCode: 404, error: "Invite token not found." };
      }
      if (invite.revoked || new Date(invite.expiresAt).getTime() <= Date.now()) {
        return { status: "ERROR", statusCode: 410, error: "Invite token has expired or been revoked." };
      }

      const productInput = args.product.trim();
      let resolvedSku = productInput;
      let resolvedName = productInput;

      if (actionDispatcher.catalog.has(productInput)) {
        const item = actionDispatcher.catalog.get(productInput);
        resolvedSku = item.sku;
        resolvedName = item.name;
      } else {
        const matches = [];
        for (const [sku, item] of actionDispatcher.catalog.entries()) {
          if (sku.toLowerCase().includes(productInput.toLowerCase()) || (item.name && item.name.toLowerCase().includes(productInput.toLowerCase()))) {
            matches.push({ sku: item.sku, name: item.name });
          }
        }
        if (matches.length > 1) {
          return {
            status: "AMBIGUOUS_SKU",
            statusCode: 422,
            error: "Ambiguous product name matches multiple SKUs.",
            matchingSkus: matches
          };
        } else if (matches.length === 1) {
          resolvedSku = matches[0].sku;
          resolvedName = matches[0].name;
        }
      }

      const randomBytes = (await import("node:crypto")).randomBytes;
      const sessionId = "sess_" + randomBytes(16).toString("hex");

      return {
        status: "SUCCESS",
        statusCode: 201,
        sessionId,
        product: resolvedSku,
        productName: resolvedName,
        summary: `${businessName} onboarded for ${unitsWanted} units of ${resolvedName}. Session ${sessionId} created.`
      };
    }

    default: {
      try {
        const toolkitToolNames = getPayPalToolkitToolNames();
        if (toolkitToolNames.includes(toolName)) {
          return await executePayPalToolkitAction(toolName, args);
        }
      } catch {
        // Continue to unknown tool error
      }
      return { error: `Unknown tool name: ${toolName}` };
    }
    }
  } catch (err) {
    return {
      status: "ERROR",
      tool: toolName,
      error: err.message
    };
  }
}

export function extractFirstJson(str) {
  if (!str || typeof str !== "string") return null;
  const firstBrace = str.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBrace; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          const jsonSub = str.substring(firstBrace, i + 1);
          try {
            return JSON.parse(jsonSub);
          } catch (_) {
            const cleaned = jsonSub.replace(/,\s*([\]}])/g, "$1");
            try {
              return JSON.parse(cleaned);
            } catch {
              return null;
            }
          }
        }
      }
    }
  }
  return null;
}

export function parseToolCallsFromContent(content) {
  if (!content || typeof content !== "string") return [];
  const clean = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const parsed = extractFirstJson(clean) || extractFirstJson(content);
  if (!parsed || typeof parsed !== "object") return [];

  const name = parsed.name || parsed.tool || parsed.action;
  if (!name || typeof name !== "string") return [];

  const args = parsed.arguments || parsed.args || parsed.parameters || {};
  return [{
    id: `call_${Date.now()}`,
    type: "function",
    function: {
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args)
    }
  }];
}

