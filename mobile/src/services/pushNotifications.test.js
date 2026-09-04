// Push has to degrade quietly: a build without FCM configured, an emulator,
// or a denied permission must all leave the app fully usable. These pin that,
// plus the notification-tap payload contract with api/_lib/expoPush.js —
// if the server's data.url key and this reader ever disagree, every tapped
// notification silently lands on the feed instead of its target.

const mockNotifications = {
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[abc]" })),
  AndroidImportance: { DEFAULT: 3 },
};
const mockDevice = { isDevice: true };
const mockApi = {
  registerExpoPushToken: jest.fn(async () => true),
  unregisterExpoPushToken: jest.fn(async () => true),
};

jest.mock("expo-notifications", () => mockNotifications);
jest.mock("expo-device", () => mockDevice);
jest.mock("expo-constants", () => ({ expoConfig: { extra: { eas: { projectId: "p1" } } } }));
jest.mock("./api/pushApi", () => mockApi);

const load = () => require("./pushNotifications");

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockDevice.isDevice = true;
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc]" });
  mockApi.registerExpoPushToken.mockResolvedValue(true);
});

describe("getExpoPushToken — degrading quietly", () => {
  it("returns the token on a permitted physical device", async () => {
    await expect(load().getExpoPushToken()).resolves.toBe("ExponentPushToken[abc]");
  });

  it("returns null on an emulator without asking for permission", async () => {
    mockDevice.isDevice = false;
    await expect(load().getExpoPushToken()).resolves.toBeNull();
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("does not re-prompt when permission was already granted", async () => {
    await load().getExpoPushToken();
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("asks once when permission is undetermined, and accepts a denial", async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    await expect(load().getExpoPushToken()).resolves.toBeNull();
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("returns null instead of throwing when there is no FCM config", async () => {
    // This is the state of any build made before google-services.json is
    // added. It must not crash the app or block sign-in.
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(
      new Error("Default FirebaseApp is not initialized")
    );
    await expect(load().getExpoPushToken()).resolves.toBeNull();
  });
});

describe("registerDevice / unregisterDevice", () => {
  it("registers the token with the platform", async () => {
    await expect(load().registerDevice()).resolves.toBe("ExponentPushToken[abc]");
    expect(mockApi.registerExpoPushToken).toHaveBeenCalledWith("ExponentPushToken[abc]", expect.any(String));
  });

  it("does not call the API when there is no token", async () => {
    mockDevice.isDevice = false;
    await expect(load().registerDevice()).resolves.toBeNull();
    expect(mockApi.registerExpoPushToken).not.toHaveBeenCalled();
  });

  it("reports failure rather than pretending the device is registered", async () => {
    mockApi.registerExpoPushToken.mockResolvedValue(false);
    await expect(load().registerDevice()).resolves.toBeNull();
  });

  it("detaches the token at sign-out", async () => {
    await load().unregisterDevice("ExponentPushToken[abc]");
    expect(mockApi.unregisterExpoPushToken).toHaveBeenCalledWith("ExponentPushToken[abc]");
  });

  it("is a no-op when there is no token to detach", async () => {
    const push = load();
    await push.unregisterDevice(null);
    await push.unregisterDevice(undefined);
    expect(mockApi.unregisterExpoPushToken).not.toHaveBeenCalled();
  });

  it("swallows an unregister failure — sign-out must not be blocked", async () => {
    mockApi.unregisterExpoPushToken.mockRejectedValue(new Error("offline"));
    await expect(load().unregisterDevice("ExponentPushToken[abc]")).resolves.toBeUndefined();
  });
});

describe("urlFromNotification — the contract with api/_lib/expoPush.js", () => {
  it("reads data.url from a tap response, the shape the server sends", () => {
    // buildExpoMessages() puts the deep link at data.url; a tap arrives
    // wrapped in response.notification.request.content.data.
    const response = {
      notification: { request: { content: { data: { url: "https://x/#/investor/a/reco/9", tag: "reco" } } } },
    };
    expect(load().urlFromNotification(response)).toBe("https://x/#/investor/a/reco/9");
  });

  it("also reads a bare notification object", () => {
    const notification = { request: { content: { data: { url: "https://x/#/circles" } } } };
    expect(load().urlFromNotification(notification)).toBe("https://x/#/circles");
  });

  it("returns null when there is no url, rather than navigating somewhere wrong", () => {
    const push = load();
    for (const n of [
      null,
      undefined,
      {},
      { notification: { request: { content: {} } } },
      { notification: { request: { content: { data: {} } } } },
      { notification: { request: { content: { data: { url: "" } } } } },
      { notification: { request: { content: { data: { url: 42 } } } } },
    ]) {
      expect(push.urlFromNotification(n)).toBeNull();
    }
  });
});

describe("unregisterCurrentDevice — sign-out ordering", () => {
  // The bug this guards: unregistering is an AUTHENTICATED call, so if it
  // happens after signOut() it silently does nothing and the token stays
  // attached to the account that just left. On a shared phone the next
  // person would then receive the previous user's notifications.
  it("detaches the token registered by registerDevice", async () => {
    const push = load();
    await push.registerDevice();
    await push.unregisterCurrentDevice();
    expect(mockApi.unregisterExpoPushToken).toHaveBeenCalledWith("ExponentPushToken[abc]");
  });

  it("is a no-op when nothing was registered", async () => {
    await load().unregisterCurrentDevice();
    expect(mockApi.unregisterExpoPushToken).not.toHaveBeenCalled();
  });

  it("does not detach the same token twice", async () => {
    // Sign out, then sign out again (or a stray cleanup) must not fire a
    // second, pointless authenticated call.
    const push = load();
    await push.registerDevice();
    await push.unregisterCurrentDevice();
    await push.unregisterCurrentDevice();
    expect(mockApi.unregisterExpoPushToken).toHaveBeenCalledTimes(1);
  });

  it("forgets the token when it is detached explicitly", async () => {
    const push = load();
    await push.registerDevice();
    await push.unregisterDevice("ExponentPushToken[abc]");
    await push.unregisterCurrentDevice();
    expect(mockApi.unregisterExpoPushToken).toHaveBeenCalledTimes(1);
  });

  it("does not remember a token whose registration failed", async () => {
    mockApi.registerExpoPushToken.mockResolvedValue(false);
    const push = load();
    await push.registerDevice();
    await push.unregisterCurrentDevice();
    expect(mockApi.unregisterExpoPushToken).not.toHaveBeenCalled();
  });
});
