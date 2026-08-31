import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import GoogleSignInButton from "./GoogleSignInButton";
import { useGoogleSignIn } from "../services/googleAuth";

// The account-link prompt is the highest-stakes UI in the app: it asks for an
// existing password. These render it for real and pin the behaviour that
// protects the user — that the prompt only appears when Firebase actually
// reported a conflict, that a wrong password keeps them in the prompt with an
// explanation rather than dropping them, and that the typed password does not
// survive the prompt closing.
//
// The hook is stubbed because the real one calls expo-auth-session, which
// throws without OAuth client ids; the hook's own logic is covered in
// googleAuth.test.js.
jest.mock("../services/googleAuth", () => ({
  isGoogleSignInConfigured: true,
  useGoogleSignIn: jest.fn(),
}));

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

describe("GoogleSignInButton — the button itself", () => {
  it("starts sign-in when tapped", () => {
    const state = hookState();
    useGoogleSignIn.mockReturnValue(state);
    render(<GoogleSignInButton />);

    fireEvent.press(screen.getByText("Continue with Google"));
    expect(state.signIn).toHaveBeenCalled();
  });

  it("does not show the link prompt during an ordinary sign-in", () => {
    useGoogleSignIn.mockReturnValue(hookState());
    render(<GoogleSignInButton />);
    expect(screen.queryByText(/Connect your Google account/)).toBeNull();
  });

  it("shows a sign-in error under the button", () => {
    useGoogleSignIn.mockReturnValue(hookState({ error: "Network error while contacting Google." }));
    render(<GoogleSignInButton />);
    expect(screen.getByText(/Network error while contacting Google/)).toBeTruthy();
  });
});

describe("GoogleSignInButton — the account-link prompt", () => {
  const pending = { email: "someone@example.com" };

  it("appears only once Firebase reports the conflict, and names the email", () => {
    useGoogleSignIn.mockReturnValue(hookState({ linkPending: pending }));
    render(<GoogleSignInButton />);

    expect(screen.getByText(/Connect your Google account/)).toBeTruthy();
    expect(screen.getByText("someone@example.com")).toBeTruthy();
  });

  it("passes the typed password to linkAccount", async () => {
    const state = hookState({ linkPending: pending });
    useGoogleSignIn.mockReturnValue(state);
    render(<GoogleSignInButton />);

    fireEvent.changeText(screen.getByPlaceholderText("Your existing password"), "hunter2");
    fireEvent.press(screen.getByText("Connect accounts"));

    await waitFor(() => expect(state.linkAccount).toHaveBeenCalledWith("hunter2"));
  });

  it("will not submit an empty password", () => {
    const state = hookState({ linkPending: pending });
    useGoogleSignIn.mockReturnValue(state);
    render(<GoogleSignInButton />);

    fireEvent.press(screen.getByText("Connect accounts"));
    expect(state.linkAccount).not.toHaveBeenCalled();
  });

  it("keeps the user in the prompt and explains when the password is wrong", () => {
    useGoogleSignIn.mockReturnValue(
      hookState({ linkPending: pending, error: "Incorrect password. Please try again." })
    );
    render(<GoogleSignInButton />);

    expect(screen.getByText(/Incorrect password/)).toBeTruthy();
    // Still in the prompt — not bounced back to the button with no explanation.
    expect(screen.getByText(/Connect your Google account/)).toBeTruthy();
  });

  it("cancels without linking", () => {
    const state = hookState({ linkPending: pending });
    useGoogleSignIn.mockReturnValue(state);
    render(<GoogleSignInButton />);

    fireEvent.press(screen.getByText("Cancel"));
    expect(state.cancelLink).toHaveBeenCalled();
    expect(state.linkAccount).not.toHaveBeenCalled();
  });

  it("does not keep the typed password once the prompt closes", async () => {
    const state = hookState({ linkPending: pending });
    useGoogleSignIn.mockReturnValue(state);
    const { rerender } = render(<GoogleSignInButton />);

    fireEvent.changeText(screen.getByPlaceholderText("Your existing password"), "hunter2");

    // The hook clears linkPending once the flow ends; the field must not still
    // be holding the password if the prompt is reopened.
    useGoogleSignIn.mockReturnValue(hookState({ linkPending: null }));
    rerender(<GoogleSignInButton />);
    useGoogleSignIn.mockReturnValue(hookState({ linkPending: pending }));
    rerender(<GoogleSignInButton />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Your existing password").props.value).toBe("");
    });
  });
});
