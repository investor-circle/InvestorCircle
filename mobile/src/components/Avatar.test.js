import { render, screen } from "@testing-library/react-native";
import Avatar from "./Avatar";

// One component renders every avatar in the app, so a picture uploaded from
// either client shows up consistently. The behaviour that matters is the
// fallback: a user with no picture must still get their initials, not a
// broken image or an empty circle.

describe("Avatar", () => {
  it("renders the picture when the profile has one", () => {
    const uri = "data:image/jpeg;base64,AAAA";
    const tree = render(<Avatar profile={{ avatar_url: uri, full_name: "Asha Rao" }} size={40} />);
    const img = tree.UNSAFE_getByType(require("react-native").Image);
    expect(img.props.source).toEqual({ uri });
  });

  it("falls back to initials when there is no picture", () => {
    render(<Avatar profile={{ full_name: "Asha Rao" }} />);
    expect(screen.getByText("AR")).toBeTruthy();
  });

  it("takes the name from any of the shapes the endpoints return", () => {
    // Lists return `name`, profiles return `full_name`, some return only a
    // username — all must produce initials rather than "?".
    render(<Avatar profile={{ name: "Bala Krishnan" }} />);
    expect(screen.getByText("BK")).toBeTruthy();
  });

  it("survives no profile at all, which is the state before it loads", () => {
    expect(() => render(<Avatar />)).not.toThrow();
  });

  it("scales the circle and the initials with size", () => {
    const tree = render(<Avatar profile={{ full_name: "Asha Rao" }} size={80} />);
    const flat = [].concat(tree.toJSON().props.style);
    expect(flat.find((s) => s && s.width)?.width).toBe(80);
    expect(flat.find((s) => s && s.borderRadius)?.borderRadius).toBe(40);
  });
});
