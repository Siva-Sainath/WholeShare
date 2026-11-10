import React from "react";

export interface StatItem {
  label: string;
  value: string;
  note?: string;
}

export const StatStrip: React.FC<{ items: StatItem[]; label: string }> = ({ items, label }) => (
  <section className="ws-stat-strip" aria-label={label}>
    {items.map((item, index) => (
      <div key={item.label} className="ws-stat" style={{ animationDelay: `${index * 60}ms` }}>
        <p className="ws-stat-label">{item.label}</p>
        <p className="ws-stat-value">{item.value}</p>
        {item.note && <p className="ws-stat-note">{item.note}</p>}
      </div>
    ))}
  </section>
);
