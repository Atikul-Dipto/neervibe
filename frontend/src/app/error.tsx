"use client";

import { useEffect } from "react";
import { Bug } from "lucide-react";
import { EmptyState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";

/** Route-level error boundary: the shell stays up, the page recovers. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
     
    console.error("[page error]", error);
  }, [error]);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={Bug}
        title="This page hit an error"
        message={error.message || "Something went wrong rendering this module."}
        action={
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
