import { getMission, getMissionExportRows } from "@/lib/prospecting/store";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";

function safeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : JSON.stringify(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function GET(request: Request, context: RouteContext<"/api/prospecting/missions/[id]/export">) {
  try {
    const user = await requireProspectingUser(request);
    const { id } = await context.params;
    const [mission, accounts] = await Promise.all([getMission(user, id), getMissionExportRows(user, id)]);
    const headers = ["Account", "Domain", "Website", "Industry", "Location", "Employees", "Fit score", "Signal score", "Overall score", "Status", "Why now", "Rationale", "Outreach angle", "Contact", "Title", "Email", "Email status", "Phone", "LinkedIn", "Evidence"];
    const rows = accounts.map((account) => {
      const contact = account.contacts[0];
      return [
        account.name, account.domain, account.website, account.industry, account.location, account.employeeCount,
        account.fitScore, account.signalScore, account.overallScore, account.status, account.whyNow, account.rationale,
        account.outreachAngle, contact?.fullName, contact?.title, contact?.email, contact?.emailStatus,
        contact?.phone, contact?.linkedinUrl, account.evidence,
      ].map(safeCell).join(",");
    });
    const csv = `\uFEFF${headers.map(safeCell).join(",")}\r\n${rows.join("\r\n")}`;
    const filename = `${mission.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "prospects"}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
