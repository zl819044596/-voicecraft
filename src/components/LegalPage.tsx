import type { LegalDoc } from "@/lib/legal-content";

// 法律页共享外壳（terms / privacy / cookies）。Server component。
// 内容来自 src/lib/legal-content.ts（受控静态 HTML，无用户输入）。
// 样式类见 src/app/marketing.css（.legal-wrap / .legal-meta / .plain-table / .note）。

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className="legal-wrap">
      <div className="kicker" style={{ marginBottom: 10 }}>
        {doc.kicker}
      </div>
      <h1>{doc.title}</h1>
      <p className="legal-meta">{doc.meta}</p>
      {doc.placeholder ? (
        <p className="muted" style={{ fontSize: 13 }}>
          {doc.placeholder}
        </p>
      ) : null}

      {doc.blocks.map((block, i) => (
        <section key={i}>
          <h2>{block.h}</h2>
          {block.html?.map((h, j) => (
            <p key={j} dangerouslySetInnerHTML={{ __html: h }} />
          ))}
          {block.ul ? (
            <ul>
              {block.ul.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
              ))}
            </ul>
          ) : null}
          {block.table ? (
            <table className="plain-table">
              <thead>
                <tr>
                  {block.table.head.map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.table.rows.map((row, j) => (
                  <tr key={j}>
                    {row.map((cell, k) => (
                      <td key={k} dangerouslySetInnerHTML={{ __html: cell }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {block.tail?.map((t, j) => (
            <p key={j} dangerouslySetInnerHTML={{ __html: t }} />
          ))}
        </section>
      ))}

      {doc.note ? <span className="note">› {doc.note}</span> : null}
    </main>
  );
}
