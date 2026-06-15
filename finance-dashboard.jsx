import { useState, useEffect, useRef, useCallback } from "react";

const SECURITIES = [
  { isin: "DE000FA00477", wkn: "FA0047" },
  { isin: "DE000WA5P612", wkn: "WA5P61" },
  { isin: "DE000MJ9HX30", wkn: "MJ9HX3" },
];

const REFRESH_INTERVAL = 30000; // 30 seconds (web search is slower)

async function fetchQuoteViaClaude(isin, wkn) {
  const prompt = `Suche den aktuellen Börsenkurs für das Wertpapier mit ISIN ${isin} (WKN: ${wkn}).
Antworte NUR mit einem JSON-Objekt ohne Markdown, exakt in diesem Format:
{
  "name": "Produktname",
  "price": 12.34,
  "currency": "EUR",
  "change": 0.12,
  "changePct": 0.98,
  "bid": 12.30,
  "ask": 12.38,
  "time": "HH:MM",
  "exchange": "Börsenplatz"
}
Falls ein Wert nicht verfügbar ist, setze null. Keine anderen Texte, keine Erklärungen.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`API ${response.status}`);
  const data = await response.json();

  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Keine Antwort");

  const raw = textBlock.text.replace(/```json|```/g, "").trim();
  // Find JSON object in response
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Kein JSON gefunden");
  return JSON.parse(match[0]);
}

function Arrow({ v }) {
  if (v === null || v === undefined) return null;
  if (v > 0) return <span style={{ color: "#22c55e" }}>▲</span>;
  if (v < 0) return <span style={{ color: "#ef4444" }}>▼</span>;
  return <span style={{ color: "#64748b" }}>–</span>;
}

function Sparkline({ history }) {
  if (!history || history.length < 2) return null;
  const vals = history.map((h) => h.price);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 0.001;
  const W = 130, H = 38, P = 3;
  const pts = vals.map((v, i) => {
    const x = P + (i / (vals.length - 1)) * (W - P * 2);
    const y = H - P - ((v - min) / range) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={W} height={H}>
      <polyline points={pts} fill="none" stroke={up ? "#22c55e" : "#ef4444"}
        strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function PulsingDot({ color }) {
  return (
    <span style={{ position: "relative", display: "inline-block", width: 8, height: 8, marginRight: 5 }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: color, animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite", opacity: 0.4,
      }} />
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
    </span>
  );
}

function Card({ isin, wkn }) {
  const [quote, setQuote] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error
  const [updated, setUpdated] = useState(null);
  const timerRef = useRef(null);
  const countRef = useRef(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const q = await fetchQuoteViaClaude(isin, wkn);
      setQuote(q);
      setStatus("ok");
      setUpdated(new Date());
      if (q?.price !== null && q?.price !== undefined) {
        setHistory((h) => [...h, { price: q.price, t: Date.now() }].slice(-40));
      }
    } catch (e) {
      setStatus("error");
      console.error(isin, e);
    }
    setCountdown(REFRESH_INTERVAL / 1000);
  }, [isin, wkn]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_INTERVAL);
    countRef.current = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => { clearInterval(timerRef.current); clearInterval(countRef.current); };
  }, [load]);

  const up = quote?.changePct > 0;
  const dn = quote?.changePct < 0;
  const accent = up ? "#22c55e" : dn ? "#ef4444" : "#64748b";
  const priceFmt = (v) => v == null ? "—" : v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  return (
    <div style={{
      background: "#0f172a",
      border: `1px solid ${status === "error" ? "#450a0a" : "#1e293b"}`,
      borderRadius: 14,
      padding: "20px 22px",
      flex: "1 1 260px",
      position: "relative",
      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      transition: "border-color 0.4s",
    }}>
      {/* top accent */}
      <div style={{ position: "absolute", top: 0, left: 16, right: 16, height: 2, background: accent, borderRadius: "0 0 4px 4px", opacity: 0.8 }} />

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: "#334155", letterSpacing: 2, textTransform: "uppercase" }}>
            {wkn} · XFRA
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>
            {isin}
          </div>
          {quote?.name && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginTop: 4, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {quote.name}
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center" }}>
          {status === "loading" && <><PulsingDot color="#f59e0b" /><span style={{ color: "#f59e0b" }}>LADEN</span></>}
          {status === "ok"      && <><PulsingDot color="#22c55e" /><span style={{ color: "#22c55e" }}>LIVE</span></>}
          {status === "error"   && <><PulsingDot color="#ef4444" /><span style={{ color: "#ef4444" }}>FEHLER</span></>}
          {status === "idle"    && <span style={{ color: "#334155" }}>–</span>}
        </div>
      </div>

      {/* Price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "14px 0 4px" }}>
        <span style={{
          fontSize: 34, fontWeight: 800, letterSpacing: -1,
          color: status === "loading" && !quote ? "#1e293b" : "#f1f5f9",
          fontVariantNumeric: "tabular-nums",
          transition: "color 0.3s",
        }}>
          {status === "loading" && !quote ? "···" : priceFmt(quote?.price)}
        </span>
        <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>
          {quote?.currency ?? "EUR"}
        </span>
      </div>

      {/* Change */}
      {quote && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: accent, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            <Arrow v={quote.change} />
            {" "}
            {quote.change != null ? (quote.change >= 0 ? "+" : "") + quote.change.toFixed(3) : ""}
          </span>
          {quote.changePct != null && (
            <span style={{
              background: up ? "#052e16" : dn ? "#450a0a" : "#1e293b",
              color: accent, borderRadius: 6,
              padding: "2px 8px", fontSize: 12, fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}>
              {quote.changePct >= 0 ? "+" : ""}{quote.changePct.toFixed(2)}%
            </span>
          )}
        </div>
      )}

      {/* Sparkline */}
      {history.length >= 2 && (
        <div style={{ marginBottom: 10 }}>
          <Sparkline history={history} />
        </div>
      )}

      {/* Bid / Ask */}
      {(quote?.bid || quote?.ask) && (
        <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
          {[["Geld", quote.bid], ["Brief", quote.ask]].map(([lbl, val]) => val != null && (
            <div key={lbl}>
              <div style={{ fontSize: 9, color: "#334155", letterSpacing: 1, textTransform: "uppercase" }}>{lbl}</div>
              <div style={{ color: "#64748b", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{priceFmt(val)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 10, color: "#1e293b" }}>
          {updated ? `${updated.toLocaleTimeString("de-DE")}` : ""}
          {quote?.time ? ` · Kurs: ${quote.time}` : ""}
        </span>
        <span style={{ fontSize: 10, color: "#1e293b" }}>
          {status === "ok" ? `↻ ${countdown}s` : ""}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = clock.getHours(), m = clock.getMinutes(), day = clock.getDay();
  const mins = h * 60 + m;
  const marketOpen = day > 0 && day < 6 && mins >= 9 * 60 && mins <= 22 * 60;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020617",
      color: "#f1f5f9",
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      padding: "28px 20px 40px",
    }}>
      <style>{`
        @keyframes ping { 75%,100%{transform:scale(2);opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "#1e3a5f", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>
              Finance · Echtzeit-Kurse
            </div>
            <h1 style={{
              fontSize: 26, fontWeight: 800, letterSpacing: -0.5,
              background: "linear-gradient(135deg, #f1f5f9 30%, #475569)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Derivate Monitor
            </h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
              {clock.toLocaleTimeString("de-DE")}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, marginTop: 4,
              color: marketOpen ? "#22c55e" : "#ef4444" }}>
              {marketOpen ? "● MARKT AKTIV" : "● MARKT GESCHLOSSEN"}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: "linear-gradient(90deg, #1e293b 60%, transparent)", marginBottom: 24 }} />

        {/* Cards */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {SECURITIES.map((s) => <Card key={s.isin} {...s} />)}
        </div>

        {/* Info */}
        <div style={{ marginTop: 24, fontSize: 10, color: "#1e293b", lineHeight: 1.8 }}>
          Kurse werden via KI-gestützter Websuche abgerufen · Aktualisierung alle 30 Sekunden · Kurse können leicht verzögert sein
        </div>
      </div>
    </div>
  );
}
