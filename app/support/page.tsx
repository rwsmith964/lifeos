import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Support — ${APP_NAME}`,
};

const CONTACT_EMAIL = "rwsmith964@gmail.com";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-foreground">
      <p className="mb-8">
        <Link href="/" className="underline">
          ← Back to {APP_NAME}
        </Link>
      </p>

      <h1 className="mb-2 text-2xl font-semibold">Support</h1>
      <p className="mb-8 text-muted-foreground">
        Get help with {APP_NAME}, report a problem, or ask a question.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Contact us</h2>
      <p className="mb-6">
        For any question, bug report, or account request (including account or data
        deletion), email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        . We aim to respond within a few days.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Common questions</h2>

      <h3 className="mb-1 mt-6 font-medium">How do I invite someone to my household?</h3>
      <p className="mb-4">
        From the People page, use the invite option to send an invitation to another
        household member&apos;s email address. They&apos;ll receive a link to join your
        household.
      </p>

      <h3 className="mb-1 mt-6 font-medium">Can I use Face ID / fingerprint unlock?</h3>
      <p className="mb-4">
        Yes — on the mobile app, enable biometric unlock from the Settings page for
        faster, secure access.
      </p>

      <h3 className="mb-1 mt-6 font-medium">How do I delete my account or data?</h3>
      <p className="mb-4">
        Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>{" "}
        with your account&apos;s email address and we will delete your account and all
        associated household data.
      </p>

      <p className="mt-10 text-muted-foreground">
        See also our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
