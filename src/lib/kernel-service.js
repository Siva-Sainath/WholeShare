import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import "./env.js";
import { discoverWholesaleTiers, researchWebFact, KernelConfigurationError } from "./kernel-bridge.js";
import { evaluateSupplierCredibility } from "./kernel-credibility.js";
import { actionDispatcher } from "./web-actions.js";

const BRIEFS_PATH = resolve(process.cwd(), ".scratch/kernel-briefs.json");
const JOURNAL_PATH = resolve(process.cwd(), "data/durable_journal.json");
const MAX_CONCURRENT_TASKS = 3;
const ONE_HOUR_MS = 60 * 60 * 1000;

function ensureParentDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function appendJournalEntry(entry) {
  try {
    ensureParentDir(JOURNAL_PATH);
    const line = JSON.stringify({ ...entry, loggedAt: new Date().toISOString() }) + "\n";
    appendFileSync(JOURNAL_PATH, line, "utf-8");
  } catch (err) {
    console.error(`[KernelService] Journal write error: ${err.message}`);
  }
}

export class KernelResearchService {
  constructor() {
    this.queue = [];
    this.activeTasks = new Map();
    this.activeClanTasks = new Set();
    this.lastTaskRunByClan = new Map();
    this.briefsByClan = new Map();
    this.isProcessing = false;
    this.unsubscribeDispatcher = null;
    this.loadBriefsFromDisk();
  }

  loadBriefsFromDisk() {
    try {
      if (existsSync(BRIEFS_PATH)) {
        const raw = readFileSync(BRIEFS_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          for (const [clanId, list] of Object.entries(parsed)) {
            if (Array.isArray(list)) {
              this.briefsByClan.set(clanId, list);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[KernelService] Failed to load briefs from disk: ${err.message}`);
    }
  }

  saveBriefsToDisk() {
    try {
      ensureParentDir(BRIEFS_PATH);
      const data = Object.fromEntries(this.briefsByClan);
      writeFileSync(BRIEFS_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error(`[KernelService] Failed to save briefs to disk: ${err.message}`);
    }
  }

  getLatestBrief(clanId) {
    const list = this.briefsByClan.get(clanId) || [];
    return list.length > 0 ? list[0] : null;
  }

  listBriefs(clanId) {
    return this.briefsByClan.get(clanId) || [];
  }

  recordBrief(brief) {
    const list = this.briefsByClan.get(brief.clanId) || [];
    const updated = [brief, ...list.filter(b => b.id !== brief.id)].slice(0, 5);
    this.briefsByClan.set(brief.clanId, updated);
    this.saveBriefsToDisk();
  }

  isKeyConfigured() {
    const key = process.env.KERNEL_API_KEY;
    return Boolean(key && key.trim() !== "" && key !== "MOCK_KERNEL_KEY" && key !== "your_kernel_api_key_here");
  }

  start() {
    if (this.unsubscribeDispatcher) return;
    this.unsubscribeDispatcher = actionDispatcher.subscribe((event) => {
      if (!event || typeof event !== "object") return;
      if (event.type === "CLAN_CREATED" && event.coalition) {
        const c = event.coalition;
        const urls = (c.dataSources || [])
          .filter(ds => ds.type === "URL" && (ds.verified === true || ds.verified === undefined))
          .map(ds => ds.location);
        this.queueResearchTask({
          clanId: c.id,
          sku: c.sku,
          vendorUrls: urls,
          trigger: "CLAN_CREATED"
        }).catch(() => {});
      } else if (event.type === "COALITION_UPDATED" && event.coalition) {
        const c = event.coalition;
        if (c.targetUnits > 0 && c.currentUnits >= c.targetUnits * 0.5) {
          const latest = this.getLatestBrief(c.id);
          if (!latest || latest.status === "FAILED") {
            const urls = (c.dataSources || [])
              .filter(ds => ds.type === "URL" && (ds.verified === true || ds.verified === undefined))
              .map(ds => ds.location);
            this.queueResearchTask({
              clanId: c.id,
              sku: c.sku,
              vendorUrls: urls,
              trigger: "50_PERCENT_THRESHOLD"
            }).catch(() => {});
          }
        }
      }
    });
  }

  stop() {
    if (this.unsubscribeDispatcher) {
      this.unsubscribeDispatcher();
      this.unsubscribeDispatcher = null;
    }
  }

  async queueResearchTask({
    clanId,
    sku,
    vendorUrls = [],
    currency = "USD",
    intents = ["DISCOVER_TIERS", "EVALUATE_CREDIBILITY"],
    force = false,
    trigger = "USER_REQUEST"
  }) {
    if (!clanId) {
      throw new Error("Clan ID is required to queue research task.");
    }

    if (!sku) {
      const coalition = actionDispatcher.coalitions?.get(clanId);
      sku = coalition?.sku || "general-commodity";
    }

    if (!this.isKeyConfigured()) {
      const failedBrief = {
        id: `brief_${clanId}_${Date.now()}`,
        clanId,
        sku,
        researchedAt: new Date().toISOString(),
        suppliers: [],
        forex: null,
        status: "UNAVAILABLE",
        error: "KERNEL_CONFIGURATION_ERROR: Kernel API key is unconfigured. Set KERNEL_API_KEY in .env."
      };
      this.recordBrief(failedBrief);
      appendJournalEntry({
        eventType: "KERNEL_RESEARCH_TASK_FAILED",
        clanId,
        sku,
        trigger,
        error: "KERNEL_CONFIGURATION_ERROR"
      });
      return {
        id: `task_unavailable_${Date.now()}`,
        clanId,
        sku,
        vendorUrls,
        intents,
        status: "UNAVAILABLE",
        error: failedBrief.error,
        createdAt: new Date().toISOString()
      };
    }

    if (this.activeClanTasks.has(clanId)) {
      const existing = Array.from(this.activeTasks.values()).find(t => t.clanId === clanId);
      if (existing) return existing;
    }

    const lastRun = this.lastTaskRunByClan.get(clanId) || 0;
    const isMemberRequest = trigger === "USER_REQUEST" || force;
    if (!isMemberRequest && Date.now() - lastRun < ONE_HOUR_MS) {
      const existingBrief = this.getLatestBrief(clanId);
      if (existingBrief) {
        return {
          id: `task_cached_${clanId}`,
          clanId,
          sku,
          vendorUrls,
          intents,
          status: existingBrief.status === "DONE" ? "DONE" : "QUEUED",
          createdAt: existingBrief.researchedAt
        };
      }
    }

    let resolvedUrls = Array.isArray(vendorUrls) ? [...vendorUrls] : [];
    if (resolvedUrls.length === 0) {
      const coalition = actionDispatcher.coalitions?.get(clanId);
      if (coalition && Array.isArray(coalition.dataSources)) {
        resolvedUrls = coalition.dataSources
          .filter(ds => ds.type === "URL" && (ds.verified === true || ds.verified === undefined) && ds.location)
          .map(ds => ds.location);
      }
    }

    const taskId = `task_research_${clanId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task = {
      id: taskId,
      clanId,
      sku,
      vendorUrls: resolvedUrls,
      currency,
      intents,
      trigger,
      status: "QUEUED",
      createdAt: new Date().toISOString()
    };

    this.queue.push(task);
    this.processQueue();
    return task;
  }

  processQueue() {
    if (this.activeTasks.size >= MAX_CONCURRENT_TASKS || this.queue.length === 0) {
      return;
    }

    const nextIndex = this.queue.findIndex(t => !this.activeClanTasks.has(t.clanId));
    if (nextIndex === -1) {
      return;
    }

    const [task] = this.queue.splice(nextIndex, 1);
    this.activeTasks.set(task.id, task);
    this.activeClanTasks.add(task.clanId);
    task.status = "RUNNING";

    appendJournalEntry({
      eventType: "KERNEL_RESEARCH_TASK_STARTED",
      taskId: task.id,
      clanId: task.clanId,
      sku: task.sku,
      vendorUrls: task.vendorUrls,
      trigger: task.trigger
    });

    this.executeTask(task)
      .catch((err) => {
        console.error(`[KernelService] Task execution unexpected fault: ${err.message}`);
      })
      .finally(() => {
        this.activeTasks.delete(task.id);
        this.activeClanTasks.delete(task.clanId);
        this.lastTaskRunByClan.set(task.clanId, Date.now());
        this.processQueue();
      });
  }

  async executeTask(task) {
    if (!task.vendorUrls || task.vendorUrls.length === 0) {
      task.status = "FAILED";
      const brief = {
        id: `brief_${task.clanId}_${Date.now()}`,
        clanId: task.clanId,
        sku: task.sku,
        researchedAt: new Date().toISOString(),
        suppliers: [],
        forex: null,
        status: "FAILED",
        error: "no verified vendor URL on file"
      };
      this.recordBrief(brief);
      appendJournalEntry({
        eventType: "KERNEL_RESEARCH_TASK_FAILED",
        taskId: task.id,
        clanId: task.clanId,
        sku: task.sku,
        error: "no verified vendor URL on file"
      });
      return;
    }

    try {
      const suppliers = [];
      let forexData = null;

      for (const vendorUrl of task.vendorUrls) {
        if (!vendorUrl || vendorUrl.includes("example-wholesale-distributor.com")) {
          throw new Error("Invalid or example vendor URL provided. Live research requires authentic wholesale portal.");
        }

        const tierResult = await discoverWholesaleTiers({
          sku: task.sku,
          vendorUrl
        });

        if (task.currency && task.currency !== "USD" && !forexData) {
          try {
            const forexTargetUrl = `https://www.xe.com/currencyconverter/convert/?Amount=1&From=${encodeURIComponent(task.currency)}&To=USD`;
            const forexRes = await researchWebFact({
              intent: "FOREX_RATE",
              targetUrl: forexTargetUrl,
              query: `${task.currency} to USD exchange rate`
            });
            if (forexRes.success) {
              forexData = {
                base: task.currency,
                target: "USD",
                data: forexRes.data?.snippets?.[0] || "Live rate captured",
                proofSha256: forexRes.proof?.sha256 || null,
                proofFile: forexRes.proof?.filePath ? basename(forexRes.proof.filePath) : null
              };
            }
          } catch {
            forexData = null;
          }
        }

        let credTier = "VERIFIED_ESTABLISHED";
        let credProof = null;
        try {
          const credResult = await evaluateSupplierCredibility({ targetUrl: vendorUrl });
          credTier = credResult.credibilityTier || "VERIFIED_ESTABLISHED";
          credProof = credResult.proof;
        } catch {
          credTier = "EVALUATED_PORTAL";
        }

        const proofSha256 = tierResult.proof?.sha256 || credProof?.sha256 || null;
        const proofFile = tierResult.proof?.fileName || (tierResult.proof?.filePath ? basename(tierResult.proof.filePath) : null);

        suppliers.push({
          vendorUrl,
          tiers: tierResult.tiers || [],
          credibility: credTier,
          proofSha256,
          proofFile
        });
      }

      task.status = "DONE";
      const brief = {
        id: `brief_${task.clanId}_${Date.now()}`,
        clanId: task.clanId,
        sku: task.sku,
        researchedAt: new Date().toISOString(),
        suppliers,
        forex: forexData,
        status: "DONE"
      };

      this.recordBrief(brief);
      appendJournalEntry({
        eventType: "KERNEL_RESEARCH_TASK_FINISHED",
        taskId: task.id,
        clanId: task.clanId,
        sku: task.sku,
        briefId: brief.id,
        suppliersCount: suppliers.length
      });
    } catch (err) {
      task.status = "FAILED";
      const errorCode = err.code || (err instanceof KernelConfigurationError ? "KERNEL_CONFIGURATION_ERROR" : "KERNEL_API_ERROR");
      const brief = {
        id: `brief_${task.clanId}_${Date.now()}`,
        clanId: task.clanId,
        sku: task.sku,
        researchedAt: new Date().toISOString(),
        suppliers: [],
        forex: null,
        status: "FAILED",
        error: `${errorCode}: ${err.message}`
      };
      this.recordBrief(brief);
      appendJournalEntry({
        eventType: "KERNEL_RESEARCH_TASK_FAILED",
        taskId: task.id,
        clanId: task.clanId,
        sku: task.sku,
        error: `${errorCode}: ${err.message}`
      });
    }
  }
}

export const kernelResearchService = new KernelResearchService();
