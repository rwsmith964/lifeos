import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
};

const LAST_UPDATED = "August 31, 2026";
const CONTACT_EMAIL = "rwsmith964@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-foreground">
      <p className="mb-8">
        <Link href="/" className="underline">
          ← Back to {APP_NAME}
        </Link>
      </p>

      <h1 className="mb-2 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mb-8 text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <p className="mb-6">
        {APP_NAME} is a personal and family organizing app. This policy explains what
        information {APP_NAME} collects, how it is used, and who it is shared with.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Information we collect</h2>
      <ul className="mb-6 list-disc space-y-2 pl-5">
        <li>
          <strong>Account information:</strong> the email address and password you use
          to sign in.
        </li>
        <li>
          <strong>Household and family information you add:</strong> names, contact
          details, relationships, notes, and — where you choose to enter it — schedules,
          custody arrangements, and locations for people in your household, including
          children.
        </li>
        <li>
          <strong>Calendar and activity information:</strong> events, activities, and
          locations you create or that {APP_NAME} suggests based on your household&apos;s
          data.
        </li>
        <li>
          <strong>Content you submit for AI features:</strong> notes and prompts you
          write (for example, a &ldquo;brain dump&rdquo;) that {APP_NAME} uses to generate a daily
          brief, gift ideas, or activity suggestions.
        </li>
      </ul>

      <h2 className="mb-2 mt-8 text-lg font-medium">How we use this information</h2>
      <p className="mb-6">
        We use the information above solely to provide {APP_NAME}&apos;s features to you and
        your household: showing your calendar and daily brief, generating AI-assisted
        suggestions, sending you notifications you&apos;ve asked for (such as childcare
        request emails), and keeping your household&apos;s data separate from every other
        household&apos;s data.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Children&apos;s information</h2>
      <p className="mb-6">
        {APP_NAME} lets you record information about children in your household — for
        example, a custody schedule or an activity location — so the app can help you
        plan around it. This information is entered by you, a parent or guardian using
        the app, not collected directly from a child. Where {APP_NAME} sends household
        data to an AI provider to generate a suggestion (see below), children&apos;s names
        and precise locations are replaced with a generic placeholder before the request
        is sent, and the real name is only reattached afterward, on your device.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Who we share information with</h2>
      <p className="mb-4">
        We do not sell your information. We share it only with the service providers
        that {APP_NAME} is built on, strictly to operate the app:
      </p>
      <ul className="mb-6 list-disc space-y-2 pl-5">
        <li>
          <strong>Supabase</strong> — hosts our database and handles account
          sign-in. All of your household&apos;s data is stored here, isolated from other
          households.
        </li>
        <li>
          <strong>Anthropic (Claude API)</strong> — generates AI features like your
          daily brief and suggestions, using the redacted, placeholder-substituted
          content described above.
        </li>
        <li>
          <strong>Resend</strong> — delivers transactional emails you trigger, such as
          a childcare request or an invitation to join your household.
        </li>
        <li>
          <strong>Vercel</strong> — hosts the {APP_NAME} web application itself.
        </li>
      </ul>

      <h2 className="mb-2 mt-8 text-lg font-medium">Data retention and deletion</h2>
      <p className="mb-6">
        Your data is retained for as long as your account is active. To request
        deletion of your account and all associated household data, contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Security</h2>
      <p className="mb-6">
        Data is transmitted over HTTPS and stored with row-level security policies that
        restrict every household&apos;s data to that household&apos;s own members.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-medium">Contact</h2>
      <p className="mb-6">
        Questions about this policy or your data can be sent to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
