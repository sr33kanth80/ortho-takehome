import Link from "next/link";

export function ReadmeButton() {
  return (
    <Link href="/readme" className="meridian-readme-button" aria-label="Open project README">
      README <span aria-hidden>→</span>
    </Link>
  );
}
