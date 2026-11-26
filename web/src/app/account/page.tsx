import type { Metadata } from "next";
import { AccountPanel } from "@/components/account/account-panel";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className="content-page" id="main-content">
      <p className="eyebrow">A little more personal</p>
      <h1 className="page-title">Your Snapfood account.</h1>
      <AccountPanel />
    </main>
  );
}
