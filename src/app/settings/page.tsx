import { redirect } from "next/navigation";

// 旧 /settings 入口已统一到应用区（design-spec §3.3）：
// - /settings → /app/settings（用户设置 / 偏好）
// - /settings/models 已删除，模型配置收敛到 /app/models
// 这里直接重定向，避免两套入口。
export default function SettingsPage() {
  redirect("/app/settings");
}
