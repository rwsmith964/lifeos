import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Account deleted — ${APP_NAME}`,
};

export default function AccountDeletedPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-foreground">
      <h1 className="mb-2 text-2xl font-semibold">Your account has been deleted</h1>
      <p className="mb-6 text-muted-foreground">
        Your login and household data have been permanently removed. If you change your mind,
        you&apos;re welcome to create a new account any time.
      </p>
      <p>
        <Link href="/signup" className="underline">
          Create a new account
        </Link>
      </p>
    </div>
  );
}
