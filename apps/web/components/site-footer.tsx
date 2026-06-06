import Link from "next/link";
import { siteConfig } from "../site-config";

type FooterLinkProps = {
  readonly href: string;
  readonly label: string;
};

function FooterLink({ href, label }: FooterLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 min-w-0 items-center rounded-md px-2.5 text-sm font-medium text-[#66736D] transition hover:bg-[#ECE7DC] hover:text-[#2F6F5E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A9C7B8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F4EC]"
    >
      {label}
    </Link>
  );
}

export function SiteFooter() {
  const { brand, footer, legal } = siteConfig;

  return (
    <footer
      id="site-footer"
      aria-label="逐光天气页脚"
      className="border-t border-[#DDD4C4] bg-[#F7F4EC] text-[#17231F]"
    >
      <div className="mx-auto grid w-full max-w-[1560px] gap-5 px-[clamp(24px,4vw,72px)] py-8 sm:py-9">
        <div className="grid gap-5 min-[900px]:grid-cols-[minmax(280px,0.75fr)_minmax(0,1fr)] min-[900px]:items-center">
          <Link
            href="/"
            className="group flex min-w-0 max-w-xl items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A9C7B8] focus-visible:ring-offset-4 focus-visible:ring-offset-[#F7F4EC]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#DDD4C4] bg-[#FFFDF7] shadow-sm">
              <img src="/brand-mark.svg" alt="" className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="grid min-w-0 gap-1">
              <span className="text-lg font-bold leading-tight text-[#17231F] sm:text-xl">
                {brand.name}
              </span>
              <span className="text-sm leading-6 text-[#66736D]">{brand.tagline}</span>
            </span>
          </Link>

          <nav aria-label="页脚产品导航" className="min-w-0">
            <ul className="flex flex-wrap items-center justify-start gap-x-1 gap-y-2 min-[900px]:justify-end">
              {footer.navigation.map((link) => (
                <li key={link.href} className="min-w-0">
                  <FooterLink href={link.href} label={link.label} />
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="grid gap-2 border-y border-[#DDD4C4] py-4 text-sm leading-6 text-[#66736D] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] min-[900px]:gap-8">
          <p className="max-w-2xl">{footer.description}</p>
          <p className="max-w-3xl min-[900px]:justify-self-end">{footer.disclaimer}</p>
        </div>

        <div className="flex flex-col items-center gap-2 text-xs leading-5 text-[#66736D] min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
          <span>{footer.copyright}</span>
          <a
            href={legal.icpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md px-1 py-0.5 font-medium transition hover:text-[#2F6F5E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A9C7B8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F4EC]"
          >
            {legal.icpNumber}
          </a>
        </div>
      </div>
    </footer>
  );
}
