import { App } from "@/components/app";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const conversation = typeof params.conversation === "string" ? params.conversation : undefined;
  const recipe = typeof params.recipe === "string" ? params.recipe : undefined;
  const user = await getCurrentUser();

  return <App initialConversationId={conversation} initialRecipe={recipe} user={user} authConfigured={isAuthConfigured()} />;
}
