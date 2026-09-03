import { AlertTriangle, Inbox, Loader2, type LucideIcon } from "lucide-react";

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 py-8 text-sm text-zinc-500 ${className ?? ""}`}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message, className }: { message: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2.5 text-sm text-rose-400 ${className ?? ""}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}

export function EmptyState({
  message,
  icon: Icon = Inbox,
  className,
}: {
  message: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-zinc-500 ${className ?? ""}`}>
      <Icon className="h-5 w-5 text-zinc-600" aria-hidden />
      {message}
    </div>
  );
}
