"use client";

import { useEffect, useMemo, useState } from "react";

type Entry = { id: number; name: string; kind: "loot" | "cost"; value: number; qty: number };

const seed: Entry[] = [
  { id: 1, name: "Flame Elementium", kind: "loot", value: 18, qty: 42 },
  { id: 2, name: "Dream Talking", kind: "loot", value: 9, qty: 14 },
  { id: 3, name: "Beacon — Profound", kind: "cost", value: 3, qty: 28 },
  { id: 4, name: "Compass bundle", kind: "cost", value: 4, qty: 28 },
];

const history = [
  { name: "Bounty Hunting", date: "Today", maps: 28, profit: 736, rate: 1472 },
  { name: "Clockwork Ballet", date: "Aug 6", maps: 42, profit: 882, rate: 1203 },
  { name: "Dark Surge", date: "Aug 5", maps: 36, profit: 591, rate: 984 },
];

function money(value: number) { return Math.round(value).toLocaleString(); }

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>(seed);
  const [running, setRunning] = useState(true);
  const [seconds, setSeconds] = useState(1800);
  const [maps, setMaps] = useState(28);
  const [showEntry, setShowEntry] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ name: "", value: "", qty: "1", kind: "loot" as "loot" | "cost" });

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const stats = useMemo(() => {
    const revenue = entries.filter((e) => e.kind === "loot").reduce((n, e) => n + e.value * e.qty, 0);
    const costs = entries.filter((e) => e.kind === "cost").reduce((n, e) => n + e.value * e.qty, 0);
    const profit = revenue - costs;
    return { revenue, costs, profit, rate: seconds ? profit / (seconds / 3600) : 0 };
  }, [entries, seconds]);

  const time = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || Number(form.value) <= 0 || Number(form.qty) <= 0) return;
    setEntries((old) => [{ id: Date.now(), name: form.name, kind: form.kind, value: Number(form.value), qty: Number(form.qty) }, ...old]);
    setForm({ name: "", value: "", qty: "1", kind: "loot" });
    setShowEntry(false);
  }

  return (
    <main>
      <aside className="sidebar">
        <div className="brand"><span className="brandmark">T</span><span>TORCH<span className="muted">TRACK</span></span></div>
        <nav aria-label="Main navigation">
          <button className="navitem active"><span>◫</span> Dashboard</button>
          <button className="navitem"><span>◉</span> Sessions</button>
          <button className="navitem"><span>◇</span> Strategies</button>
          <button className="navitem"><span>⌁</span> Price library <b>Soon</b></button>
        </nav>
        <div className="sidebottom">
          <button className="navitem" onClick={() => setShowSetup(true)}><span>⚙</span> Data setup</button>
          <div className="safety"><i /> External & read-only<br/><small>No game control</small></div>
        </div>
      </aside>

      <section className="content">
        <header>
          <div><p className="eyebrow">FARMING OVERVIEW</p><h1>Good hunting, Ember.</h1><p>Track what your farming time is really worth.</p></div>
          <div className="headerActions"><span className="status"><i /> Session live</span><button className="iconBtn" aria-label="Notifications">♢</button></div>
        </header>

        <section className="hero">
          <div className="heroTop">
            <div><span className="live"><i /> LIVE SESSION</span><h2>Bounty Hunting · Profound</h2><p>Manella · Season 8</p></div>
            <div className="timer"><span>{time}</span><button onClick={() => setRunning(!running)} aria-label={running ? "Pause timer" : "Resume timer"}>{running ? "Ⅱ" : "▶"}</button></div>
          </div>
          <div className="metrics">
            <div><label>NET PROFIT</label><strong className="gold">{money(stats.profit)} <small>FE</small></strong><span className="up">↗ 14.2% vs last run</span></div>
            <div><label>PROFIT / HOUR</label><strong>{money(stats.rate)} <small>FE</small></strong><span>Based on live pace</span></div>
            <div><label>MAPS CLEARED</label><strong>{maps}</strong><span>{Math.floor(seconds / Math.max(maps, 1))}s average</span></div>
            <div><label>PROFIT / MAP</label><strong>{(stats.profit / Math.max(maps, 1)).toFixed(1)} <small>FE</small></strong><span>After all costs</span></div>
          </div>
          <div className="heroActions"><button className="primary" onClick={() => setMaps((m) => m + 1)}>+ Map complete</button><button onClick={() => setShowEntry(true)}>+ Add loot or cost</button><button onClick={() => { setSaved(true); setRunning(false); }}>□ Save session</button></div>
        </section>

        <section className="grid">
          <article className="card breakdown">
            <div className="cardHead"><div><p className="eyebrow">SESSION ECONOMY</p><h3>Where your FE went</h3></div><span className="pill">Live</span></div>
            <div className="moneyrow"><div><span>Revenue</span><b>{money(stats.revenue)} FE</b></div><div><span>Investment</span><b className="negative">−{money(stats.costs)} FE</b></div><div><span>Net profit</span><b className="gold">{money(stats.profit)} FE</b></div></div>
            <div className="bar"><i style={{width: `${Math.min(100, (stats.revenue / 1300) * 100)}%`}} /></div>
            <div className="entrylist">
              {entries.slice(0, 4).map((entry) => <div key={entry.id}><span className={`entryIcon ${entry.kind}`}>{entry.kind === "loot" ? "✦" : "−"}</span><span><b>{entry.name}</b><small>{entry.qty} × {entry.value} FE</small></span><strong className={entry.kind === "cost" ? "negative" : ""}>{entry.kind === "cost" ? "−" : "+"}{money(entry.qty * entry.value)} FE</strong></div>)}
            </div>
            <button className="textBtn" onClick={() => setShowEntry(true)}>Add another entry →</button>
          </article>

          <article className="card history">
            <div className="cardHead"><div><p className="eyebrow">RECENT RUNS</p><h3>Strategy history</h3></div><button className="link">View all</button></div>
            {history.map((run, i) => <div className="run" key={run.name}><span className="rank">0{i + 1}</span><span><b>{run.name}</b><small>{run.date} · {run.maps} maps</small></span><span className="runval"><b>{money(run.profit)} FE</b><small>{money(run.rate)} / hr</small></span></div>)}
            <div className="insight"><span>✦</span><p><b>Your best pace is Bounty Hunting.</b><br/>It’s earning 22% more FE/hour than your recent average.</p></div>
          </article>
        </section>

        <footer><span><i /> Data stays on this device</span><span>Manual tracking enabled · Log parsing ready for supported formats</span></footer>
      </section>

      {showEntry && <div className="modal" role="dialog" aria-modal="true" aria-labelledby="entry-title"><form onSubmit={addEntry} className="modalCard"><button type="button" className="close" onClick={() => setShowEntry(false)}>×</button><p className="eyebrow">MANUAL ENTRY</p><h2 id="entry-title">Add loot or investment</h2><p>This is the safest way to record a drop or map cost.</p><div className="segmented"><button type="button" className={form.kind === "loot" ? "selected" : ""} onClick={() => setForm({...form, kind: "loot"})}>Loot</button><button type="button" className={form.kind === "cost" ? "selected" : ""} onClick={() => setForm({...form, kind: "cost"})}>Cost</button></div><label>Item or cost name<input autoFocus value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g. Flame Elementium" /></label><div className="formrow"><label>Value each (FE)<input type="number" min="0.1" step="0.1" value={form.value} onChange={(e) => setForm({...form, value: e.target.value})} /></label><label>Quantity<input type="number" min="1" value={form.qty} onChange={(e) => setForm({...form, qty: e.target.value})} /></label></div><button className="primary submit">Add to session</button></form></div>}
      {showSetup && <div className="modal" role="dialog" aria-modal="true"><div className="modalCard setup"><button className="close" onClick={() => setShowSetup(false)}>×</button><p className="eyebrow">SAFE DATA SETUP</p><h2>Choose how to track</h2><div className="option activeOption"><span>1</span><div><b>Manual entry</b><p>Ready now. You enter loot and costs; the app does the math.</p></div><em>Active</em></div><div className="option"><span>2</span><div><b>Game log import</b><p>Future adapter. Reads supported text logs only—never game memory.</p></div><em>Planned</em></div><div className="option"><span>3</span><div><b>Screenshot OCR</b><p>Future optional import for reading loot from your screenshots.</p></div><em>Planned</em></div><div className="guardrail">This companion never presses keys, moves your character, reads memory, or bypasses anti-cheat.</div></div></div>}
      {saved && <div className="toast">✓ Session saved to strategy history <button onClick={() => setSaved(false)}>×</button></div>}
    </main>
  );
}
