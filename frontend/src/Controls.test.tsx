import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Controls } from "./Controls";

describe("Controls", () => {
  it("Start enabled and Stop disabled when stopped", () => {
    render(
      <Controls capturing={false} packetCount={0} onStart={() => {}} onStop={() => {}} />
    );
    expect(screen.getByText("Start")).not.toBeDisabled();
    expect(screen.getByText("Stop")).toBeDisabled();
  });

  it("Start disabled and Stop enabled when capturing", () => {
    render(
      <Controls capturing={true} packetCount={0} onStart={() => {}} onStop={() => {}} />
    );
    expect(screen.getByText("Start")).toBeDisabled();
    expect(screen.getByText("Stop")).not.toBeDisabled();
  });

  it("click Start fires onStart", async () => {
    const onStart = vi.fn();
    render(
      <Controls capturing={false} packetCount={0} onStart={onStart} onStop={() => {}} />
    );
    await userEvent.click(screen.getByText("Start"));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("click Stop fires onStop", async () => {
    const onStop = vi.fn();
    render(
      <Controls capturing={true} packetCount={0} onStart={() => {}} onStop={onStop} />
    );
    await userEvent.click(screen.getByText("Stop"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("renders packet count", () => {
    render(
      <Controls capturing={false} packetCount={42} onStart={() => {}} onStop={() => {}} />
    );
    expect(screen.getByText(/packets: 42/)).toBeInTheDocument();
  });

  it("status indicator reflects capturing", () => {
    const { rerender } = render(
      <Controls capturing={false} packetCount={0} onStart={() => {}} onStop={() => {}} />
    );
    expect(screen.getByText(/○ stopped/)).toBeInTheDocument();
    rerender(
      <Controls capturing={true} packetCount={0} onStart={() => {}} onStop={() => {}} />
    );
    expect(screen.getByText(/● capturing/)).toBeInTheDocument();
  });
});
