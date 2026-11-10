import React, { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";

interface Credit {
  file: string;
  title: string;
  sourceUrl: string;
  author: string;
  license: string;
}

export const ImageCredits: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [credits, setCredits] = useState<Credit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = () => {
    setOpen(true);
    if (credits) return;
    fetch("/img/products/CREDITS.json")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Credits could not be loaded."))))
      .then((data: Credit[]) => setCredits(data))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Credits could not be loaded."));
  };

  return (
    <>
      <Button size="sm" variant="ghost" label="Image credits" onClick={show} />
      <Dialog isOpen={open} onOpenChange={setOpen} width={560} padding={4}>
        <DialogHeader title="Image credits" subtitle="Product photos come from Wikimedia Commons under open licenses." />
        <div className="ws-credits">
          {error && <p role="alert">{error}</p>}
          {!credits && !error && <p>Loading credits</p>}
          {credits?.map((credit) => (
            <div key={credit.file} className="ws-credits-row">
              <img src={`/img/products/${credit.file}`} alt="" width={56} height={40} loading="lazy" />
              <div>
                <a href={credit.sourceUrl} target="_blank" rel="noreferrer">{credit.title.replace(/^File:/, "")}</a>
                <span>{credit.author || "Unknown author"} · {credit.license}</span>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
};
