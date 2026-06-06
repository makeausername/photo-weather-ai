import Link from "next/link";
import { siteConfig } from "../site-config";
import { cn } from "./ui";

type FooterLinkProps = {
  readonly href: string;
  readonly label: string;
  readonly className?: string;
};

function FooterLink({ href, label, className }: FooterLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4b544]",
        className,
      )}
    >
      {label}
    </Link>
  );
}

export function SiteFooter() {
  const { brand, footer, legal } = siteConfig;
  const signalKeywords = footer.horizonText.split(" · ").filter(Boolean);

  return (
    <footer
      id="site-footer"
      className="relative overflow-hidden bg-[#071614] text-[#f8f1df] shadow-[inset_0_1px_0_rgb(244_181_68_/_0.18)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(90deg,rgb(216_138_32_/_0.08),rgb(95_141_138_/_0.18),rgb(216_138_32_/_0.06))]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(16_42_36_/_0.98)_0%,rgb(7_22_20)_62%,rgb(4_16_14)_100%)]"
      />

      <div className="relative mx-auto w-full max-w-[1560px] px-[clamp(24px,4vw,72px)] py-8 sm:py-9 lg:py-10">
        <div className="grid gap-6 min-[900px]:grid-cols-[minmax(280px,1fr)_auto] min-[900px]:items-start">
          <Link
            href="/"
            className="group flex max-w-2xl items-start gap-4 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4b544]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#f8e7be]/20 bg-[#fffdf7] shadow-[0_14px_32px_rgb(0_0_0_/_0.22)]">
              <img src="/brand-mark.svg" alt="" className="h-10 w-10" aria-hidden="true" />
            </span>
            <span className="grid min-w-0 gap-1">
              <span className="text-xl font-bold leading-tight tracking-normal text-[#fffdf7]">
                {brand.name}
              </span>
              <span className="text-sm leading-6 text-[#cbd6ca]">{brand.tagline}</span>
            </span>
          </Link>

          <nav
            aria-label="Footer primary navigation"
            className="flex flex-wrap gap-2 min-[900px]:max-w-[620px] min-[900px]:justify-end"
          >
            {footer.mainNavigation.map((link) => (
              <FooterLink
                key={link.href}
                href={link.href}
                label={link.label}
                className="border border-[#f8e7be]/12 bg-[#f8f1df]/5 px-3 py-1.5 text-sm font-semibold text-[#edf0e6] hover:border-[#f4b544]/50 hover:bg-[#f4b544]/10 hover:text-[#fff8dd]"
              />
            ))}
          </nav>
        </div>

        <div className="mt-7 grid gap-4 border-y border-[#f8e7be]/12 py-5 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
          <p className="max-w-3xl text-sm leading-6 text-[#d7d5c7]">{brand.shortTagline}</p>
          <div
            aria-label="Photography weather signals"
            className="flex flex-wrap gap-2 min-[900px]:justify-end"
          >
            {signalKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-md border border-[#f4b544]/18 bg-[#f4b544]/8 px-2.5 py-1 text-xs font-semibold text-[#ffe3a6]"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-start">
          <p className="max-w-3xl text-xs leading-5 text-[#aebbae]">{footer.disclaimer}</p>
          <div className="grid gap-2 text-xs text-[#aebbae] min-[900px]:justify-items-end">
            <nav
              aria-label="Footer legal and support links"
              className="flex flex-wrap gap-x-1 gap-y-1 min-[900px]:justify-end"
            >
              {footer.legalNavigation.map((link) => (
                <FooterLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  className="px-1.5 py-0.5 text-xs font-medium text-[#bec8b8] hover:bg-[#f8f1df]/8 hover:text-[#fff8dd]"
                />
              ))}
            </nav>
            <span className="text-[#93a193]">{footer.copyright}</span>
          </div>
        </div>

        <div className="mt-5 flex justify-center border-t border-[#f8e7be]/12 pt-4">
          <a
            href={legal.icpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium text-[#b7c2b4] transition hover:bg-[#f8f1df]/8 hover:text-[#ffe3a6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4b544]"
          >
            {legal.icpNumber}
          </a>
        </div>
      </div>
    </footer>
  );
}
