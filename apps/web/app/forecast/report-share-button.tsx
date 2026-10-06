"use client";

import React, { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "../../components/ui";
import { shareFileStem, type ShareDocument } from "./report-share-document";

export function ReportShareButton({ document }: { readonly document: ShareDocument }) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [archive, setArchive] = useState<string>();
  const [progress, setProgress] = useState("正在排版…");
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const latest = useRef(document);
  latest.current = document;
  // Changes to the source invalidate an open preview, but ordinary parent rerenders do not.
  const sourceKey = JSON.stringify(document);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const urls: string[] = [];
    setImages([]);
    setArchive(undefined);
    setError("");
    setCanShare(false);
    setProgress("正在排版…");
    void (async () => {
      try {
        const { renderShareImages, zipShareImages } = await import("./report-share-render");
        const files = await renderShareImages(latest.current, controller.signal, (done, total) =>
          setProgress(`正在生成 ${done} / ${total} 张…`),
        );
        controller.signal.throwIfAborted();
        const previews = files.map((file) => {
          const url = URL.createObjectURL(file);
          urls.push(url);
          return { file, url };
        });
        setImages(previews);
        setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files }));
        setProgress("正在打包…");
        const zip = await zipShareImages(files);
        controller.signal.throwIfAborted();
        const url = URL.createObjectURL(zip);
        urls.push(url);
        setArchive(url);
        setProgress("");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setProgress("");
        setError(cause instanceof Error ? cause.message : "图片生成失败，请关闭后重试。");
      }
    })();
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [open, sourceKey]);

  async function share() {
    setSharing(true);
    setError("");
    try {
      await navigator.share({ files: images.map((image) => image.file) });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError("当前设备未能分享这组图片，请打包下载或逐张保存。");
    } finally {
      setSharing(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setImages([]);
          setArchive(undefined);
        }
      }}
    >
      <Dialog.Trigger className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-card-foreground hover:border-primary hover:bg-secondary">
        分享截图
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed inset-x-2 top-[3dvh] z-50 mx-auto flex max-h-[94dvh] w-auto max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background p-4 shadow-xl sm:inset-x-6 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-bold">分享报告</Dialog.Title>
            <Dialog.Close
              className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-secondary"
              aria-label="关闭分享预览"
            >
              关闭
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            按内容自动切片，包含全部日期。可逐张保存，手机也可长按图片保存。
          </Dialog.Description>
          <div className="my-3 flex flex-wrap items-center gap-2">
            {canShare && images.length > 0 ? (
              <Button onClick={() => void share()} disabled={sharing}>
                {sharing ? "正在分享…" : `分享 ${images.length} 张图片`}
              </Button>
            ) : null}
            {archive ? (
              <a
                href={archive}
                download={`${shareFileStem(document)}.zip`}
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                打包下载（{images.length} 张）
              </a>
            ) : null}
            <span role="status" className="text-sm text-muted-foreground">
              {progress || (images.length ? `已生成 ${images.length} 张` : "")}
            </span>
          </div>
          {error ? (
            <p role="alert" className="mb-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="grid gap-5 sm:grid-cols-2">
              {images.map((image, index) => (
                <figure key={image.url} className="min-w-0">
                  {/* Local canvas output has no remote source or image optimization requirement. */}
                  <img
                    src={image.url}
                    alt={`${document.location}报告，第 ${index + 1} 张，共 ${images.length} 张`}
                    width={1080}
                    height={1440}
                    className="h-auto w-full rounded-lg border border-border"
                  />
                  <figcaption className="mt-1 text-center">
                    <a
                      href={image.url}
                      download={image.file.name}
                      className="inline-flex min-h-11 items-center px-3 text-sm text-primary underline"
                    >
                      保存第 {index + 1} 张
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
