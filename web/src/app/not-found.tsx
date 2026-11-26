import Link from "next/link";

export default function NotFound() {
  return (
    <main className="content-page" id="main-content">
      <p className="eyebrow">Nothing on this plate</p>
      <h1 className="page-title">We couldn’t find that page.</h1>
      <p className="page-description">
        The address may have changed, or the page may no longer be available.
      </p>
      <Link className="button button-primary" href="/">
        Go to Snapfood
      </Link>
    </main>
  );
}
