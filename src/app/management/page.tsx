import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getManagementOverview } from "@/lib/governance/management";
import { ManagementConsole, type ManagementView } from "@/components/management-console";

export default async function ManagementPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "manager") redirect("/");
  const overview = await getManagementOverview(user);
  const initial = JSON.parse(JSON.stringify(overview)) as ManagementView;
  return <ManagementConsole initial={initial} managerEmail={user.email} />;
}
