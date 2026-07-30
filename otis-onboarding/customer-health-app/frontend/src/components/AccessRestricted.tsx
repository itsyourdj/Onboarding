import { Link } from "react-router-dom";
import { Card } from "./ui";

export function AccessRestricted({ tabName }: { tabName: string }) {
  return (
    <Card className="max-w-3xl">
      <h1 className="text-xl font-semibold text-fg-primary">Access Denied</h1>
      <p className="mt-3 text-sm leading-6 text-fg-secondary">
        You don&apos;t have permission to view <span className="font-medium text-fg-primary">{tabName}</span>.
      </p>
      <p className="mt-2 text-sm leading-6 text-fg-secondary">Contact your tenant admin or the app owner to request access.</p>
      <div className="mt-5">
        <Link
          to="/"
          className="inline-flex items-center rounded-lg bg-action-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Go to Overview
        </Link>
      </div>
    </Card>
  );
}
