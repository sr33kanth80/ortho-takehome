import type { Metadata } from "next";
import { InfoPageShell } from "@/components/info-page-shell";

export const metadata: Metadata = {
  title: "Terms of Use | Meridian",
  description: "The terms that govern access to and use of Meridian.",
};

export default function TermsPage() {
  return (
    <InfoPageShell>
      <article className="info-document">
        <header className="info-document-header">
          <p className="info-document-kicker">Meridian / Legal</p>
          <h1>Terms of use</h1>
          <p className="info-document-deck">
            These terms set the ground rules for using Meridian responsibly, especially when live data and paid
            third-party tools are involved.
          </p>
          <p className="info-document-date">Effective July 13, 2026</p>
        </header>

        <div className="info-document-callout">
          <span>The practical rule</span>
          <p>
            Use Meridian for legitimate research, respect the people and providers behind the data, and verify
            important results before acting on them.
          </p>
        </div>

        <section>
          <h2>1. Acceptance</h2>
          <p>
            By accessing or using Meridian, you agree to these Terms of Use and the Privacy Policy. If you do not
            agree, do not use the service. If you use Meridian for an organization, you represent that you have
            authority to accept these terms on its behalf.
          </p>
        </section>

        <section>
          <h2>2. The service</h2>
          <p>
            Meridian is an AI-assisted research interface that can call paid third-party APIs through Orthogonal.
            It may search the web, retrieve company or contact information, discover available APIs, and summarize
            the results. Features, providers, prices, and availability may change.
          </p>
        </section>

        <section>
          <h2>3. Tool costs and limits</h2>
          <p>
            Tool calls can incur real charges against the deployment operator&apos;s Orthogonal account. Meridian
            may enforce per-turn or per-session limits, cache identical requests, decline an expensive call, or
            require confirmation. Displayed prices and totals are estimates or provider-reported amounts and may
            not include every cost, including model inference.
          </p>
          <p>
            You may not bypass limits, automate abusive request volume, probe credentials, or use the service in a
            way intended to exhaust credits or infrastructure.
          </p>
        </section>

        <section>
          <h2>4. Acceptable use</h2>
          <p>You agree not to use Meridian to:</p>
          <ul>
            <li>Break the law, violate sanctions, or infringe another person&apos;s rights.</li>
            <li>Harass, stalk, discriminate against, or unlawfully profile a person.</li>
            <li>Obtain or use personal information without an appropriate legal basis or authorization.</li>
            <li>Make high-impact employment, credit, housing, insurance, legal, or medical decisions without human review.</li>
            <li>Introduce malware, interfere with the service, scrape it at abusive volume, or attempt unauthorized access.</li>
            <li>Misrepresent AI-generated or third-party data as verified fact when it has not been checked.</li>
          </ul>
        </section>

        <section>
          <h2>5. Your content and responsibilities</h2>
          <p>
            You retain rights in the prompts and material you submit. You grant Meridian and its service providers
            permission to process that material only as needed to operate, secure, and support the service. You are
            responsible for ensuring you have the right to submit the content and request the associated lookup.
          </p>
        </section>

        <section>
          <h2>6. Third-party data and services</h2>
          <p>
            Meridian depends on Orthogonal, model providers, and underlying data APIs. Their responses may be
            inaccurate, incomplete, stale, unavailable, or subject to separate restrictions. Meridian does not
            endorse or control third-party content and does not guarantee that a particular endpoint will remain
            available.
          </p>
        </section>

        <section>
          <h2>7. No professional advice</h2>
          <p>
            Meridian provides research assistance, not legal, financial, medical, employment, or other
            professional advice. Do not rely on an answer as the sole basis for a high-stakes decision.
          </p>
        </section>

        <section>
          <h2>8. Availability and changes</h2>
          <p>
            The service may be changed, suspended, rate-limited, or discontinued at any time. Access may be
            restricted when necessary to protect users, providers, credits, or infrastructure.
          </p>
        </section>

        <section>
          <h2>9. Disclaimers and limitation of liability</h2>
          <p>
            Meridian is provided on an “as is” and “as available” basis to the extent permitted by law, without
            warranties of accuracy, fitness, non-infringement, or uninterrupted availability. To the maximum extent
            permitted by law, the service operator is not liable for indirect, incidental, special, consequential,
            or exemplary damages arising from use of the service or reliance on third-party data.
          </p>
        </section>

        <section>
          <h2>10. Changes and contact</h2>
          <p>
            These terms may be updated as Meridian evolves. Continued use after updated terms take effect means you
            accept the revised terms. Questions should be sent through the support channel provided with your
            Meridian or Orthogonal access.
          </p>
        </section>
      </article>
    </InfoPageShell>
  );
}
