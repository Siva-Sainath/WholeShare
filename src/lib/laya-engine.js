import { Laya } from "@receptron/laya";

let layaInstance = null;
let initPromise = null;

export async function getLayaEngine(options = {}) {
  if (layaInstance) {
    return layaInstance;
  }

  if (initPromise) {
    return await initPromise;
  }

  initPromise = (async () => {
    try {
      const instance = await Laya.load({
        executionProviders: options.executionProviders || ["cpu"]
      });
      layaInstance = instance;
      return layaInstance;
    } catch (err) {
      initPromise = null;
      throw new Error(`Failed to initialize Laya ONNX engine: ${err.message}`);
    }
  })();

  return await initPromise;
}

export async function evaluateDecision(state, questions, options = {}) {
  const laya = await getLayaEngine(options);
  return await laya.systemOne(state, questions);
}

export async function routeIntent(userPrompt) {
  const questions = {
    intent: {
      type: "choice",
      instructions: "Classify the B2B procurement user intent into primary operational bucket",
      criteria: {
        catalog_query: "browsing products, looking up catalog tiers or checking commodity pricing",
        invoice_ingest: "uploading, extracting, importing or parsing invoices, receipts or purchase orders",
        coalition_negotiation: "forming, joining or negotiating wholesale bulk buying coalitions",
        dispute_mediation: "filing, reviewing or checking escrow dispute mediation claims",
        escrow_authorize: "authorizing PayPal escrow holds, pledges or locking funds"
      }
    },
    requires_llm: {
      type: "noul",
      instructions: "Does this request require generative prose drafting, novel bargaining tactics or open-ended reasoning?"
    }
  };

  const res = await evaluateDecision(userPrompt, questions);
  const intentAnswer = res.answers?.intent;
  const requiresLlmAnswer = res.answers?.requires_llm;

  return {
    intent: intentAnswer?.choice || "coalition_negotiation",
    confidence: intentAnswer?.confidence ?? 0.8,
    requiresLlm: (requiresLlmAnswer?.noul ?? 0.5) > 0.45,
    probabilities: intentAnswer?.probabilities || {}
  };
}

export async function gateToolRisk(toolName, toolArgs = {}) {
  const state = JSON.stringify({ tool: toolName, args: toolArgs });
  const questions = {
    mutating_action: {
      type: "noul",
      instructions: "Does this pending action mutate platform ledger state, lock funds or execute financial movements?"
    },
    high_value_transaction: {
      type: "noul",
      instructions: "Is this transaction high value exceeding standard automated thresholds?"
    }
  };

  const res = await evaluateDecision(state, questions, { failClosed: true });
  const mutating = (res.answers?.mutating_action?.noul ?? 1.0) > 0.5;
  const highValue = (res.answers?.high_value_transaction?.noul ?? 1.0) > 0.5;

  return {
    toolName,
    mutating,
    highValue,
    requiresStepUp: highValue
  };
}

export async function verifyDealProposal(proposal) {
  const state = JSON.stringify(proposal);
  const questions = {
    fair_distribution: {
      type: "noul",
      instructions: "Is the volume allocation and price savings distributed fairly across coalition members?"
    },
    invariants_consistent: {
      type: "noul",
      instructions: "Are the unit calculations, prices, and member sums mathematically consistent?"
    }
  };

  const res = await evaluateDecision(state, questions, { failClosed: true });

  const fair = (res.answers?.fair_distribution?.noul ?? 1.0) >= 0.5;
  const consistent = (res.answers?.invariants_consistent?.noul ?? 1.0) >= 0.5;

  return {
    fairDistribution: fair,
    invariantsConsistent: consistent,
    verified: fair && consistent,
    fallback: false
  };
}

export async function closeLayaEngine() {
  if (layaInstance) {
    try {
      await layaInstance.close();
    } catch {}
    layaInstance = null;
    initPromise = null;
  }
}
