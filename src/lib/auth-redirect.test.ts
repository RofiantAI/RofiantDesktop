import { describe, it, expect } from "vitest";
import { parseAuthRedirect } from "./auth-redirect";

describe("parseAuthRedirect", () => {
  it("returns invalid for unparseable URLs", () => {
    expect(parseAuthRedirect("not a url")).toEqual({ type: "invalid" });
  });

  it("returns none when the redirect carries no recognized params", () => {
    expect(parseAuthRedirect("rofiant://auth-callback")).toEqual({ type: "none" });
  });

  it("extracts an oauth error from query params", () => {
    expect(parseAuthRedirect("rofiant://auth-callback?error=access_denied")).toEqual({
      type: "error",
      message: "access_denied",
    });
  });

  it("extracts an oauth error from the hash fragment, preferring description", () => {
    const result = parseAuthRedirect(
      "rofiant://auth-callback#error=server_error&error_description=Something%20broke",
    );
    expect(result).toEqual({ type: "error", message: "Something broke" });
  });

  it("prefers an error over tokens or a code if both are present", () => {
    const result = parseAuthRedirect(
      "rofiant://auth-callback?code=abc&error=access_denied",
    );
    expect(result).toEqual({ type: "error", message: "access_denied" });
  });

  it("extracts access/refresh tokens from the hash fragment (signup flow)", () => {
    const result = parseAuthRedirect(
      "rofiant://auth-callback#access_token=at123&refresh_token=rt456",
    );
    expect(result).toEqual({ type: "tokens", accessToken: "at123", refreshToken: "rt456" });
  });

  it("extracts access/refresh tokens from query params too", () => {
    const result = parseAuthRedirect(
      "rofiant://auth-callback?access_token=at123&refresh_token=rt456",
    );
    expect(result).toEqual({ type: "tokens", accessToken: "at123", refreshToken: "rt456" });
  });

  it("ignores a lone access_token without a refresh_token", () => {
    const result = parseAuthRedirect("rofiant://auth-callback#access_token=at123");
    expect(result).toEqual({ type: "none" });
  });

  it("extracts a PKCE code from query params", () => {
    expect(parseAuthRedirect("rofiant://auth-callback?code=xyz")).toEqual({
      type: "code",
      code: "xyz",
    });
  });
});
