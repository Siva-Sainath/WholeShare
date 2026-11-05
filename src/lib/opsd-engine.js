/**
 * Dual-Role On-Policy Self-Distillation (OPSD) Engine
 * 
 * Implements the dual-role teacher-student on-policy self-distillation paradigm
 * (OPSD / SDPO / SDFT, Jan 2026):
 * 1. Student role generates rollouts based on public buyer request.
 * 2. Deterministic policy sandwich (policy.js / interceptor.js) acts as verifier.
 * 3. On failure, Teacher role conditions on rollout + rich verifier error log.
 * 4. Teacher rationalizes the fix in <think> tags without privileged information leakage.
 * 5. Verified correction is stored into data/lake/ for periodic LoRA distillation.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { modelClient } from "./model-client.js";
import { SERVING_TARGET } from "./serving-target.js";
import { verifyToolBoundary, verifyFinancialPolicy, verifyStateTransition } from "./policy.ts";
import { actionDispatcher } from "./web-actions.js";
import { WHOLESHARE_TOOL_DECLARATIONS } from "./tool-registry.js";

const TRACES_DIR = join(process.cwd(), "data", "lake", "opsd_traces");
const SYSTEM2_GOLD_FILE = join(process.cwd(), "data", "lake", "system2_qwen", "system2_reasoning_rollouts.jsonl");
const OPSD_TRACES_FILE = join(TRACES_DIR, "opsd_teacher_distillation_traces.jsonl");

// Ensure target directories exist
if (!existsSync(TRACES_DIR)) {
  mkdirSync(TRACES_DIR, { recursive: true });
}

export class OpsdEngine {
  constructor(model = null) {
    this.model = model || ((modelClient.preferLocal || !modelClient.openRouterKey)
      ? SERVING_TARGET.mlxId
      : "nvidia/nemotron-3.5-super-vl:free");
  }

  /**
   * Constructs the Teacher hindsight prompt with strict privileged information leakage mitigation.
   */
  buildTeacherHindsightPrompt({ prompt, studentThought, studentToolCall, verifierError, context = {} }) {
    return [
      {
        role: "system",
        content: `You are the Hindsight Teacher model (pi_theta | x, z, e) in Wholeshare's On-Policy Self-Distillation (OPSD) framework.
Your role is to analyze a failed agent rollout, rationalize the root cause of the policy violation inside <think> tags, and generate the corrected, valid tool call.

CRITICAL PRIVILEGED INFORMATION LEAKAGE INVARIANTS:
1. Do NOT reference secret variables, internal fraud risk scores, or private supplier reserve margins in your explanation.
2. Formulate your reasoning exclusively using the public buyer mandate, catalog pricing, and the deterministic verifier error.
3. Every financial figure must be an exact integer number of cents.
4. Output your rationalization inside <think>...</think> tags, followed strictly by the corrected tool call format:
<tool_call>
{"name": "<tool_name>", "arguments": { ... }}
</tool_call>`
      },
      {
        role: "user",
        content: `Public Buyer Task: "${prompt}"

Prior Student Rollout:
Thought: "${studentThought || "No explicit thought provided."}"
Tool Call: ${JSON.stringify(studentToolCall || {})}

Deterministic Verifier Error:
"${verifierError}"

Analyze why the student proposal failed the policy sandwich. In <think> tags, rationalize the exact step needed to satisfy the financial invariants (e.g. issuing a step-up invoice if spend exceeds $1,000, adjusting integer cents, or resolving state transitions). Then output the corrected tool call.`
      }
    ];
  }

  /**
   * Runs the Teacher role to generate a hindsight rationalization and corrected tool call.
   */
  async rationalizeCorrection({ prompt, studentThought, studentToolCall, verifierError, context = {} }) {
    const startTime = Date.now();
    const teacherMessages = this.buildTeacherHindsightPrompt({
      prompt,
      studentThought,
      studentToolCall,
      verifierError,
      context
    });

    actionDispatcher.broadcast("OPSD_TEACHER_RATIONALIZING", {
      studentTool: studentToolCall?.name,
      verifierError,
      timestamp: new Date().toISOString()
    });

    let completion = null;
    try {
      completion = await modelClient.callChat({
        messages: teacherMessages,
        tools: WHOLESHARE_TOOL_DECLARATIONS,
        temperature: 0.1,
        maxTokens: 1024
      });
    } catch (err) {
      throw new Error(`OPSD Teacher model inference failed: ${err.message}. Zero simulation standard strictly enforced: no deterministic fallback permitted.`);
    }

    const choiceMessage = completion?.message || {};
    const { thinkBlock, toolCall } = this.parseTeacherResponse(choiceMessage, verifierError);
    const durationMs = Date.now() - startTime;

    const boundaryCheck = verifyToolBoundary(toolCall.name, toolCall.arguments);
    const isValid = boundaryCheck.valid;

    actionDispatcher.broadcast("OPSD_TEACHER_CORRECTION_PRODUCED", {
      studentTool: studentToolCall?.name,
      correctedTool: toolCall.name,
      isValid,
      durationMs,
      timestamp: new Date().toISOString()
    });

    return {
      teacherRawResponse: choiceMessage.content || JSON.stringify(choiceMessage.tool_calls || {}),
      teacherThought: thinkBlock,
      correctedToolCall: toolCall,
      isValid,
      durationMs
    };
  }

  /**
   * Parses think blocks and tool calls from the teacher model message.
   * Fails fast if the model does not produce a valid tool call.
   */
  parseTeacherResponse(choiceMessage, verifierError) {
    let thinkBlock = "";
    const rawContent = choiceMessage.content || "";

    const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkBlock = thinkMatch[1].trim();
    } else if (rawContent.trim().length > 0 && !rawContent.includes("<tool_call>")) {
      thinkBlock = rawContent.trim();
    }

    let toolCall = null;

    if (Array.isArray(choiceMessage.tool_calls) && choiceMessage.tool_calls.length > 0) {
      const tc = choiceMessage.tool_calls[0];
      let parsedArgs = tc.function.arguments;
      if (typeof parsedArgs === "string") {
        try {
          parsedArgs = JSON.parse(parsedArgs);
        } catch {
          parsedArgs = {};
        }
      }
      toolCall = {
        name: tc.function.name,
        arguments: parsedArgs || {}
      };
    }

    if (!toolCall) {
      const toolMatch = rawContent.match(/<tool_call>([\s\S]*?)<\/tool_call>/i);
      if (toolMatch) {
        try {
          toolCall = JSON.parse(toolMatch[1].trim());
        } catch {}
      }
    }

    if (!toolCall) {
      const jsonMatch = rawContent.match(/\{[\s\S]*"name"[\s\S]*"arguments"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          toolCall = JSON.parse(jsonMatch[0].trim());
        } catch {}
      }
    }

    if (!toolCall || !toolCall.name) {
      throw new Error(
        `OPSD Teacher model failed to produce a valid tool call. Verifier error was: "${verifierError}". Raw response: ${rawContent.slice(0, 300)}. Zero simulation standard strictly enforced: deterministic fallback prohibited.`
      );
    }

    if (!thinkBlock) {
      thinkBlock = `Teacher corrected policy violation: ${verifierError}. Selected compliant tool ${toolCall.name}.`;
    }

    return { thinkBlock, toolCall };
  }

  /**
   * Commits the verified Student-Teacher distillation trace to the gold lakehouse partitions.
   */
  commitDistillationTrace({
    sessionId = `opsd_${Date.now()}`,
    prompt,
    studentThought,
    studentToolCall,
    verifierError,
    teacherThought,
    correctedToolCall,
    industryVertical = "general_sme"
  }) {
    const timestamp = new Date().toISOString();
    const traceRecord = {
      traceId: `s2_trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      timestamp,
      industryVertical,
      studentRollout: {
        thought: studentThought,
        toolCall: studentToolCall
      },
      verifierFeedback: {
        error: verifierError,
        policyVerified: false
      },
      teacherDistillation: {
        rationalization: teacherThought,
        correctedToolCall: correctedToolCall,
        policyVerified: true
      },
      opsdObjective: "KL_DIVERGENCE_ON_POLICY_DISTILLATION"
    };

    // ChatML formatted sample for direct SFT / LoRA fine-tuning
    const chatMlSample = {
      id: traceRecord.traceId,
      messages: [
        {
          role: "system",
          content: "You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal."
        },
        {
          role: "user",
          content: prompt
        },
        {
          role: "assistant",
          content: `<think>\n${teacherThought}\n</think>\n<tool_call>\n${JSON.stringify(correctedToolCall)}\n</tool_call>`
        }
      ],
      metadata: {
        source: "OPSD_ON_POLICY_DISTILLATION",
        correctedFromError: verifierError,
        timestamp
      }
    };

    // Append to OPSD trace archive
    appendFileSync(OPSD_TRACES_FILE, JSON.stringify(traceRecord) + "\n", "utf-8");

    // Append to System 2 Gold partition for Qwen LoRA SFT / GRPO training
    appendFileSync(SYSTEM2_GOLD_FILE, JSON.stringify(chatMlSample) + "\n", "utf-8");

    actionDispatcher.broadcast("OPSD_TRACE_COMMITTED", {
      traceId: traceRecord.traceId,
      tool: correctedToolCall.name,
      file: "system2_reasoning_rollouts.jsonl"
    });

    return traceRecord;
  }
}

export const opsdEngine = new OpsdEngine();
