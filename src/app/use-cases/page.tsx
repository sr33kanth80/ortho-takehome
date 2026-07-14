import type { Metadata } from "next";
import Link from "next/link";
import { InfoPageShell } from "@/components/info-page-shell";
import { UseCasesCatalog } from "@/components/use-cases-catalog";

export const metadata: Metadata = {
  title: "Use Cases | Meridian",
  description: "Repeatable live-data research workflows for companies, markets, contacts, news, and verification.",
};

export default function UseCasesPage() {
  return (
    <InfoPageShell>
      <div className="use-cases-page">
        <header className="use-cases-hero">
          <p className="info-document-kicker">Meridian / Field guide</p>
          <h1>Research recipes for the real world.</h1>
          <p>
            Meridian combines an AI conversation with live, paid data tools. Pick a repeatable workflow or start
            with your own question; every lookup stays visible in the work trace.
          </p>
          <Link href="/" className="use-cases-primary-link">
            Open Meridian <span aria-hidden>→</span>
          </Link>
        </header>

        <UseCasesCatalog />

        <section className="use-cases-method">
          <div>
            <p className="info-document-kicker">How a recipe runs</p>
            <h2>Instructions are only useful when the runtime can show its work.</h2>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Gather the missing ingredient.</strong>
                <p>Meridian asks for the company, person, topic, or claim needed to begin.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Select the least expensive useful tool.</strong>
                <p>Common tasks use tested tools; unusual work can search the wider Orthogonal catalog.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Return the answer with a visible trace.</strong>
                <p>Inputs, outputs, failures, and attributed tool costs stay attached to the conversation.</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </InfoPageShell>
  );
}
