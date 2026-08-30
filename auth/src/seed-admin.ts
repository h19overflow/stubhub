import { adminElevationSchema } from "./http/schemas.js";
import { elevateUserByEmail } from "./users/user-repo.js";

const [email, ...extraArguments] = process.argv.slice(2);

if (!email || extraArguments.length > 0) {
  console.error("Usage: npm run seed:admin -- <email>");
  process.exitCode = 1;
} else {
  const input = adminElevationSchema.safeParse({ email });
  if (!input.success) {
    console.error("A valid email is required");
    process.exitCode = 1;
  } else {
    const user = elevateUserByEmail(input.data.email);
    if (!user) {
      console.error("User not found");
      process.exitCode = 1;
    } else {
      console.log(
        JSON.stringify({
          user: { userId: user.id, email: user.email, role: "admin" },
        }),
      );
    }
  }
}
