import { Suspense } from "react";
import type { Metadata } from "next";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";

export const metadata: Metadata = {
  title: "Restaurant manager",
  robots: { index: false, follow: false },
};

export default function ManagerPage() {
  return (
    <main className="content-page" id="main-content">
      <p className="eyebrow">For restaurant teams</p>
      <h1 className="page-title">Your kitchen, all in one place.</h1>
      <Suspense
        fallback={
          <p className="notice-text" role="status">
            Loading restaurant access…
          </p>
        }
      >
        <ManagerDashboard />
      </Suspense>
    </main>
  );
}
