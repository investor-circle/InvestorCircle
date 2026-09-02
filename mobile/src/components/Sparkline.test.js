import { render } from "@testing-library/react-native";
import Sparkline from "./Sparkline";

// The sparkline normalises against its own min/max, which has two edge cases
// that produce nonsense if unguarded: a flat series (span 0 -> divide by
// zero) and a series too short to show a direction.

const barsOf = (tree) =>
  tree.toJSON()?.children?.filter((c) => c.type === "View") || [];

describe("Sparkline", () => {
  it("draws one bar per value", () => {
    const tree = render(<Sparkline values={[1, 5, 3, 9]} height={40} />);
    expect(barsOf(tree)).toHaveLength(4);
  });

  it("renders nothing for fewer than two points", () => {
    // One point is a dot, not a trend — drawing it would imply a shape that
    // the data does not support.
    for (const v of [[], [5], null, undefined]) {
      expect(render(<Sparkline values={v} />).toJSON()).toBeNull();
    }
  });

  it("does not divide by zero on a flat series", () => {
    const tree = render(<Sparkline values={[7, 7, 7]} height={40} />);
    const bars = barsOf(tree);
    expect(bars).toHaveLength(3);
    for (const b of bars) {
      const h = [].concat(b.props.style).find((s) => s && typeof s.height === "number")?.height;
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
    }
  });

  it("keeps the lowest point visible rather than collapsing it to nothing", () => {
    const tree = render(<Sparkline values={[0, 100]} height={40} />);
    const heights = barsOf(tree).map(
      (b) => [].concat(b.props.style).find((s) => s && typeof s.height === "number")?.height
    );
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...heights)).toBe(40);
  });

  it("ignores non-numeric values instead of rendering NaN-sized bars", () => {
    const tree = render(<Sparkline values={[1, "x", 3, null, 5]} height={40} />);
    expect(barsOf(tree)).toHaveLength(3);
  });
});
