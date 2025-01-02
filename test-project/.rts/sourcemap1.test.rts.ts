import { suite as suite_1, test as test_2, expect as expect_5 } from "vitest";
suite_1("source mapping for errors", () => {
  test_2("simple error", () => {
    const err_3 = new Error("HERE");
    const trace_4 = (err_3.stack || "").split("\n");
    expect_5(trace_4[1]).toMatch(/\/sourcemap1\.test\.rts:5:17$/);
  });
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NvdXJjZW1hcDEudGVzdC5ydHMiXSwibmFtZXMiOlsic3VpdGUiLCJ0ZXN0IiwiZXJyIiwiRXJyb3IiLCJ0cmFjZSIsInN0YWNrIiwic3BsaXQiLCJleHBlY3QiLCJ0b01hdGNoIl0sIm1hcHBpbmdzIjoiO0FBRUFBLE9BQUssQ0FBQywyQkFBMkIsR0FBRyxFQUFFLEdBQUc7RUFDdkNDLE1BQUksQ0FBQyxjQUFjLEdBQUcsRUFBRSxHQUFHO0lBQ3pCLE1BQU1DLE1BQUksRUFBRSxJQUFJQyxLQUFLLENBQUMsTUFBTTtJQUc1QixNQUFNQyxRQUFNLEVBQUUsQ0FBQ0YsS0FBRyxDQUFDRyxNQUFNLEdBQUcsR0FBRyxDQUFDQyxLQUFLLENBQUMsSUFBSTtJQUMxQ0MsUUFBTSxDQUFDSCxPQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ0ksT0FBTyxDQUFDLCtCQUErQjtFQUMxRDtBQUNGIiwiZmlsZSI6InNvdXJjZW1hcDEudGVzdC5ydHMudHMifQ==
