import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Terms of Use — ${APP_NAME}`,
};

const LAST_UPDATED = "November 11, 2026";
const CONTACT_EMAIL = "rwsmith964@gmail.com";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-foreground">
      <p className="mb-8">
        <Link href="/" className="underline">
          ← Back to {APP_NAME}
        </Link>
      </p>

      <h1 className="mb-2 text-2xl font-semibold">Terms of Use</h1>
      <p className="mb-8 text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <p className="mb-6">
        By creating an account or using {APP_NAME} you agree to these terms. If you
        don&apos;t agree, please don&apos;t use the app.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Your account</h2>
      <p className="mb-6">
        You must be at least 18 to create an account. Keep your sign-in details
        private and tell us if you think someone else has used your account. You are
        responsible for what happens under your account and for the information you
        and the people you invite add to your household.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Information about other people</h2>
      <p className="mb-6">
        {APP_NAME} lets you keep notes about family and friends, including children.
        Only add information you are entitled to share, and only add details about a
        child if you are their parent or legal guardian. When you link households or
        send an invitation, you decide what is shared; please respect other
        people&apos;s privacy.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">AI suggestions</h2>
      <p className="mb-6">
        {APP_NAME} uses AI to turn your input into events, lists and suggestions. AI
        can be wrong. Check dates, times, addresses and anything else that matters
        before you rely on it, especially for custody schedules, medical
        appointments, travel and deadlines. {APP_NAME} is a planning aid, not a
        substitute for your own judgment or for legal, medical or financial advice.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Acceptable use</h2>
      <p className="mb-6">
        Don&apos;t use {APP_NAME} to break the law, to harass or track anyone, to
        upload anything unlawful, or to interfere with the service or other
        people&apos;s accounts.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Your content</h2>
      <p className="mb-6">
        The information you add stays yours. You give us permission to store and
        process it only to run the app for you, as described in our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        . You can delete your account and data at any time in Settings.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Availability and changes</h2>
      <p className="mb-6">
        We work to keep {APP_NAME} running but can&apos;t promise it will always be
        available or error-free. We may change or end features, and we may suspend
        accounts that break these terms. We&apos;ll update this page when the terms
        change.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Liability</h2>
      <p className="mb-6">
        {APP_NAME} is provided &ldquo;as is.&rdquo; To the extent the law allows, we
        aren&apos;t liable for indirect or consequential losses, such as a missed
        event or reminder, and our total liability is limited to the amount you paid
        for the app in the previous 12 months.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Contact</h2>
      <p className="mb-6">
        Questions about these terms can be sent to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
