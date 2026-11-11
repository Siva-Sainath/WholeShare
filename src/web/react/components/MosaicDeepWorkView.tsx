import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Paperclip, Sparkles } from "lucide-react";
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage
} from "@astryxdesign/core/Chat";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Token } from "@astryxdesign/core/Token";
import { gsap } from "gsap";
import { ToolTrace } from "./ToolTrace";
import { getLiveState, subscribeLive } from "../mosaicLive";
import { fetchShipments } from "../api";
import { allowMosaicPermission } from "../mosaicAgent";
import { attachPhoto, getChatState, removeAttachment, sendChatMessage, subscribeChat } from "../mosaicChatStore";

interface Suggestion { text: string; reason: string }

export interface SelectedClanContext {
  id: string;
  name: string;
  unitPriceCents: number;
  membersCount: number;
}

declare global {
  interface Window {
    __wholeshareSelectedClan?: SelectedClanContext | null;
  }
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export interface MosaicDeepWorkViewProps {
  initialQuestion?: string;
}

export const MosaicDeepWorkView: React.FC<MosaicDeepWorkViewProps> = ({ initialQuestion }) => {
  const { messages, busy, error, lastQuestion, attachments, uploading, attachError } = useSyncExternalStore(subscribeChat, getChatState);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const live = useSyncExternalStore(subscribeLive, getLiveState);
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [business, setBusiness] = useState("");
  const seeded = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const animated = useRef<Set<string>>(new Set());

  useEffect(() => {
    const root = listRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fresh = Array.from(root.querySelectorAll<HTMLElement>("[data-msg-id]")).filter((node) => !animated.current.has(node.dataset.msgId ?? ""));
    fresh.forEach((node) => animated.current.add(node.dataset.msgId ?? ""));
    if (fresh.length) gsap.fromTo(fresh, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.05 });
  }, [messages.length]);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    let seed = initialQuestion?.trim() || "";
    if (!seed) {
      try {
        const stored = window.sessionStorage.getItem("ws_mosaic_query");
        if (stored?.trim()) {
          seed = stored.trim();
          window.sessionStorage.removeItem("ws_mosaic_query");
        }
      } catch {
        seed = "";
      }
    }
    if (seed) setPrompt(seed);
  }, [initialQuestion]);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/mosaic/suggestions").then((r) => r.json()).then((p: { suggestions?: Suggestion[] }) => active && setSuggestions(p.suggestions ?? [])).catch(() => active && setSuggestions([]));
    fetch("/api/v1/user/settings").then((r) => r.json()).then((p: { profile?: { businessName?: string } }) => active && setBusiness(String(p.profile?.businessName ?? ""))).catch(() => undefined);
    fetchShipments()
      .then(({ shipments }) => {
        if (!active) return;
        window.__wholeshareScreen = {
          screen: "mosaic",
          deliveredShipments: shipments
            .filter((shipment) => shipment.status === "DELIVERED")
            .slice(0, 8)
            .map((shipment) => ({ clanId: shipment.clanId, product: shipment.product ?? null, tracking: shipment.trackingNumber }))
        };
      })
      .catch(() => undefined);
    return () => {
      active = false;
      window.__wholeshareScreen = undefined;
    };
  }, []);

  const run = (question: string, appendUser: boolean) => {
    if (appendUser && question.trim()) setPrompt("");
    return sendChatMessage(question, appendUser);
  };

  const composer = (
    <>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void attachPhoto(file);
        event.target.value = "";
      }} />
      <ChatComposer
        value={prompt}
        onChange={setPrompt}
        placeholder={attachments.length > 0 ? "Describe what arrived damaged" : "Ask Mosaic to find groups, check your escrow, track a shipment or file a claim"}
        isDisabled={busy}
        onSubmit={(value) => {
          setPrompt("");
          void sendChatMessage(value, true);
        }}
        input={<ChatComposerInput />}
        drawer={attachments.length > 0 || uploading || attachError ? (
          <ChatComposerDrawer count={attachments.length}>
            {attachments.map((item) => (
              <Token key={item.evidenceId} label={item.detectedTrackingNumbers[0] ? `${item.fileName} · tracking ${item.detectedTrackingNumbers[0]}` : item.fileName} onRemove={() => removeAttachment(item.evidenceId)} />
            ))}
            {uploading && <Token label="Uploading photo" />}
            {attachError && <Token label={attachError} />}
          </ChatComposerDrawer>
        ) : undefined}
        headerActions={<Button label="Attach a photo" variant="ghost" size="sm" icon={<Paperclip size={16} />} isIconOnly isDisabled={busy || uploading} onClick={() => fileRef.current?.click()} />}
      />
    </>
  );

  const empty = messages.length === 0 && !busy && !error;
  const greetingName = business.trim().split(/\s+/)[0];

  return (
    <section aria-label="Mosaic" data-ws-view="mosaic-chat" className="ws-chat">
      {empty ? (
        <div className="ws-chat-start">
          <div className="ws-chat-greeting">
            <span className="ws-chat-orb" aria-hidden="true"><Sparkles size={18} /></span>
            <p>{greetingName ? `Hi, ${greetingName}` : "Hi there"}</p>
            <h1>Where should we start?</h1>
          </div>
          <div className="ws-chat-composer">{composer}</div>
          <div className="ws-chat-cards" aria-label="Suggestions based on your business">
            {suggestions.map((item) => (
              <ClickableCard key={item.text} label={item.text} variant="muted" padding={3} onClick={() => void run(item.text, true)}>
                <div className="ws-chat-card">
                  <strong>{item.text}</strong>
                  <span>{item.reason}</span>
                </div>
              </ClickableCard>
            ))}
          </div>
        </div>
      ) : (
        <div className="ws-chat-thread">
          <ChatLayout style={{ height: "100%" }} density="balanced" composer={<div className="ws-chat-composer ws-chat-composer--dock">{composer}</div>}>
            <div ref={listRef}>
              <ChatMessageList isStreaming={busy}>
                {messages.map((message) =>
                  message.role === "user" ? (
                    <ChatMessage key={message.id} sender="user" data-msg-id={message.id}>
                      <ChatMessageBubble metadata={formatTime(message.at)}>{message.text}</ChatMessageBubble>
                    </ChatMessage>
                  ) : (
                    <ChatMessage key={message.id} sender="assistant" avatar={<Avatar name="Mosaic" size="md" />} name="Mosaic" data-msg-id={message.id}>
                      {message.actions && message.actions.length > 0 && (
                        <ToolTrace items={message.actions.map((action, index) => ({ key: `${message.id}-${index}`, tool: action.tool, label: action.label, pending: false, ok: action.ok, href: action.href }))} />
                      )}
                      <ChatMessageBubble metadata={formatTime(message.at)}><Markdown>{message.text}</Markdown></ChatMessageBubble>
                      {message.blocked && (
                        <div className="ws-chat-allow">
                          <span className="lp-gold">
                            <Button
                              size="sm"
                              variant="primary"
                              label={`Allow Mosaic to ${message.blocked.label}`}
                              onClick={() => {
                                const block = message.blocked;
                                if (!block) return;
                                void allowMosaicPermission(block.permission).then(() => sendChatMessage(block.prompt, false)).catch(() => undefined);
                              }}
                            />
                          </span>
                        </div>
                      )}
                    </ChatMessage>
                  )
                )}
                {busy && (
                  <ChatMessage sender="assistant" avatar={<Avatar name="Mosaic" size="md" />} name="Mosaic">
                    {live.items.length > 0 && (
                      <ToolTrace items={live.items.map((item) => ({ key: item.key, tool: item.tool, label: item.label, pending: item.pending, ok: item.ok, href: item.href, detail: item.detail, startedAt: item.startedAt }))} />
                    )}
                    {live.draft ? (
                      <ChatMessageBubble><Markdown>{live.draft}</Markdown></ChatMessageBubble>
                    ) : live.items.length === 0 ? (
                      <ChatMessageBubble>Mosaic is reading your request.</ChatMessageBubble>
                    ) : null}
                  </ChatMessage>
                )}
                {error && (
                  <ChatSystemMessage>
                    Mosaic is unavailable right now. {error}{" "}
                    {lastQuestion && <Button size="sm" variant="primary" onClick={() => void run(lastQuestion, false)}>Retry</Button>}
                  </ChatSystemMessage>
                )}
              </ChatMessageList>
            </div>
          </ChatLayout>
        </div>
      )}
    </section>
  );
};
