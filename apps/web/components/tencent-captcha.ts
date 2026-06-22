"use client";

import type { CaptchaPublicConfig, CaptchaToken } from "./account-session";

type TencentCaptchaCallbackResult = {
  readonly ret?: number | string;
  readonly ticket?: string;
  readonly randstr?: string;
};

type TencentCaptchaInstance = {
  readonly show: () => void;
  readonly destroy?: () => void;
};

type TencentCaptchaConstructor = new (
  appId: string,
  callback: (result: TencentCaptchaCallbackResult) => void,
  options?: Record<string, unknown>,
) => TencentCaptchaInstance;

declare global {
  interface Window {
    TencentCaptcha?: TencentCaptchaConstructor;
  }
}

const scriptPromises = new Map<string, Promise<void>>();

function loadTencentCaptchaSdk(sdkUrl: string): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("安全验证仅能在浏览器中运行。"));
  }

  if (window.TencentCaptcha) {
    return Promise.resolve();
  }

  const existingPromise = scriptPromises.get(sdkUrl);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[data-tencent-captcha-sdk="true"][src="${sdkUrl}"]`,
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("安全验证加载失败，请稍后重试。")),
        {
          once: true,
        },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = sdkUrl;
    script.async = true;
    script.defer = true;
    script.dataset.tencentCaptchaSdk = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("安全验证加载失败，请稍后重试。")), {
      once: true,
    });
    document.head.appendChild(script);
  });

  scriptPromises.set(sdkUrl, promise);
  return promise;
}

export async function runTencentCaptcha(
  config: CaptchaPublicConfig,
  action: "login" | "register_send_code" | "register_confirm" | "account_binding",
): Promise<CaptchaToken> {
  if (!config.enabled || !config.captchaAppId) {
    throw new Error("安全验证暂不可用，请稍后重试。");
  }

  await loadTencentCaptchaSdk(config.sdkUrl);

  const TencentCaptcha = window.TencentCaptcha;
  if (!TencentCaptcha) {
    throw new Error("安全验证加载失败，请稍后重试。");
  }

  return new Promise<CaptchaToken>((resolve, reject) => {
    let instance: TencentCaptchaInstance | null = null;
    const finish = (callback: () => void) => {
      try {
        callback();
      } finally {
        instance?.destroy?.();
      }
    };

    instance = new TencentCaptcha(
      config.captchaAppId,
      (result) => {
        if (String(result.ret) === "2") {
          finish(() => reject(new Error("已取消安全验证。")));
          return;
        }

        const ticket = result.ticket;
        const randstr = result.randstr;
        if (ticket && randstr) {
          finish(() =>
            resolve({
              providerCode: "tencent_captcha",
              ticket,
              randstr,
            }),
          );
          return;
        }

        finish(() => reject(new Error("安全验证未完成，请重试。")));
      },
      { bizState: action },
    );
    instance.show();
  });
}
