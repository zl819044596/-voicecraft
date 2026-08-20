import Link from "next/link";
import { TOOL_BY_SLUG } from "@/lib/site-data";

// Related Tools interlink block used at the bottom of tool/scenario pages.
// Receives tool slugs; only links to tools that actually exist.

export function RelatedTools({ slugs }: { slugs: string[] }) {
  const tools = slugs
    .map((s) => TOOL_BY_SLUG[s])
    .filter((t): t is (typeof TOOL_BY_SLUG)[string] => Boolean(t));

  if (tools.length === 0) return null;

  return (
    <section className="mt-12 border-t border-[#e3ddd2] pt-8">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#7d766b]">
        Related Tools
      </h2>
      <ul className="mt-4">
        {tools.map((t) => (
          <li
            key={t.slug}
            className="flex items-baseline gap-3 border-b border-[#e3ddd2] py-3 first:border-t"
          >
            <Link
              href={`/tools/${t.slug}`}
              className="text-[15px] text-[#1d1a16] hover:text-[#c2491d]"
            >
              {t.name}
            </Link>
            <span className="font-mono text-[11px] text-[#7d766b]">/tools/{t.slug}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
