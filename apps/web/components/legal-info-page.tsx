import { PublicShell } from "./public-shell";
import { Card, PageHeader } from "./ui";

type LegalInfoSection = {
  readonly title: string;
  readonly text: string;
  readonly href?: string;
  readonly linkLabel?: string;
};

type LegalInfoPageProps = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly sections: readonly LegalInfoSection[];
};

export function LegalInfoPage({ eyebrow, title, description, sections }: LegalInfoPageProps) {
  return (
    <PublicShell contentClassName="grid gap-5 pb-14">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <section className="grid gap-3 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="p-5">
            <h2 className="text-base font-bold text-card-foreground">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.text}</p>
            {section.href ? (
              <a
                className="mt-3 inline-block break-all text-sm font-semibold text-primary underline underline-offset-4"
                href={section.href}
              >
                {section.linkLabel ?? "联系我们"}
              </a>
            ) : null}
          </Card>
        ))}
      </section>
    </PublicShell>
  );
}
