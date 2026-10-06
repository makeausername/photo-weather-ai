/** Compatibility for products saved before the decision-report redesign. */
export function normalizeProductCopy(value: string): string {
  return value
    .replace(/专业逐小时表格|专业时序表/g, "拍摄时段与准备建议")
    .replace(/AI\s*解读|智能解读/gi, "题材拍摄建议");
}
