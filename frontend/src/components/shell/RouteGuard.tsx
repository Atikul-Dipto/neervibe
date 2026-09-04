"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ROLE_BY_KEY, roleAllows } from "@/config/roles";
import { useOpsStore } from "@/data/ops";
import { EmptyState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";

/** Blocks modules the session role cannot open. See config/roles.ts. */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const role = useOpsStore((s) => s.role);
  if (roleAllows(role, pathname)) return <>{children}</>;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={ShieldAlert}
        title="This module is outside your role"
        message={`Your session role is ${ROLE_BY_KEY[role].name}. Ask an administrator for access, or switch role on the Administration page.`}
        action={
          <div className="flex gap-2">
            <Link href="/">
              <Button variant="secondary" size="sm">Command Center</Button>
            </Link>
            <Link href="/admin">
              <Button size="sm">Switch role</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
