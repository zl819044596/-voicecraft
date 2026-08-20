import Link from "next/link";

// Primary CTA used across marketing pages. Points at the app entry point
// (/app). Task 9: purple brand accent + dark theme tokens.

export function CtaButton({
  children,
  href = "/app",
  secondary = false,
}: {
  children: React.ReactNode;
  href?: string;
  secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        secondary
          ? "inline-block whitespace-nowrap rounded-xl border border-border px-6 py-3 text-sm font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary"
          : "inline-block whitespace-nowrap rounded-xl bg-brand px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-hover"
      }
    >
      {children}
    </Link>
  );
}
