"use client";

import { useEffect, useRef, useState } from "react";

export function DataScrollHint() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    const update = () => setOverflows(scroller.scrollWidth > scroller.clientWidth + 1);
    const resize = new ResizeObserver(update);
    resize.observe(scroller);
    for (const child of scroller.children) resize.observe(child);
    update();
    return () => resize.disconnect();
  }, []);
  return (
    <p
      ref={ref}
      className="sticky left-0 w-fit max-w-full px-3 py-2 text-xs text-muted-foreground"
      hidden={!overflows}
    >
      左右滑动查看完整数据；键盘可使用左右方向键。
    </p>
  );
}
