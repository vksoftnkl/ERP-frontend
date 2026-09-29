import { describe, expect, it } from "vitest";
import reducer, { authSessionChanged, type AuthState, type UserInfo } from "./authSlice";

/**
 * The in-tab copy of the user block, and — through the store's persistence —
 * the copy a reload rehydrates from. A token refresh dispatches the refresh
 * response's block, which names the user and nulls every device field; taking
 * it wholesale is how `deviceId` vanished a quarter of an hour into a session.
 */
const SIGNED_IN: UserInfo = {
  userName: "vijay",
  userType: "SUPER ADMIN",
  tokenType: "Bearer",
  deviceId: "019e7257-ec4c-79a3-bad6-99faf77c536c",
  deviceName: "Web Browser",
  devCompanyId: "company-1",
  devBranchId: "branch-1",
  devUserId: null,
  deviceType: "Web",
};

const REFRESH_BLOCK: UserInfo = {
  userName: "vijay",
  userType: "SUPER ADMIN",
  tokenType: "Bearer",
  deviceId: null,
  deviceName: null,
  devCompanyId: null,
  devBranchId: null,
  devUserId: null,
  deviceType: null,
};

function signedIn(): AuthState {
  return reducer(
    undefined,
    authSessionChanged({ token: "token-1", refreshToken: "refresh-1", userId: "user-1", userInfo: SIGNED_IN }),
  );
}

describe("authSlice userInfo", () => {
  it("keeps the device when a refresh reports only the user", () => {
    const next = reducer(
      signedIn(),
      authSessionChanged({ token: "token-2", refreshToken: "refresh-1", userId: "user-1", userInfo: REFRESH_BLOCK }),
    );

    expect(next.userInfo?.deviceId).toBe(SIGNED_IN.deviceId);
    expect(next.userInfo?.deviceName).toBe("Web Browser");
    expect(next.token).toBe("token-2");
  });

  it("inherits nothing when the block names a different user", () => {
    const next = reducer(
      signedIn(),
      authSessionChanged({
        token: "token-2",
        refreshToken: "refresh-2",
        userId: "user-2",
        userInfo: { ...REFRESH_BLOCK, userName: "ravi", userType: "USER" },
      }),
    );

    expect(next.userInfo?.deviceId).toBeNull();
    expect(next.userInfo?.userType).toBe("USER");
  });

  it("drops it on sign-out", () => {
    const next = reducer(signedIn(), authSessionChanged({ isAuthenticated: false }));

    expect(next.userInfo).toBeNull();
  });
});
