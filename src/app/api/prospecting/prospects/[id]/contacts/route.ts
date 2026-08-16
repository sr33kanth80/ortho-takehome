import { runContactWaterfall } from "@/lib/prospecting/agent";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";

export const maxDuration = 120;

export async function POST(request: Request, context: RouteContext<"/api/prospecting/prospects/[id]/contacts">) {
  try {
    const user = await requireProspectingUser(request);
    const { id } = await context.params;
    return Response.json({ result: await runContactWaterfall(user, id) });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
