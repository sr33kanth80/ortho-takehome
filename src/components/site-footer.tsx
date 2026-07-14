import Link from "next/link";

const footerLinks = [
  { href: "/use-cases", label: "Use cases" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function MeridianFooterDock() {
  return (
    <footer className="meridian-footer-dock" aria-label="Meridian footer">
      <div className="meridian-footer-dock-horizon" aria-hidden>
        <svg viewBox="0 0 1000 18" preserveAspectRatio="none">
          <path d="M0 18V14L94 8L166 13L264 4L356 13L458 7L554 14L665 5L754 12L842 7L924 13L1000 9V18Z" />
        </svg>
      </div>
      <div className="meridian-footer-dock-inner">
        <Link className="meridian-footer-dock-brand" href="/">
          <span aria-hidden>✦</span>
          Meridian
        </Link>
        <nav className="meridian-footer-dock-links" aria-label="Meridian information">
          {footerLinks.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function MeridianFooter() {
  return (
    <footer className="meridian-footer">
      <div className="meridian-footer-silhouette" aria-hidden>
        <svg viewBox="0 0 1200 118" preserveAspectRatio="none">
          <path
            className="meridian-horizon-far"
            d="M0 89L82 67L150 79L228 48L302 73L386 38L466 70L552 52L628 77L714 35L794 68L886 43L966 73L1052 55L1128 76L1200 58V118H0Z"
          />
          <path
            className="meridian-horizon-near"
            d="M0 101L72 91L132 96L205 79L276 94L352 72L429 91L510 81L582 98L662 70L740 92L821 76L902 98L980 82L1062 94L1133 78L1200 88V118H0Z"
          />
        </svg>
      </div>

      <div className="meridian-footer-inner">
        <div className="meridian-footer-brand">
          <span className="meridian-footer-mark" aria-hidden>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 1 Q13 11 23 12 Q13 13 12 23 Q11 13 1 12 Q11 11 12 1 Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <div>
            <p>Meridian</p>
            <span>Ask the real world.</span>
          </div>
        </div>

        <nav className="meridian-footer-links" aria-label="Meridian information">
          {footerLinks.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label === "Privacy" ? "Privacy policy" : link.label === "Terms" ? "Terms of use" : link.label}
            </Link>
          ))}
        </nav>

        <div className="meridian-footer-meta">
          <span>Live data research through Orthogonal</span>
          <span>Costs shown per tool call</span>
        </div>
      </div>
    </footer>
  );
}
