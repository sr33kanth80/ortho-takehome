import { runProspectMission } from "@/lib/prospecting/agent";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";

export const maxDuration = 120;

export async function POST(request: Request, context: RouteContext<"/api/prospecting/missions/[id]/run">) {
  try {
    const user = await requireProspectingUser(request);
    const { id } = await context.params;
    return Response.json({ result: await runProspectMission(user, id) });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
