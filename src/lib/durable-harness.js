import { WHOLESHARE_TOOL_DECLARATIONS, executeTool, parseToolCallsFromContent } from "./tool-registry.js";
import { actionDispatcher } from "./web-actions.js";
import {
  createAgentSession,
  updateAgentSessionStatus,
  saveAgentStep,
  loadSessionTrajectory
} from "./db.js";
import { interceptToolExecution } from "./interceptor.js";
import { generateInstinctProfileHeader } from "./instinct-profile.js";
import { generateFeatureMapPromptContext } from "./feature-map.js";
import { dreamingEngine } from "./dreaming-engine.js";
import {
  routeIntent,
  gateToolRisk,
  verifyDealProposal
} from "./laya-engine.js";
import { modelClient } from "./model-client.js";
import { opsdEngine } from "./opsd-engine.js";
import { SERVING_TARGET } from "./serving-target.js";

const MAX_TURNS = 8;
const MAX_REFLEXIVE_ATTEMPTS = 2;
const AGENT_TIMEOUT_MS = 90000;
const STEP_UP_THRESHOLD_CENTS = 100000;

export class WholeshareDurableHarness {
  constructor(model = null) {
    this.model = model || ((modelClient.preferLocal || !modelClient.openRouterKey)
      ? SERVING_TARGET.mlxId
      : "nvidia/nemotron-3.5-super-vl:free");
  }

  buildInitialMessages(prompt, buyerId = "sme_austin_01") {
    const profileHeader = generateInstinctProfileHeader(buyerId);
    const featureMapContext = generateFeatureMapPromptContext();
    return [
      {
        role: "system",
        content: `${profileHeader}

${featureMapContext}

You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
Follow this operational protocol for sourcing, verification, and escrow:
1. REAL-TIME FACTS, SUPPLIERS, & REGULATORY RESEARCH: When real-time or external facts are needed from the web (supplier pricing, regulatory status, corporate KYC, forex spot rates, sanctions screening, or technical specs), use Kernel cloud browsers:
   - For live facts, forex rates, corporate registry checks, or compliance verification: use kernel_research_web_fact with intent, targetUrl, and query.
   - For distributor volume pricing tiers: use discover_wholesale_supplier_tiers with sku and vendorUrl.
   - For custom Playwright DOM automation: use kernel_execute_browser_task with targetUrl and script.
2. INTERNAL CATALOG: When querying Wholeshare's own existing catalog without an external supplier URL, use discover_wholesale_catalog with sku.
3. ZERO SIMULATION MANDATE: Never estimate, fabricate, or hallucinate pricing brackets, forex rates, or KYC clearances if web extraction fails or data is missing. Explain the failure honestly and request authentic documents or URLs.
4. FINANCIAL CONSERVATION: All financial operations must use exact integer cents and intent: "AUTHORIZE". Direct CAPTURE is prohibited.
5. COMPLETION: When all requested operations have been performed (such as locking escrow), stop calling tools and return a concise final summary message.
6. REFLEXIVE RECOVERY: If a tool execution returns an invariant violation error, reflexively adjust your arguments to satisfy the invariant and retry.`
      },
      {
        role: "user",
        content: prompt
      }
    ];
  }


  async startSession({ prompt, sessionId = `sess_${Date.now()}`, metadata = {}, maxTurns = 3 }) {
    const sessionStartTime = Date.now();
    await createAgentSession({
      id: sessionId,
      model: this.model,
      prompt,
      status: "RUNNING",
      metadata
    });

    actionDispatcher.broadcast("AGENT_SESSION_STARTED", {
      sessionId,
      prompt,
      model: this.model,
      timestamp: new Date().toISOString()
    });

    const layaStart = Date.now();
    const layaDecision = await routeIntent(prompt);
    const layaDurationMs = Date.now() - layaStart;

    actionDispatcher.broadcast("AGENT_LAYA_INTENT_ROUTED", {
      sessionId,
      prompt,
      intent: layaDecision.intent,
      confidence: layaDecision.confidence,
      requiresLlm: layaDecision.requiresLlm,
      durationMs: layaDurationMs,
      timestamp: new Date().toISOString()
    });

    const skuMatch = prompt.match(/(?:for|sku|product)?\s*([a-z0-9-]+flour[a-z0-9-]*)/i);
    if (!layaDecision.requiresLlm && layaDecision.intent === "catalog_query" && skuMatch && skuMatch[1]) {
      const sku = skuMatch[1];
      const result = await executeTool("discover_wholesale_catalog", { sku });
      const totalDurationMs = Date.now() - sessionStartTime;

      await saveAgentStep({
        sessionId,
        stepIndex: 1,
        thought: `Laya System 1 classified intent as catalog_query with ${(layaDecision.confidence * 100).toFixed(1)}% confidence. Resolved deterministically in ${layaDurationMs}ms without LLM generation.`,
        toolName: "discover_wholesale_catalog",
        toolArgs: { sku },
        toolResult: result,
        interceptorStatus: "PASSED",
        durationMs: layaDurationMs
      });

      const finalMessage = `Catalog pricing resolved directly by Laya System 1 in ${layaDurationMs}ms.`;
      await updateAgentSessionStatus(sessionId, "COMPLETED", {
        finalMessage,
        totalDurationMs
      });

      return {
        sessionId,
        success: true,
        status: "COMPLETED",
        routedBy: "LAYA_SYSTEM_ONE",
        totalDurationMs,
        finalMessage,
        steps: [
          {
            stepIndex: 1,
            toolName: "discover_wholesale_catalog",
            toolArgs: { sku },
            toolResult: result,
            durationMs: layaDurationMs
          }
        ]
      };
    }

    const messages = this.buildInitialMessages(prompt);
    return await this.runExecutionLoop({
      sessionId,
      messages,
      startStepIndex: 1,
      sessionStartTime,
      maxTurns
    });
  }

  async resumeSession(sessionId, options = {}) {
    const trajectory = await loadSessionTrajectory(sessionId);
    if (!trajectory) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if (trajectory.status === "COMPLETED") {
      return trajectory;
    }

    const sessionStartTime = Date.now();
    await updateAgentSessionStatus(sessionId, "RUNNING");

    actionDispatcher.broadcast("AGENT_SESSION_RESUMED", {
      sessionId,
      status: "RUNNING",
      timestamp: new Date().toISOString()
    });

    const messages = this.buildInitialMessages(trajectory.prompt);
    const existingSteps = trajectory.steps || [];

    for (const s of existingSteps) {
      if (s.toolName) {
        messages.push({
          role: "assistant",
          content: s.thought || "",
          tool_calls: [
            {
              id: `call_${s.stepIndex}`,
              type: "function",
              function: {
                name: s.toolName,
                arguments: JSON.stringify(s.toolArgs || {})
              }
            }
          ]
        });

        messages.push({
          role: "tool",
          content: JSON.stringify(s.toolResult || {})
        });
      }
    }

    return await this.runExecutionLoop({
      sessionId,
      messages,
      startStepIndex: existingSteps.length + 1,
      sessionStartTime,
      maxTurns: options?.maxTurns || 3
    });
  }

  async resumeWithStepUpApproval(sessionId, approvalToken, options = {}) {
    const trajectory = await loadSessionTrajectory(sessionId);
    if (!trajectory) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if (trajectory.status !== "AWAITING_STEP_UP") {
      throw new Error(`Session ${sessionId} is not awaiting step-up verification.`);
    }

    await updateAgentSessionStatus(sessionId, "RUNNING", { approvalToken });

    actionDispatcher.broadcast("AGENT_STEP_UP_APPROVED", {
      sessionId,
      approvalToken,
      timestamp: new Date().toISOString()
    });

    const messages = this.buildInitialMessages(trajectory.prompt);
    for (const s of trajectory.steps || []) {
      if (s.toolName) {
        messages.push({
          role: "assistant",
          content: s.thought || "",
          tool_calls: [
            {
              id: `call_${s.stepIndex}`,
              type: "function",
              function: {
                name: s.toolName,
                arguments: JSON.stringify(s.toolArgs || {})
              }
            }
          ]
        });
        messages.push({
          role: "tool",
          content: JSON.stringify(s.toolResult || {})
        });
      }
    }

    messages.push({
      role: "user",
      content: `Human KYC step-up approval verified with token ${approvalToken}. Proceed with authorized escrow locking.`
    });

    return await this.runExecutionLoop({
      sessionId,
      messages,
      startStepIndex: (trajectory.steps?.length || 0) + 1,
      sessionStartTime: Date.now(),
      maxTurns: options?.maxTurns || 3
    });
  }

  async runExecutionLoop({ sessionId, messages, startStepIndex, sessionStartTime, maxTurns = 3 }) {
    let turn = startStepIndex;
    let finalMessage = "";
    let reflexiveRetries = 0;

    while (turn <= maxTurns) {
      const stepStartTime = Date.now();

      try {
        const response = await this.callModelWithTools(messages);
        const durationMs = Date.now() - stepStartTime;

        const assistantMessage = response.message || {};
        const thinking = assistantMessage.thinking || "";
        const content = assistantMessage.content || "";
        let toolCalls = assistantMessage.tool_calls || [];
        if (toolCalls.length === 0 && content) {
          toolCalls = parseToolCallsFromContent(content);
        }

        if (thinking) {
          actionDispatcher.broadcast("AGENT_THOUGHT", {
            sessionId,
            stepIndex: turn,
            thought: thinking.substring(0, 300)
          });
        }

        if (toolCalls.length === 0) {
          finalMessage = content || "Operation completed successfully.";
          await saveAgentStep({
            sessionId,
            stepIndex: turn,
            thought: thinking,
            interceptorStatus: "PASSED",
            durationMs
          });

          await updateAgentSessionStatus(sessionId, "COMPLETED", {
            finalMessage,
            totalDurationMs: Date.now() - sessionStartTime
          });

          break;
        }

        for (const call of toolCalls) {
          const toolName = call.function?.name || call.name;
          let toolArgs = {};
          try {
            toolArgs = typeof call.function?.arguments === "string"
              ? JSON.parse(call.function.arguments)
              : (call.function?.arguments || call.arguments || {});
          } catch {
            toolArgs = {};
          }

          actionDispatcher.broadcast("AGENT_TOOL_CALL", {
            sessionId,
            stepIndex: turn,
            toolName,
            args: toolArgs
          });

          let layaRisk = null;
          try {
            layaRisk = await gateToolRisk(toolName, toolArgs);
          } catch {
            layaRisk = { mutating: true, highValue: true, requiresStepUp: true };
          }

          actionDispatcher.broadcast("AGENT_LAYA_TOOL_GATED", {
            sessionId,
            stepIndex: turn,
            toolName,
            mutating: layaRisk.mutating,
            highValue: layaRisk.highValue,
            requiresStepUp: layaRisk.requiresStepUp
          });

          if (toolName === "run_coalition_negotiation" || toolName === "join_syndicate") {
            const proposalCheck = await verifyDealProposal(toolArgs);
            if (!proposalCheck.verified) {
              actionDispatcher.broadcast("AGENT_LAYA_DEAL_REJECTED", {
                sessionId,
                stepIndex: turn,
                toolName,
                reason: "Laya critic detected inconsistent allocation invariant."
              });
            }
          }

          const interception = interceptToolExecution(toolName, toolArgs);

          if (!interception.valid) {
            const verifierError = interception.violations.join("; ");
            try {
              const teacherCorrection = await opsdEngine.rationalizeCorrection({
                prompt: messages[1]?.content || "",
                studentThought: thinking,
                studentToolCall: { name: toolName, arguments: toolArgs },
                verifierError
              });

              opsdEngine.commitDistillationTrace({
                sessionId,
                prompt: messages[1]?.content || "",
                studentThought: thinking,
                studentToolCall: { name: toolName, arguments: toolArgs },
                verifierError,
                teacherThought: teacherCorrection.teacherThought,
                correctedToolCall: teacherCorrection.correctedToolCall
              });
            } catch {
              // OPSD recording failure should not crash execution
            }

            actionDispatcher.broadcast("AGENT_REFLEXIVE_RETRY", {
              sessionId,
              stepIndex: turn,
              toolName,
              violations: interception.violations
            });

            await saveAgentStep({
              sessionId,
              stepIndex: turn,
              thought: thinking,
              toolName,
              toolArgs,
              toolResult: { error: "INTERCEPTOR_VIOLATION", violations: interception.violations },
              interceptorStatus: "REJECTED",
              violations: interception.violations,
              durationMs: Date.now() - stepStartTime
            });

            messages.push({
              role: "assistant",
              content: content || "",
              tool_calls: [call]
            });

            messages.push({
              role: "tool",
              content: JSON.stringify({
                status: "REJECTED_BY_INTERCEPTOR",
                violations: interception.violations,
                instruction: "Fix the invariant violation and retry with valid arguments."
              })
            });

            reflexiveRetries++;
            if (reflexiveRetries > MAX_REFLEXIVE_ATTEMPTS) {
              throw new Error(`Max reflexive attempts exceeded on tool ${toolName}.`);
            }

            turn++;
            continue;
          }

          const targetAmount = toolArgs.amountCents || toolArgs.maxAutoAuthorizeUsd * 100 || 0;
          if (targetAmount > STEP_UP_THRESHOLD_CENTS && toolArgs.stepUpApproved !== true && toolName === "authorize_paypal_escrow") {
            const invoice = await executeTool("generate_step_up_invoice", {
              buyerId: toolArgs.coalitionId || "coalition_flour_01",
              amountCents: targetAmount,
              memo: "Step-up KYC verification required for escrow authorization exceeding $1,000 ceiling."
            });

            await saveAgentStep({
              sessionId,
              stepIndex: turn,
              thought: thinking,
              toolName,
              toolArgs,
              toolResult: { status: "AWAITING_STEP_UP", invoice },
              interceptorStatus: "PASSED",
              durationMs: Date.now() - stepStartTime
            });

            await updateAgentSessionStatus(sessionId, "AWAITING_STEP_UP", {
              stepUpToken: invoice.invoiceId,
              finalMessage: "Session suspended awaiting KYC step-up authentication."
            });

            actionDispatcher.broadcast("AGENT_SUSPENDED_STEP_UP", {
              sessionId,
              stepIndex: turn,
              invoiceId: invoice.invoiceId,
              qrCodeUrl: invoice.qrCodeUrl
            });

            return {
              sessionId,
              status: "AWAITING_STEP_UP",
              invoice,
              suspendedAtStep: turn
            };
          }

          const toolResult = await executeTool(toolName, toolArgs);

          if (toolResult && toolResult.status === "ERROR") {
            const verifierError = toolResult.error || "Tool execution failed policy invariant.";
            try {
              const teacherCorrection = await opsdEngine.rationalizeCorrection({
                prompt: messages[1]?.content || "",
                studentThought: thinking,
                studentToolCall: { name: toolName, arguments: toolArgs },
                verifierError
              });

              opsdEngine.commitDistillationTrace({
                sessionId,
                prompt: messages[1]?.content || "",
                studentThought: thinking,
                studentToolCall: { name: toolName, arguments: toolArgs },
                verifierError,
                teacherThought: teacherCorrection.teacherThought,
                correctedToolCall: teacherCorrection.correctedToolCall
              });
            } catch {
              // Non-blocking trace capture
            }
          }

          actionDispatcher.broadcast("AGENT_TOOL_RESULT", {
            sessionId,
            stepIndex: turn,
            toolName,
            result: toolResult
          });

          await saveAgentStep({
            sessionId,
            stepIndex: turn,
            thought: thinking,
            toolName,
            toolArgs,
            toolResult,
            interceptorStatus: "PASSED",
            durationMs: Date.now() - stepStartTime
          });

          messages.push({
            role: "assistant",
            content: content || "",
            tool_calls: [call]
          });

          messages.push({
            role: "tool",
            tool_call_id: call.id || `call_${Date.now()}`,
            content: JSON.stringify(toolResult)
          });
        }
      } catch (err) {
        actionDispatcher.broadcast("AGENT_FAILURE", {
          sessionId,
          error: `REAL_LLM_FAILURE: ${err.message}`,
          timestamp: new Date().toISOString()
        });
        await updateAgentSessionStatus(sessionId, "FAILED", {
          finalMessage: `Real model failure: ${err.message}`,
          totalDurationMs: Date.now() - sessionStartTime
        });
        throw new Error(`Durable agent execution failed at model level: ${err.message}`);
      }

      turn++;
    }

    const totalDurationMs = Date.now() - sessionStartTime;
    await updateAgentSessionStatus(sessionId, "COMPLETED", {
      finalMessage: finalMessage || "Session completed successfully.",
      totalDurationMs
    });
    const finalTrajectory = await loadSessionTrajectory(sessionId);

    actionDispatcher.broadcast("AGENT_SESSION_COMPLETED", {
      sessionId,
      totalDurationMs,
      stepsCount: finalTrajectory?.steps?.length || 0,
      finalMessage
    });

    if (finalTrajectory) {
      dreamingEngine.reconcileSession(finalTrajectory).catch(() => {});
    }

    return {
      sessionId,
      success: true,
      status: "COMPLETED",
      model: this.model,
      totalDurationMs,
      trajectory: finalTrajectory,
      steps: finalTrajectory?.steps || [],
      finalMessage
    };

  }

  async callModelWithTools(messages) {
    const res = await modelClient.callChat({
      messages,
      tools: WHOLESHARE_TOOL_DECLARATIONS
    });
    return {
      message: res.message
    };
  }

}

export const durableHarness = new WholeshareDurableHarness();
