import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AppleSignInButton from "./AppleSignInButton";
import { useAppleSignIn } from "../services/appleAuth";

// Mirrors GoogleSignInButton.test.js: stub the hook (its own logic is
// covered in appleAuth.test.js) and stand in for Apple's native button with
// a plain Pressable, since the real ASAuthorizationAppleIDButton is a native
// view this test environment cannot render.
jest.mock("../services/appleAuth", () => ({
  useAppleSignIn: jest.fn(),
}));

jest.mock("expo-apple-authentication", () => {
  // require()'d inside the factory: jest.mock() factories may not close over
  // outer-scope variables (including plain imports), only reference a
  // fixed allow-list of globals plus require().
  const { Pressable, Text } = require("react-native");
  return {
    AppleAuthenticationButton: ({ onPress }) => (
      <Pressable onPress={onPress}>
        <Text>Continue with Apple</Text>
      </Pressable>
    ),
    AppleAuthenticationButtonType: { CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { BLACK: 2 },
  };
});

const hookState = (over = {}) => ({
  available: true,
  busy: false,
  error: "",
  signIn: jest.fn(),
  linkPending: null,
  linkAccount: jest.fn(),
  cancelLink: jest.fn(),
  ...over,
});

describe("AppleSignInButton — availability gate", () => {
  it("renders nothing when the hook reports unavailable (Android, unsupported device, etc.)", () => {
    useAppleSignIn.mockReturnValue(hookState({ available: false }));
    render(<AppleSignInButton />);
    expect(screen.queryByText("Continue with Apple")).toBeNull();
  });
});

describe("AppleSignInButton — the button itself", () => {
  it("starts sign-in when tapped", () => {
    const state = hookState();
    useAppleSignIn.mockReturnValue(state);
    render(<AppleSignInButton />);

    fireEvent.press(screen.getByText("Continue with Apple"));
    expect(state.signIn).toHaveBeenCalled();
  });

  it("does not show the link prompt during an ordinary sign-in", () => {
    useAppleSignIn.mockReturnValue(hookState());
    render(<AppleSignInButton />);
    expect(screen.queryByText(/Connect your Apple account/)).toBeNull();
  });

  it("shows a sign-in error under the button", () => {
    useAppleSignIn.mockReturnValue(hookState({ error: "Couldn't open Apple sign-in." }));
    render(<AppleSignInButton />);
    expect(screen.getByText(/Couldn't open Apple sign-in/)).toBeTruthy();
  });
});

describe("AppleSignInButton — the account-link prompt", () => {
  const pending = { email: "someone@example.com" };

  it("appears only once Firebase reports the conflict, and names the email", () => {
    useAppleSignIn.mockReturnValue(hookState({ linkPending: pending }));
    render(<AppleSignInButton />);

    expect(screen.getByText(/Connect your Apple account/)).toBeTruthy();
    expect(screen.getByText("someone@example.com")).toBeTruthy();
  });

  it("passes the typed password to linkAccount", async () => {
    const state = hookState({ linkPending: pending });
    useAppleSignIn.mockReturnValue(state);
    render(<AppleSignInButton />);

    fireEvent.changeText(screen.getByPlaceholderText("Your existing password"), "hunter2");
    fireEvent.press(screen.getByText("Connect accounts"));

    await waitFor(() => expect(state.linkAccount).toHaveBeenCalledWith("hunter2"));
  });

  it("will not submit an empty password", () => {
    const state = hookState({ linkPending: pending });
    useAppleSignIn.mockReturnValue(state);
    render(<AppleSignInButton />);

    fireEvent.press(screen.getByText("Connect accounts"));
    expect(state.linkAccount).not.toHaveBeenCalled();
  });

  it("cancels without linking", () => {
    const state = hookState({ linkPending: pending });
    useAppleSignIn.mockReturnValue(state);
    render(<AppleSignInButton />);

    fireEvent.press(screen.getByText("Cancel"));
    expect(state.cancelLink).toHaveBeenCalled();
    expect(state.linkAccount).not.toHaveBeenCalled();
  });

  it("does not keep the typed password once the prompt closes", async () => {
    const state = hookState({ linkPending: pending });
    useAppleSignIn.mockReturnValue(state);
    const { rerender } = render(<AppleSignInButton />);

    fireEvent.changeText(screen.getByPlaceholderText("Your existing password"), "hunter2");

    useAppleSignIn.mockReturnValue(hookState({ linkPending: null }));
    rerender(<AppleSignInButton />);
    useAppleSignIn.mockReturnValue(hookState({ linkPending: pending }));
    rerender(<AppleSignInButton />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Your existing password").props.value).toBe("");
    });
  });
});
