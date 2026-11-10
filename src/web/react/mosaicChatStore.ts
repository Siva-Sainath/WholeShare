import { askMosaic } from "./mosaicAgent";
import { uploadEvidence, type EvidenceRecord } from "./api";
import type { MosaicAction, MosaicBlock } from "./mosaicAgent";

export interface ChatMessage {
  id: string;
  role: "user" | "mosaic";
  text: string;
  at: number;
  actions?: MosaicAction[];
  blocked?: MosaicBlock;
}

export interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  lastQuestion: string;
  attachments: EvidenceRecord[];
  uploading: boolean;
  attachError: string | null;
}

const STORAGE_KEY = "wholeshare_mosaic_chat_v1";
const MAX_STORED_MESSAGES = 120;

function loadMessages(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

let state: ChatState = { messages: loadMessages(), busy: false, error: null, lastQuestion: "", attachments: [], uploading: false, attachError: null };
const listeners = new Set<() => void>();

function setState(next: Partial<ChatState>): void {
  state = { ...state, ...next };
  if (next.messages) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages.slice(-MAX_STORED_MESSAGES)));
    } catch {
      // Storage can be unavailable. The conversation still works for this session.
    }
  }
  listeners.forEach((listener) => listener());
}

export function subscribeChat(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChatState(): ChatState {
  return state;
}

export async function sendChatMessage(question: string, appendUser: boolean): Promise<void> {
  const text = question.trim();
  if (!text || state.busy) return;
  setState({ busy: true, error: null, lastQuestion: text });
  if (appendUser) {
    setState({ messages: [...state.messages, { id: `u-${Date.now()}`, role: "user", text, at: Date.now() }] });
  }
  try {
    const evidence = state.attachments;
    const history = state.messages.slice(appendUser ? -7 : -6, appendUser ? -1 : undefined).map((message) => ({ role: message.role === "user" ? ("user" as const) : ("assistant" as const), text: message.text }));
    const reply = await askMosaic(text, "mosaic-deep-work", evidence as unknown as Array<Record<string, unknown>>, history);
    if (evidence.length > 0) setState({ attachments: [] });
    setState({
      busy: false,
      messages: [...state.messages, { id: `m-${Date.now()}`, role: "mosaic", text: reply.text, at: Date.now(), actions: reply.actions, blocked: reply.blocked }]
    });
  } catch (cause) {
    setState({ busy: false, error: cause instanceof Error ? cause.message : "Mosaic could not complete this request." });
  }
}

export function clearChat(): void {
  setState({ messages: [], error: null });
}

export async function attachPhoto(file: File): Promise<void> {
  setState({ uploading: true, attachError: null });
  try {
    const record = await uploadEvidence(file);
    setState({ uploading: false, attachments: [...state.attachments, record].slice(0, 4) });
  } catch (cause) {
    setState({ uploading: false, attachError: cause instanceof Error ? cause.message : "Upload failed." });
  }
}

export function removeAttachment(evidenceId: string): void {
  setState({ attachments: state.attachments.filter((item) => item.evidenceId !== evidenceId) });
}
