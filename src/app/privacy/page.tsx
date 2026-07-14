import type { Metadata } from "next";
import { InfoPageShell } from "@/components/info-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Meridian",
  description: "How Meridian handles prompts, conversation history, live-data requests, and voice recordings.",
};

export default function PrivacyPage() {
  return (
    <InfoPageShell>
      <article className="info-document">
        <header className="info-document-header">
          <p className="info-document-kicker">Meridian / Legal</p>
          <h1>Privacy policy</h1>
          <p className="info-document-deck">
            Meridian is built to make live-data research inspectable. This policy explains what the service
            processes, which providers receive data, and what you can remove.
          </p>
          <p className="info-document-date">Effective July 13, 2026</p>
        </header>

        <div className="info-document-callout">
          <span>The short version</span>
          <p>
            Your prompts and tool inputs are used to answer your request. Live lookups are sent through
            Orthogonal and the relevant API provider. Do not submit sensitive personal data unless you are
            authorized to use it.
          </p>
        </div>

        <section>
          <h2>1. Information Meridian processes</h2>
          <p>Depending on the features you use, Meridian processes:</p>
          <ul>
            <li>Prompts, follow-up messages, and files or identifiers you include in a request.</li>
            <li>Tool inputs and outputs, including company domains, search terms, and profile URLs.</li>
            <li>Conversation IDs, message timestamps, tool-call status, and attributed tool costs.</li>
            <li>
              Voice recordings submitted in push-to-talk mode, plus the resulting transcript and spoken answer.
            </li>
            <li>Basic operational information produced by the hosting platform, such as request and error logs.</li>
          </ul>
        </section>

        <section>
          <h2>2. How the information is used</h2>
          <p>Meridian uses this information to:</p>
          <ul>
            <li>Generate answers, select appropriate data tools, and continue a conversation.</li>
            <li>Retrieve requested information from Orthogonal and its underlying API providers.</li>
            <li>Display tool activity and cost information, enforce configured limits, and avoid duplicate calls.</li>
            <li>Persist, retrieve, and delete conversation history when storage is configured.</li>
            <li>Diagnose failed requests and maintain the reliability and security of the service.</li>
          </ul>
        </section>

        <section>
          <h2>3. Service providers and data sharing</h2>
          <p>
            Meridian does not sell personal information. It sends the minimum request data needed to providers
            involved in completing your request:
          </p>
          <ul>
            <li>
              <strong>Orthogonal</strong>, which routes live-data and default model requests.
            </li>
            <li>
              <strong>Underlying API providers</strong>, such as search, company-enrichment, contact, or speech
              providers selected for a tool call.
            </li>
            <li>
              <strong>Optional model providers</strong>, if the deployment is configured to use OpenAI or
              Anthropic directly.
            </li>
            <li>
              <strong>Infrastructure providers</strong>, including the application host and configured Postgres
              database provider.
            </li>
          </ul>
          <p>
            Each provider may process data under its own terms and privacy policy. The tool trace helps you see
            which capability was used for a request.
          </p>
        </section>

        <section>
          <h2>4. Storage and retention</h2>
          <p>
            Conversations are stored in the configured database and remain available until they are deleted or the
            deployment operator applies a retention policy. Meridian requires that database to enable accounts and
            saved history.
          </p>
          <p>
            Push-to-talk audio is kept only long enough for transcription. The current implementation deletes a
            recording after transcription and automatically expires unfetched audio after approximately 90
            seconds. Voice transcripts may remain in the temporary voice session while it is active.
          </p>
        </section>

        <section>
          <h2>5. Your choices</h2>
          <ul>
            <li>You can delete individual conversations from the Meridian sidebar.</li>
            <li>You can choose not to use voice mode or contact-enrichment tools.</li>
            <li>You should remove confidential or unnecessary personal information before submitting a prompt.</li>
          </ul>
        </section>

        <section>
          <h2>6. Security and data accuracy</h2>
          <p>
            Meridian uses server-side credentials and does not intentionally expose provider keys to the browser.
            No internet service is completely secure, and third-party data may be incomplete, outdated, or
            incorrect. Verify important results before relying on them.
          </p>
        </section>

        <section>
          <h2>7. Children and sensitive uses</h2>
          <p>
            Meridian is not directed to children under 18. Do not use the service to collect personal information
            about minors, conduct unlawful surveillance, or make solely automated decisions with significant
            legal or similarly important effects.
          </p>
        </section>

        <section>
          <h2>8. Changes and contact</h2>
          <p>
            This policy may change as Meridian adds providers or product features. The effective date above will
            be updated when material changes are made. Questions should be sent through the support channel
            provided with your Meridian or Orthogonal access.
          </p>
        </section>
      </article>
    </InfoPageShell>
  );
}
