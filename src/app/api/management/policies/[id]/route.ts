import { deletePolicy, requireManagerRequest, routeError } from "@/lib/governance/management";

export async function DELETE(request: Request, context: RouteContext<"/api/management/policies/[id]">) {
  try {
    const manager = await requireManagerRequest(request);
    const { id } = await context.params;
    const deleted = await deletePolicy(manager, id);
    return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Policy not found" }, { status: 404 });
  } catch (error) {
    return routeError(error);
  }
}
