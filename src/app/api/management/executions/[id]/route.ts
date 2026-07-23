import { getExecutionDetail, requireManagerRequest, routeError } from "@/lib/governance/management";

export async function GET(request: Request, context: RouteContext<"/api/management/executions/[id]">) {
  try {
    const manager = await requireManagerRequest(request);
    const { id } = await context.params;
    const execution = await getExecutionDetail(manager, id);
    return execution ? Response.json({ execution }) : Response.json({ error: "Execution not found" }, { status: 404 });
  } catch (error) {
    return routeError(error);
  }
}
