"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { TOOL_BY_SLUG } from "@/lib/tools-config";
import { TOOL_COMPONENTS } from "@/components/tools/Tools";

export default function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const tool = TOOL_BY_SLUG[slug];
  if (!tool) notFound();

  const Component = TOOL_COMPONENTS[slug];
  if (!Component) notFound();

  return <Component />;
}
