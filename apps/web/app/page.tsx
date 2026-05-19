export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">风光天气 AI</p>
        <h1>输入目的地，判断是否值得出发拍摄</h1>
        <p className="lede">
          综合云层、湿度、风速、海拔、地形、月相与银河窗口，辅助判断朝霞、晚霞、云海、星空和银河拍摄机会。
        </p>
        <form className="homeSearch" role="search">
          <input placeholder="请输入景区、城市或机位，例如：黄山光明顶" aria-label="目的地" />
          <button type="button">搜索</button>
        </form>
      </section>
    </main>
  );
}
