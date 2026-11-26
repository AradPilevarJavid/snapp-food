"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function RouteAnnouncer() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    setAnnouncement(document.title);
  }, [pathname]);

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </p>
  );
}
