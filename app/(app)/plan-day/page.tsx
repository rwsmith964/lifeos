import { Breadcrumb } from "@/components/nav/breadcrumb";
import { PlanDayClient } from "./plan-day-client";

export const metadata = {
  title: "Plan my day — LifeOS",
};

export default function PlanDayPage() {
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ label: "Calendar", href: "/calendar" }, { label: "Plan my day" }]} />
      <div>
        <h1 className="font-display text-xl font-semibold">Plan my day</h1>
        <p className="font-sans text-body text-ink-2">
          Tell me what you&apos;re thinking of doing. We&apos;ll sort out the order and timing together, then I&apos;ll put each stop on your
          calendar with the drive time.
        </p>
      </div>
      <PlanDayClient />
    </div>
  );
}
