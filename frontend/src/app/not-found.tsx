import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={Compass}
        title="That page does not exist"
        message="The link may be out of date. Every module is reachable from the navigation on the left."
        action={
          <Link href="/">
            <Button size="sm">Command Center</Button>
          </Link>
        }
      />
    </div>
  );
}
