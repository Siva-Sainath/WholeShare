import { PayPalAgentToolkit, ALL_TOOLS_ENABLED } from "@paypal/agent-toolkit/ai-sdk";
import dotenv from "dotenv";

dotenv.config();

export interface AgentToolkitConfig {
  clientId?: string;
  clientSecret?: string;
  sandbox?: boolean;
}

/**
 * Initialize official PayPalAgentToolkit with SyndicatePay configuration
 */
export function initializePayPalAgentToolkit(config?: AgentToolkitConfig): PayPalAgentToolkit {
  const clientId = config?.clientId || process.env.PAYPAL_CLIENT_ID || "sandbox_placeholder_client_id";
  const clientSecret = config?.clientSecret || process.env.PAYPAL_CLIENT_SECRET || "sandbox_placeholder_secret";
  const isSandbox = config?.sandbox ?? (process.env.PAYPAL_MODE !== "live");

  return new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: ALL_TOOLS_ENABLED,
      context: {
        sandbox: isSandbox,
        mode: isSandbox ? "sandbox" : "live",
      },
    },
  });
}

/**
 * Inspection utility to verify and catalog all available tools in the toolkit
 */
export function getRegisteredToolNames(toolkit?: PayPalAgentToolkit): string[] {
  const instance = toolkit || initializePayPalAgentToolkit();
  const tools = instance.getTools();
  return Object.keys(tools);
}

/**
 * SME Buyer Agent Liquidity & Accounts Receivable Checker
 * 
 * Chains official toolkit tools (list_invoices -> send_invoice_reminder)
 * to verify incoming cash flow and send automated invoice reminders to accelerate
 * working capital recovery before committing funds to a Clan wholesale batch.
 */
export async function runAccountsReceivableLiquidityCheck(params: {
  toolkit?: PayPalAgentToolkit;
  autoRemindOverdue?: boolean;
}): Promise<{
  status: "LIQUID" | "RESTRICTED" | "NO_CREDENTIALS";
  totalUnpaidInvoices: number;
  remindersDispatched: number;
  details: string;
}> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.includes("your_sandbox")) {
    return {
      status: "NO_CREDENTIALS",
      totalUnpaidInvoices: 0,
      remindersDispatched: 0,
      details: "Live credentials not yet configured in .env. Skipping live invoice liquidity query.",
    };
  }

  const toolkit = params.toolkit || initializePayPalAgentToolkit({ clientId, clientSecret });
  const tools = toolkit.getTools();

  // In the toolkit, tools are exposed as Vercel AI SDK compatible tool definitions
  const listInvoicesTool = tools["list_invoices"];
  const sendReminderTool = tools["send_invoice_reminder"];

  if (!listInvoicesTool) {
    throw new Error("Missing 'list_invoices' tool in PayPalAgentToolkit");
  }

  try {
    // 1. Query unpaid/sent invoices
    const listResult = await (listInvoicesTool as any).execute({
      page: 1,
      page_size: 10,
      total_required: true,
    });

    const invoices = (listResult && listResult.items) || [];
    let remindersSent = 0;

    // 2. Automated reminder chain for overdue receivables
    if (params.autoRemindOverdue && sendReminderTool && invoices.length > 0) {
      for (const inv of invoices) {
        if (inv.status === "SENT" || inv.status === "UNPAID") {
          try {
            await (sendReminderTool as any).execute({
              invoice_id: inv.id,
              subject: "SyndicatePay Automated Reminder: Outstanding Invoice",
              note: "Payment reminder sent on behalf of SME Clan Liquidity Management.",
            });
            remindersSent++;
          } catch {
            // Ignore single reminder failure in sweep
          }
        }
      }
    }

    return {
      status: invoices.length > 0 ? "RESTRICTED" : "LIQUID",
      totalUnpaidInvoices: invoices.length,
      remindersDispatched: remindersSent,
      details: `Discovered ${invoices.length} outstanding invoice(s). Dispatched ${remindersSent} payment reminder(s).`,
    };
  } catch (error: any) {
    return {
      status: "RESTRICTED",
      totalUnpaidInvoices: 0,
      remindersDispatched: 0,
      details: `Liquidity check encounter: ${error.message || String(error)}`,
    };
  }
}
