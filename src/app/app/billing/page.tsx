import { redirect } from "next/navigation";

/** 计费未上线：并入账户页 */
export default function BillingPage() {
  redirect("/app/settings");
}
