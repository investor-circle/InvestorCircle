import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const login = vi.fn(() => Promise.resolve());
vi.mock("./AuthContext", () => ({ useAuth: () => ({ login }) }));
vi.mock("./firebase", () => ({ auth: {}, track: vi.fn() }));
vi.mock("./db", () => ({ API_ORIGIN: "" }));
vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  linkWithCredential: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  fetchSignInMethodsForEmail: vi.fn(),
}));

import LoginPage from "./LoginPage.jsx";

beforeAll(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
});

describe("LoginPage — Remember me", () => {
  it("is checked by default and passes true to login()", async () => {
    render(<LoginPage />);
    const checkbox = screen.getByLabelText(/Remember me on this device/i);
    expect(checkbox.checked).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByText("Sign in →"));

    await waitFor(() => expect(login).toHaveBeenCalledWith("a@b.com", "secret123", true));
  });

  it("passes false to login() when unchecked", async () => {
    login.mockClear();
    render(<LoginPage />);
    const checkbox = screen.getByLabelText(/Remember me on this device/i);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByText("Sign in →"));

    await waitFor(() => expect(login).toHaveBeenCalledWith("a@b.com", "secret123", false));
  });

  it("email and password fields carry correct autocomplete hints", () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText("you@example.com").autocomplete).toBe("username");
    expect(screen.getByPlaceholderText("••••••••").autocomplete).toBe("current-password");
  });
});
