import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProspectingOverview } from "@/lib/prospecting/store";
import { ProspectingDesk, type ProspectingView } from "@/components/prospecting-desk";

export default async function ProspectingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const overview = await getProspectingOverview(user);
  const initial = JSON.parse(JSON.stringify(overview)) as ProspectingView;
  return <ProspectingDesk initial={initial} userEmail={user.email} />;
}
