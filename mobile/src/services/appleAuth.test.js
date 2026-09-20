import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import { useAppleSignIn } from "./appleAuth";
import * as AppleAuthentication from "expo-apple-authentication";
import { signInWithCredential, signInWithEmailAndPassword, linkWithCredential } from "firebase/auth";
import { track } from "./analytics";

// isPlatformSupported is read fresh from Platform.OS on every render (see
// appleAuth.js's own comment on why) — so, unlike googleAuth.test.js, this
// file mutates Platform.OS directly between cases instead of
// jest.resetModules(), which would hand react-test-renderer a different
// React module instance than the hook and break hook rendering entirely.
// Jest's jest.mock() factories can't close over ordinary outer-scope
// variables (only a fixed allow-list, plus anything prefixed `mock`) — see
// the assertions below, which read this through the mocked firebase/auth
// module rather than a captured reference.
const mockCredential = jest.fn((opts) => ({ __apple: true, ...opts }));

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock("expo-crypto", () => ({
  digestStringAsync: jest.fn(async () => "hashed-nonce"),
  randomUUID: jest.fn(() => "raw-nonce"),
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
}));
jest.mock("firebase/auth", () => ({
  OAuthProvider: jest.fn().mockImplementation(() => ({
    credential: (...args) => mockCredential(...args),
  })),
  signInWithCredential: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  linkWithCredential: jest.fn(),
}));
jest.mock("../config/firebase", () => ({ auth: {} }));
jest.mock("../utils/logger", () => ({ addLog: jest.fn() }));
jest.mock("./analytics", () => ({ track: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockCredential.mockImplementation((opts) => ({ __apple: true, ...opts }));
});

describe("useAppleSignIn — platform gate", () => {
  it("never checks availability on Android, and available stays false", async () => {
    Platform.OS = "android";
    const { result } = renderHook(() => useAppleSignIn());
    await act(async () => {});
    expect(AppleAuthentication.isAvailableAsync).not.toHaveBeenCalled();
    expect(result.current.available).toBe(false);
  });

  it("checks availability on iOS and reflects a true result", async () => {
    Platform.OS = "ios";
    AppleAuthentication.isAvailableAsync.mockResolvedValue(true);
    const { result } = renderHook(() => useAppleSignIn());
    await waitFor(() => expect(result.current.available).toBe(true));
  });

  it("stays false on iOS when the device reports unavailable (no Apple ID signed in, old OS, etc.)", async () => {
    Platform.OS = "ios";
    AppleAuthentication.isAvailableAsync.mockResolvedValue(false);
    const { result } = renderHook(() => useAppleSignIn());
    await waitFor(() => expect(AppleAuthentication.isAvailableAsync).toHaveBeenCalled());
    expect(result.current.available).toBe(false);
  });
});

describe("useAppleSignIn — sign-in flow (iOS)", () => {
  beforeEach(() => {
    Platform.OS = "ios";
    AppleAuthentication.isAvailableAsync.mockResolvedValue(true);
  });

  it("sends the RAW nonce to Firebase and the HASHED nonce to Apple", async () => {
    AppleAuthentication.signInAsync.mockResolvedValue({ identityToken: "id-token-123", user: "u1" });
    signInWithCredential.mockResolvedValue({});
    const { result } = renderHook(() => useAppleSignIn());
    await waitFor(() => expect(result.current.available).toBe(true));

    await act(async () => {
      await result.current.signIn();
    });

    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith(expect.objectContaining({ nonce: "hashed-nonce" }));
    expect(mockCredential).toHaveBeenCalledWith({ idToken: "id-token-123", rawNonce: "raw-nonce" });
    expect(signInWithCredential).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("login", { method: "apple" });
  });

  it("offers to link when Firebase reports an existing password account", async () => {
    AppleAuthentication.signInAsync.mockResolvedValue({ identityToken: "id-token-123", user: "u1" });
    const conflict = Object.assign(new Error("conflict"), {
      code: "auth/account-exists-with-different-credential",
      customData: { email: "someone@example.com" },
    });
    signInWithCredential.mockRejectedValue(conflict);
    const { result } = renderHook(() => useAppleSignIn());
    await waitFor(() => expect(result.current.available).toBe(true));

    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.linkPending).toEqual({ email: "someone@example.com" });
    expect(result.current.error).toBe("");
  });

  it("treats a cancelled Apple sheet as a normal outcome, not an error", async () => {
    AppleAuthentication.signInAsync.mockRejectedValue(
      Object.assign(new Error("cancelled"), { code: "ERR_REQUEST_CANCELED" })
    );
    const { result } = renderHook(() => useAppleSignIn());
    await waitFor(() => expect(result.current.available).toBe(true));

    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.error).toBe("");
    expect(result.current.busy).toBe(false);
  });

  it("linkAccount attaches the pending Apple credential after password sign-in", async () => {
    AppleAuthentication.signInAsync.mockResolvedValue({ identityToken: "id-token-123", user: "u1" });
    const conflict = Object.assign(new Error("conflict"), {
      code: "auth/account-exists-with-different-credential",
      customData: { email: "someone@example.com" },
    });
    signInWithCredential.mockRejectedValue(conflict);
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: "u1" } });
    linkWithCredential.mockResolvedValue({});

    const { result } = renderHook(() => useAppleSignIn());
    await waitFor(() => expect(result.current.available).toBe(true));
    await act(async () => {
      await result.current.signIn();
    });
    expect(result.current.linkPending).toEqual({ email: "someone@example.com" });

    await act(async () => {
      await result.current.linkAccount("hunter2");
    });

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, "someone@example.com", "hunter2");
    expect(linkWithCredential).toHaveBeenCalled();
    expect(result.current.linkPending).toBe(null);
  });
});
