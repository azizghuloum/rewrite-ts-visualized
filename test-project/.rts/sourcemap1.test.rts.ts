import { suite as suite$1, test as test$2, expect as expect$5 } from "vitest";
suite$1("source mapping for errors", () => {
  test$2("simple error", () => {
    const err$3 = new Error("HERE");
    const trace$4 = (err$3.stack || "").split("\n");
    expect$5(trace$4[1]).toMatch(/\/sourcemap1\.test\.rts:5:17$/);
  });
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NvdXJjZW1hcDEudGVzdC5ydHMiXSwibmFtZXMiOlsic3VpdGUiLCJ0ZXN0IiwiZXJyIiwiRXJyb3IiLCJ0cmFjZSIsInN0YWNrIiwic3BsaXQiLCJleHBlY3QiLCJ0b01hdGNoIl0sIm1hcHBpbmdzIjoiO0FBRUFBLE9BQUssQ0FBQywyQkFBMkIsR0FBRyxFQUFFLEdBQUc7RUFDdkNDLE1BQUksQ0FBQyxjQUFjLEdBQUcsRUFBRSxHQUFHO0lBQ3pCLE1BQU1DLE1BQUksRUFBRSxJQUFJQyxLQUFLLENBQUMsTUFBTTtJQUc1QixNQUFNQyxRQUFNLEVBQUUsQ0FBQ0YsS0FBRyxDQUFDRyxNQUFNLEdBQUcsR0FBRyxDQUFDQyxLQUFLLENBQUMsSUFBSTtJQUMxQ0MsUUFBTSxDQUFDSCxPQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ0ksT0FBTyxDQUFDLCtCQUErQjtFQUMxRDtBQUNGIiwiZmlsZSI6InNvdXJjZW1hcDEudGVzdC5ydHMudHMifQ==
