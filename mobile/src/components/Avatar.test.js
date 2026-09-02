import { render, screen, act } from "@testing-library/react-native";
import Avatar from "./Avatar";
import { setCachedAvatar, _resetAvatarCache } from "../services/avatarCache";

jest.mock("../services/api", () => ({ callApi: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

// One component renders every avatar in the app, so a picture uploaded from
// either client shows up consistently. The behaviour that matters is the
// fallback: a user with no picture must still get their initials, not a
// broken image or an empty circle.

const imageIn = (tree) => tree.UNSAFE_queryByType(require("react-native").Image);

beforeEach(() => _resetAvatarCache());

// The cache debounces its write with a timer; leaving one pending keeps the
// test process alive after the run.
afterEach(() => _resetAvatarCache());

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

// A feed card knows only WHO posted an idea, not their picture — putting a
// data: URI on every feed row is exactly what this design avoids. So the card
// passes a uid, paints initials at once, and the picture appears if and when
// the cache has one.
describe("Avatar by uid", () => {
  it("paints initials, not a broken image, when the cache has nothing yet", () => {
    const tree = render(<Avatar uid="u1" name="Asha Rao" />);
    expect(imageIn(tree)).toBeNull();
    expect(screen.getByText("AR")).toBeTruthy();
  });

  it("shows the picture once it is in the cache", () => {
    setCachedAvatar("u1", "data:image/jpeg;base64,AAA");
    const tree = render(<Avatar uid="u1" name="Asha Rao" />);
    expect(imageIn(tree).props.source).toEqual({ uri: "data:image/jpeg;base64,AAA" });
  });

  it("swaps in a picture that lands AFTER the row is on screen", () => {
    // This is the whole point: the list is already rendered when the avatar
    // batch resolves, so the row has to update itself rather than needing
    // the list to reload.
    const tree = render(<Avatar uid="u1" name="Asha Rao" />);
    expect(imageIn(tree)).toBeNull();

    act(() => setCachedAvatar("u1", "data:image/jpeg;base64,LATE"));

    expect(imageIn(tree).props.source).toEqual({ uri: "data:image/jpeg;base64,LATE" });
  });

  it("goes back to initials if the picture is cleared, e.g. on sign-out", () => {
    setCachedAvatar("u1", "x");
    const tree = render(<Avatar uid="u1" name="Asha Rao" />);
    act(() => setCachedAvatar("u1", null));
    expect(imageIn(tree)).toBeNull();
    expect(screen.getByText("AR")).toBeTruthy();
  });

  it("prefers a picture already on the row over the cache", () => {
    // Profile screens fetch avatar_url with the rest of the record; that is
    // the freshest value, so it must win over anything cached.
    setCachedAvatar("u1", "cached");
    const tree = render(<Avatar uid="u1" profile={{ avatar_url: "fresh" }} />);
    expect(imageIn(tree).props.source).toEqual({ uri: "fresh" });
  });

  it("does not pick up someone else's picture", () => {
    setCachedAvatar("u2", "x");
    const tree = render(<Avatar uid="u1" name="Asha Rao" />);
    expect(imageIn(tree)).toBeNull();
  });
});

describe("gradient fallback", () => {
  it("still shows initials, in white, on the brand gradient", () => {
    render(<Avatar uid="u1" name="Asha Rao" gradient />);
    const text = screen.getByText("AR");
    expect([].concat(text.props.style).some((s) => s && s.color === "#fff")).toBe(true);
  });

  it("renders the picture identically whether or not gradient is set", () => {
    setCachedAvatar("u1", "pic");
    const plain = render(<Avatar uid="u1" />);
    const grad = render(<Avatar uid="u1" gradient />);
    expect(imageIn(grad).props.source).toEqual(imageIn(plain).props.source);
  });
});
