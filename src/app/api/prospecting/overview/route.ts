import { getProspectingOverview } from "@/lib/prospecting/store";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";

export async function GET(request: Request) {
  try {
    const user = await requireProspectingUser(request);
    const missionId = new URL(request.url).searchParams.get("mission") ?? undefined;
    return Response.json(await getProspectingOverview(user, missionId));
  } catch (error) {
    return prospectingRouteError(error);
  }
}
