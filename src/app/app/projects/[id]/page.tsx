"use client";

// Project detail — PIPELINE_TASK_12. Thin wrapper around the shared WizardPage.
// V2 无 GET /api/projects/:id 端点（API 缺口——见 P6 复查缺口清单），WizardPage
// 通过 GET /api/tasks?project_id=… 取该项目最新任务；这里只把 projectId 透传进去。
// All wizard logic (data loading, 9-step rail, node editors, regenerate modal,
// run/continue, script versions, candidates, BGM, subtitle rhythm) lives in
// WizardPage and is shared with the /app/tasks/[id] route.

import { useParams } from "next/navigation";
import { WizardPage } from "@/components/app/wizard/WizardPage";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return <WizardPage projectId={id} />;
}
