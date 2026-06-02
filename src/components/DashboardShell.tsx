"use client";

import { useIsMobile } from "@/lib/useIsMobile";

export function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div style={{ minHeight: "100vh", background: "#fafbfc" }}>
        {sidebar}
        <div>{children}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {sidebar}
      <div style={{ flex: 1, minWidth: 0, background: "#fafbfc" }}>{children}</div>
    </div>
  );
}
