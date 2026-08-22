import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchNotification } from "./dispatch";
import { notificationsRepo } from "../db/repositories/system";
import { peopleRepo } from "../db/repositories/people";

vi.mock("../db/repositories/system", () => ({ notificationsRepo: { create: vi.fn() } }));
vi.mock("../db/repositories/people", () => ({ peopleRepo: { getById: vi.fn() } }));

const fakeClient = {} as never;
const payload = {
  householdId: "h1",
  personId: "p1",
  notificationType: "daily_brief",
  title: "Your brief is ready",
  body: "Golf with Mike at 9am.",
};

beforeEach(() => {
  vi.mocked(notificationsRepo.create).mockReset();
  vi.mocked(peopleRepo.getById).mockReset();
});

describe("dispatchNotification", () => {
  it("delivers to the in-app channel by writing a notifications row", async () => {
    vi.mocked(notificationsRepo.create).mockResolvedValue({} as never);
    const results = await dispatchNotification(fakeClient, payload, ["in_app"]);
    expect(results).toEqual([{ channel: "in_app", result: { delivered: true } }]);
    expect(notificationsRepo.create).toHaveBeenCalled();
  });

  it("reports push as not-delivered (v2 no-op)", async () => {
    const results = await dispatchNotification(fakeClient, payload, ["push"]);
    expect(results[0].result.delivered).toBe(false);
  });

  it("reports sms as not-delivered (deferred no-op)", async () => {
    const results = await dispatchNotification(fakeClient, payload, ["sms"]);
    expect(results[0].result.delivered).toBe(false);
  });

  it("dispatches to multiple channels independently, one result each", async () => {
    vi.mocked(notificationsRepo.create).mockResolvedValue({} as never);
    vi.mocked(peopleRepo.getById).mockResolvedValue(null); // no email on file
    const results = await dispatchNotification(fakeClient, payload, ["in_app", "email", "push"]);
    expect(results.map((r) => r.channel)).toEqual(["in_app", "email", "push"]);
  });

  it("email channel reports not-delivered when the recipient has no email on file", async () => {
    vi.mocked(peopleRepo.getById).mockResolvedValue(null);
    const results = await dispatchNotification(fakeClient, payload, ["email"]);
    expect(results[0].result).toEqual({ delivered: false, detail: "recipient has no email on file" });
  });

  it("email channel stubs to console (not delivered) when RESEND_API_KEY is unset", async () => {
    vi.mocked(peopleRepo.getById).mockResolvedValue({ email: "dave@example.com" } as never);
    const results = await dispatchNotification(fakeClient, payload, ["email"]);
    expect(results[0].result.delivered).toBe(false);
    expect(results[0].result.detail).toContain("RESEND_API_KEY");
  });

  it("a single failing channel doesn't prevent other channels from being attempted", async () => {
    vi.mocked(notificationsRepo.create).mockRejectedValue(new Error("db down"));
    const results = await dispatchNotification(fakeClient, payload, ["in_app", "push"]);
    expect(results[0].result.delivered).toBe(false);
    expect(results[0].result.detail).toContain("db down");
    expect(results[1].channel).toBe("push"); // still attempted
  });
});
