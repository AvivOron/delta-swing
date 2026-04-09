import { ImageResponse } from "next/og";

export const alt = "Delta Swing — Stock Pattern Finder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#020617",
          padding: "72px 80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Indigo glow */}
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "rgba(99,102,241,0.10)",
            filter: "blur(140px)",
            top: "50%",
            left: "30%",
            transform: "translate(-50%, -50%)",
            display: "flex",
          }}
        />

        {/* Fake ZigZag chart */}
        <svg
          style={{ position: "absolute", right: 60, bottom: 60, opacity: 0.15 }}
          width="420"
          height="220"
          viewBox="0 0 420 220"
        >
          <polyline
            points="0,180 60,140 120,170 180,80 240,120 300,50 360,90 420,40"
            fill="none"
            stroke="#6366f1"
            strokeWidth="3"
          />
          <circle cx="60"  cy="140" r="6" fill="#10b981" />
          <circle cx="120" cy="170" r="6" fill="#f59e0b" />
          <circle cx="180" cy="80"  r="6" fill="#10b981" />
          <circle cx="240" cy="120" r="6" fill="#f59e0b" />
          <circle cx="300" cy="50"  r="6" fill="#10b981" />
          <circle cx="360" cy="90"  r="6" fill="#f59e0b" />
        </svg>

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
          {/* Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", display: "flex" }} />
            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", letterSpacing: "0.1em" }}>
              avivo.dev
            </span>
          </div>

          {/* Title */}
          <div style={{ display: "flex", fontSize: 82, fontWeight: 800, color: "#ffffff", letterSpacing: "-3px", lineHeight: 1 }}>
            <span>Delta&nbsp;</span>
            <span style={{ color: "#6366f1" }}>Swing</span>
          </div>

          {/* Subtitle */}
          <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
            NYSE ZigZag pattern scanner · Powered by Raspberry Pi
          </div>

          {/* Pills */}
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            {["2,300+ tickers", "Daily scan", "Buy signals"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "8px 20px",
                  borderRadius: 999,
                  border: "1px solid rgba(99,102,241,0.3)",
                  background: "rgba(99,102,241,0.08)",
                  fontSize: 18,
                  color: "#a5b4fc",
                  fontFamily: "monospace",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
