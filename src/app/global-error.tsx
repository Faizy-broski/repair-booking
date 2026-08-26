"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "2rem",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <h1 style={{ fontSize: "2rem", fontWeight: 300, color: "#0f172a" }}>
            Something went wrong.
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#64748b", maxWidth: 420 }}>
            A critical error occurred. Please try reloading the page.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "2rem",
              borderRadius: "9999px",
              padding: "0.9rem 1.75rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "white",
              background:
                "linear-gradient(90deg, #008080 0%, #008080 37%, #18E3CD 100%)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
