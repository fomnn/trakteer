import { expect, test } from "vitest";
import { TrakteerHttpError, TrakteerPayment, TrakteerPublicApi, TrakteerUser } from "../src";

test("exports the Trakteer API", () => {
  expect(typeof TrakteerPayment.createPayment).toBe("function");
  expect(typeof TrakteerUser.getUserDetails).toBe("function");
  expect(typeof TrakteerPublicApi).toBe("function");
  expect(new TrakteerHttpError(500, '{"message":"boom"}').message).toBe("boom");
});
