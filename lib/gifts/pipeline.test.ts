import { describe, expect, it } from "vitest";
import {
  GIFT_PIPELINE_STAGES,
  isTerminalPipelineStage,
  nextPipelineStage,
  pipelineStageIndex,
  pipelineStageLabel,
  previousPipelineStage,
} from "./pipeline";

describe("pipelineStageIndex", () => {
  it("returns -1 for null (unset)", () => {
    expect(pipelineStageIndex(null)).toBe(-1);
  });

  it("returns the correct position for every real stage", () => {
    GIFT_PIPELINE_STAGES.forEach((stage, i) => {
      expect(pipelineStageIndex(stage)).toBe(i);
    });
  });
});

describe("nextPipelineStage", () => {
  it("moves from unset to the first stage (idea)", () => {
    expect(nextPipelineStage(null)).toBe("idea");
  });

  it("advances one step at a time through the full pipeline", () => {
    expect(nextPipelineStage("idea")).toBe("shortlisted");
    expect(nextPipelineStage("shortlisted")).toBe("decided");
    expect(nextPipelineStage("decided")).toBe("ordered");
    expect(nextPipelineStage("ordered")).toBe("shipped");
    expect(nextPipelineStage("shipped")).toBe("arrived");
    expect(nextPipelineStage("arrived")).toBe("given");
  });

  it("is a no-op at the terminal stage", () => {
    expect(nextPipelineStage("given")).toBe("given");
  });
});

describe("previousPipelineStage", () => {
  it("is a no-op when already unset", () => {
    expect(previousPipelineStage(null)).toBeNull();
  });

  it("clears back to unset from the first stage", () => {
    expect(previousPipelineStage("idea")).toBeNull();
  });

  it("reverts one step at a time through the full pipeline", () => {
    expect(previousPipelineStage("given")).toBe("arrived");
    expect(previousPipelineStage("arrived")).toBe("shipped");
    expect(previousPipelineStage("shipped")).toBe("ordered");
    expect(previousPipelineStage("ordered")).toBe("decided");
    expect(previousPipelineStage("decided")).toBe("shortlisted");
    expect(previousPipelineStage("shortlisted")).toBe("idea");
  });
});

describe("isTerminalPipelineStage", () => {
  it("is true only for given", () => {
    expect(isTerminalPipelineStage("given")).toBe(true);
    expect(isTerminalPipelineStage("arrived")).toBe(false);
    expect(isTerminalPipelineStage(null)).toBe(false);
  });
});

describe("pipelineStageLabel", () => {
  it("never returns a raw enum value or the word 'null'", () => {
    expect(pipelineStageLabel(null)).toBe("Not started");
    GIFT_PIPELINE_STAGES.forEach((stage) => {
      const label = pipelineStageLabel(stage);
      expect(label).not.toBe(stage);
      expect(label[0]).toBe(label[0].toUpperCase());
    });
  });
});
