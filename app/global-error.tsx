"use client";

// Root-level backstop: catches an error thrown in the root layout itself,
// or anything that somehow escapes every nested error.tsx (see
// app/(app)/error.tsx for the normal case). global-error replaces the
// entire document, so it can't rely on globals.css or the app's own
// components — inline styles only, per Next's docs. Next 16.3: the retry
// callback here is `retry`, not `reset` — see app/(app)/error.tsx's note.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fff",
          color: "#111",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 320 }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>Something went wrong.</p>
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>
            LifeOS hit an unexpected error. Try reloading.
          </p>
          <button
            onClick={() => retry()}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
