import type { AlipayCharset } from "./alipay-encoding.js";

export function renderAlipayPagePayFormHtml({
  charset,
  fields,
  gatewayUrl,
}: {
  readonly charset: AlipayCharset;
  readonly fields: Record<string, string>;
  readonly gatewayUrl: string;
}): string {
  const hiddenInputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `    <input type="hidden" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlAttribute(
          value,
        )}">`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="${charset}"></head>
<body>
  <form id="alipay-page-pay-form" method="post" action="${escapeHtmlAttribute(
    gatewayUrl,
  )}" accept-charset="${charset}">
${hiddenInputs}
    <noscript><button type="submit">Continue</button></noscript>
  </form>
  <script>
    document.getElementById("alipay-page-pay-form").submit();
  </script>
</body>
</html>`;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
