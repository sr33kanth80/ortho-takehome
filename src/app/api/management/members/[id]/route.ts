import { memberInput, requireManagerRequest, routeError, updateMember } from "@/lib/governance/management";

export async function PATCH(request: Request, context: RouteContext<"/api/management/members/[id]">) {
  try {
    const manager = await requireManagerRequest(request);
    const input = memberInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "dynamicExecutionEnabled must be boolean" }, { status: 400 });
    const { id } = await context.params;
    const member = await updateMember(manager, id, input.data.dynamicExecutionEnabled);
    return member ? Response.json({ member }) : Response.json({ error: "Employee not found" }, { status: 404 });
  } catch (error) {
    return routeError(error);
  }
}
