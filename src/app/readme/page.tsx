import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InfoPageShell } from "@/components/info-page-shell";

export const metadata: Metadata = {
  title: "README | Meridian",
  description: "The current architecture, engineering decisions, limitations, and project timeline for Meridian.",
};

export default async function ReadmePage() {
  const markdown = await readFile(path.join(process.cwd(), "README.md"), "utf8");

  return (
    <InfoPageShell>
      <div className="readme-page">
        <div className="readme-page-label">
          <span>Repository document</span>
          <span>Rendered directly from README.md</span>
        </div>
        <article className="readme-document">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </div>
    </InfoPageShell>
  );
}
