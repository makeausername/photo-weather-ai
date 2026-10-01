"use client";

export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return (
    <html lang="zh-CN" data-theme="light">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            gap: "1rem",
            padding: "1.5rem",
            textAlign: "center",
            background: "#F7F7F2",
            color: "#17283B",
            fontFamily:
              'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#B9472D" }}>出错了</p>
            <h1 style={{ margin: "0.5rem 0 0", fontSize: "28px", lineHeight: 1.3 }}>
              页面加载失败
            </h1>
            <p
              style={{ margin: "0.75rem 0 0", fontSize: "15px", lineHeight: 1.7, color: "#5E6C76" }}
            >
              天气或页面数据暂时没有加载成功，可以重试一次，或稍后再来。
            </p>
            {error?.digest ? (
              <p style={{ margin: "0.5rem 0 0", fontSize: "13px", color: "#5E6C76" }}>
                错误编号：{error.digest}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "1px solid #263D55",
              borderRadius: "8px",
              background: "#263D55",
              color: "#FFFDF7",
              padding: "0.5rem 1rem",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            重试
          </button>
        </main>
      </body>
    </html>
  );
}
