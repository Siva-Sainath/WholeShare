import React, { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, Search, Sparkles } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { allowMosaicPermission, askMosaic, MosaicReply } from "../mosaicAgent";

// One place to say what you want. Mosaic does it and shows the result beside the page.

const EXAMPLES: Array<{ label: string; prompt: string }> = [
  { label: "Compare the container groups", prompt: "Compare the two Flushing takeout container groups for 12 cases" },
  { label: "What can Flushing still join?", prompt: "Which Flushing groups can we still join?" },
  { label: "My open PayPal invoices", prompt: "List my open PayPal invoices" },
  { label: "Show my pledges", prompt: "Show my pledges" },
  { label: "Claims waiting for me", prompt: "Show my claims that are still drafts" },
  { label: "What arrives this week?", prompt: "Show the shipments arriving soon" }
];

export const CommandBar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MosaicReply | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const reply = await askMosaic(question, "workspace-copilot");
      setResult(reply);
      setPrompt("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mosaic could not finish that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(prompt);
  };

  return (
    <>
      <button type="button" className="ws-copilot-trigger ws-copilot-trigger--compact" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <Sparkles size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
        Ask Mosaic
      </button>

      {open && (
        <div className="ws-cmd-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="ws-cmd" role="dialog" aria-modal="true" aria-label="Ask Mosaic">
            <form className="ws-cmd-input" onSubmit={submit}>
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Tell Mosaic what you need"
                aria-label="Tell Mosaic what you need"
                autoComplete="off"
              />
              <span className="lp-gold">
                <Button variant="primary" size="sm" label={busy ? "Working" : "Go"} icon={busy ? <LoaderCircle size={14} className="ws-spin" /> : <ArrowRight size={14} />} isDisabled={busy || !prompt.trim()} onClick={() => void send(prompt)} />
              </span>
            </form>

            <div className="ws-cmd-body" aria-live="polite">
              {!busy && !result && !error && (
                <>
                  <p className="ws-cmd-label">Try asking</p>
                  <div className="ws-cmd-examples">
                    {EXAMPLES.map((example) => (
                      <button key={example.label} type="button" onClick={() => void send(example.prompt)}>{example.label}</button>
                    ))}
                  </div>
                  <p className="ws-cmd-hint">Mosaic opens pages, finds groups, checks suppliers on the web and shows results beside the page. You approve anything that moves money.</p>
                </>
              )}

              {busy && <p className="ws-cmd-working" role="status"><LoaderCircle size={15} className="ws-spin" /> Mosaic is working on it</p>}

              {error && <div role="alert" className="ws-cmd-error">{error}</div>}

              {result && (
                <div className="ws-cmd-result">
                  <p>{result.text}</p>
                  {result.blocked && (
                    <span className="lp-gold">
                      <Button
                        size="sm"
                        variant="primary"
                        label={`Allow Mosaic to ${result.blocked.label}`}
                        onClick={() => {
                          const block = result.blocked;
                          if (!block) return;
                          setBusy(true);
                          setResult(null);
                          void allowMosaicPermission(block.permission)
                            .then(() => askMosaic(block.prompt, "workspace-copilot"))
                            .then(setResult)
                            .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not allow that."))
                            .finally(() => setBusy(false));
                        }}
                      />
                    </span>
                  )}
                  {result.actions.length > 0 && (
                    <ul>
                      {result.actions.map((action, index) => (
                        <li key={index} data-ok={action.ok ? "true" : "false"}>
                          {action.href ? <a href={action.href} target="_blank" rel="noreferrer">{action.label}</a> : action.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <footer className="ws-cmd-foot"><span>Press Esc to close</span><span>Cmd K opens this anywhere</span></footer>
          </section>
        </div>
      )}
    </>
  );
};
