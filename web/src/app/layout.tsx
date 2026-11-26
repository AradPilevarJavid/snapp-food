import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/components/providers";
import { RouteAnnouncer } from "@/components/route-announcer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Snapfood | Neighborhood restaurants, ready for pickup",
    template: "%s | Snapfood",
  },
  description:
    "Discover neighborhood restaurants, order pickup, and pay the restaurant directly.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <RouteAnnouncer />
          <div className="site-shell">
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <SiteHeader />
            {children}
            <footer className="site-footer">
              <Link className="brand brand-footer" href="/">
                <span className="brand-mark" aria-hidden="true">
                  s
                </span>
                <span>snapfood</span>
              </Link>
              <p>Good food brings us together.</p>
              <span>Pickup orders · Pay at the restaurant</span>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
