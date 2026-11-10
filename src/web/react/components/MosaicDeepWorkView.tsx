import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ChatComposer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage
} from "@astryxdesign/core/Chat";
import { Avatar } from "@astryxdesign/core/Avatar";
import { MosaicLogo } from "./MosaicLogo";
import { Button } from "@astryxdesign/core/Button";
import { Markdown } from "@astryxdesign/core/Markdown";
import { gsap } from "gsap";
import { ToolTrace } from "./ToolTrace";
import { getLiveState, subscribeLive } from "../mosaicLive";
import { fetchShipments } from "../api";
import { allowMosaicPermission } from "../mosaicAgent";
import { attachPhoto, clearChat, getChatState, removeAttachment, sendChatMessage, subscribeChat } from "../mosaicChatStore";
import { STITCH_COLORS, STITCH_RADIUS, STITCH_SHADOWS, STITCH_TYPOGRAPHY } from "../themes/stitchTokens";

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
  const c = STITCH_COLORS;
  const font = STITCH_TYPOGRAPHY.sans;
  const { messages, busy, error, lastQuestion, attachments, uploading, attachError } = useSyncExternalStore(subscribeChat, getChatState);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const live = useSyncExternalStore(subscribeLive, getLiveState);
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seeded = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const animated = useRef<Set<string>>(new Set());

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const card = scrollRef.current;
    let node: HTMLElement | null = root;
    while (node && node !== card?.parentElement && node.scrollHeight <= node.clientHeight + 1) node = node.parentElement;
    const scroller = node && node !== card?.parentElement ? node : null;
    if (scroller) window.requestAnimationFrame(() => scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" }));
  }, [messages.length, busy, live.items.length]);

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

  const card: React.CSSProperties = { background: c.card, border: `1px solid ${c.border}`, borderRadius: STITCH_RADIUS.xl, boxShadow: STITCH_SHADOWS.subtle };

  return (
    <section aria-label="Mosaic deep work" data-ws-view="mosaic-chat" className="ws-mosaic-deep" style={{ fontFamily: font, color: c.ink }}>
      <div className="ws-mosaic-deep-chat" ref={scrollRef} style={{ ...card, minWidth: 0, overflowY: "auto", position: "relative", transform: "translateZ(0)", display: "flex", flexDirection: "column" }}>
        <ChatLayout
          scrollRef={scrollRef}
          density="balanced"
          composer={
            <div style={{ display: "grid", gap: 8 }}>
              {(attachments.length > 0 || uploading || attachError) && (
                <div className="ws-attach-strip" aria-label="Attached photos">
                  {attachments.map((item) => (
                    <span key={item.evidenceId} className="ws-attach-chip">
                      <img src={item.uri} alt={item.fileName} />
                      <span>
                        {item.fileName}
                        {item.detectedTrackingNumbers[0] ? ` · tracking ${item.detectedTrackingNumbers[0]}` : ""}
                      </span>
                      <button type="button" onClick={() => removeAttachment(item.evidenceId)} aria-label={`Remove ${item.fileName}`}>Remove</button>
                    </span>
                  ))}
                  {uploading && <span className="ws-attach-note">Uploading photo</span>}
                  {attachError && <span className="ws-attach-note is-error">{attachError}</span>}
                </div>
              )}
              <div style={{ display: "grid", gap: 6, maxWidth: 760, width: "100%", margin: "0 auto" }}>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void attachPhoto(file);
                  event.target.value = "";
                }} />
                                <div style={{ width: "100%", minWidth: 0 }}>
                  <ChatComposer
                    value={prompt}
                    onChange={setPrompt}
                    placeholder={attachments.length > 0 ? "Describe what arrived damaged" : "Ask Mosaic to find groups, read your escrow, track shipments or file a claim"}
                    isDisabled={busy}
                    onSubmit={(value) => {
                      setPrompt("");
                      void sendChatMessage(value, true);
                    }}
                    input={<ChatComposerInput />}
                  />
                </div>
                <div style={{ justifySelf: "start" }}><span style={{ flex: "none" }}><Button size="sm" onClick={() => fileRef.current?.click()} isDisabled={busy || uploading}>Attach photo</Button></span></div>
              </div>
            </div>
          }
        >
          {messages.length === 0 && !busy && !error ? (
            <div style={{ minHeight: 420, display: "grid", placeItems: "center", paddingBottom: 150 }}>
              <div style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center", padding: 24, maxWidth: 560 }}>
              <MosaicLogo size={72} wordmark={false} loop={false} />
              <h1 style={{ margin: 0, fontSize: 28, lineHeight: "32px", fontWeight: 600, letterSpacing: "-0.02em" }}>What should Mosaic do?</h1>
              <p style={{ margin: 0, fontSize: 16, lineHeight: "24px", color: c.muted }}>
                Mosaic works the app for you and shows each step as it goes. Money only moves after you approve on PayPal.
              </p>
              <div style={{ display: "grid", gap: 8, width: "100%", maxWidth: 520 }} aria-label="Suggestions based on your data">
                {suggestions.map((item) => (
                  <button key={item.text} type="button" className="ws-suggest" onClick={() => setPrompt(item.text)}>
                    <span>{item.text}</span>
                    <small>{item.reason}</small>
                  </button>
                ))}
              </div>
            </div>
            </div>
          ) : (
          <div style={{ paddingBottom: 340 }} ref={listRef}>
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
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
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
                {lastQuestion && (
                  <Button size="sm" variant="primary" onClick={() => void run(lastQuestion, false)}>
                    Retry
                  </Button>
                )}
              </ChatSystemMessage>
            )}
          </ChatMessageList>
          </div>
          )}
        </ChatLayout>
      </div>

    </section>
  );
};
