"use client";

// Task detail — PIPELINE_TASK_12. Thin route that renders the shared WizardPage
// pinned to the requested task. WizardPage performs all data loading (task
// detail, derived project, model configs) and the 9-step rail + editors.

import { useParams } from "next/navigation";
import { WizardPage } from "@/components/app/wizard/WizardPage";

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  return <WizardPage taskId={params.id} />;
}
