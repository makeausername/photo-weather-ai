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
        "inline-flex min-w-0 rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        className,
      )}
    >
      {label}
    </Link>
  );
}

type FooterLinkGroupProps = {
  readonly title: string;
  readonly links: readonly FooterLinkProps[];
};

function FooterLinkGroup({ title, links }: FooterLinkGroupProps) {
  return (
    <section className="min-w-0">
      <h2 className="text-sm font-bold text-card-foreground">{title}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 min-[900px]:grid-cols-1">
        {links.map((link) => (
          <li key={link.href} className="min-w-0">
            <FooterLink
              href={link.href}
              label={link.label}
              className="px-1 py-0.5 text-sm leading-6 text-muted-foreground hover:text-primary"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SiteFooter() {
  const { brand, footer, legal } = siteConfig;
  const navigationGroups = [
    {
      title: footer.primaryNavigationTitle,
      links: footer.mainNavigation,
    },
    {
      title: footer.legalNavigationTitle,
      links: footer.legalNavigation,
    },
  ] as const;

  return (
    <footer
      id="site-footer"
      className="border-t border-border bg-card text-foreground shadow-[inset_0_1px_0_rgb(255_253_247_/_0.78)]"
    >
      <div className="mx-auto grid w-full max-w-[1560px] gap-6 px-[clamp(24px,4vw,72px)] py-8 sm:py-9 lg:py-10">
        <div className="grid gap-7 min-[900px]:grid-cols-[minmax(300px,1fr)_minmax(360px,0.8fr)] min-[900px]:items-start">
          <div className="grid max-w-2xl gap-4">
            <Link
              href="/"
              className="group flex max-w-xl items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card shadow-sm">
                <img src="/brand-mark.svg" alt="" className="h-9 w-9" aria-hidden="true" />
              </span>
              <span className="grid min-w-0 gap-1">
                <span className="text-lg font-bold leading-tight tracking-normal text-card-foreground sm:text-xl">
                  {brand.name}
                </span>
                <span className="text-sm leading-6 text-muted-foreground">{brand.tagline}</span>
              </span>
            </Link>

            <div className="grid gap-3 text-sm leading-6">
              <p className="max-w-xl text-muted-foreground">{footer.description}</p>
              <p className="max-w-2xl rounded-lg border border-border bg-muted/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {footer.disclaimer}
              </p>
            </div>
          </div>

          <nav
            aria-label="页脚导航"
            className="grid min-w-0 gap-6 border-t border-border pt-5 sm:grid-cols-2 min-[900px]:border-t-0 min-[900px]:pt-0"
          >
            {navigationGroups.map((group) => (
              <FooterLinkGroup key={group.title} title={group.title} links={group.links} />
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 text-xs leading-5 text-muted-foreground min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
          <span className="text-center min-[760px]:text-left">{footer.copyright}</span>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 min-[760px]:justify-end">
            {footer.legalNavigation.map((link) => (
              <FooterLink
                key={link.href}
                href={link.href}
                label={link.label}
                className="px-1 py-0.5 font-medium hover:text-primary"
              />
            ))}
            <a
              href={legal.icpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-md px-1 py-0.5 font-medium text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {legal.icpNumber}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
