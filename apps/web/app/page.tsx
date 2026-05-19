export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Foundation preview</p>
        <h1>Photo Weather AI</h1>
        <p className="lede">
          A self-hostable SaaS foundation for commercial landscape photography weather decisions.
        </p>
        <div className="statusGrid" aria-label="Project foundation status">
          <span>Provider interfaces</span>
          <span>Mock-safe tests</span>
          <span>Docker skeleton</span>
          <span>Admin config contracts</span>
        </div>
      </section>
    </main>
  );
}
