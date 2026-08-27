import { useRouter } from "next/router";
import { signout } from "../../lib/api/auth/signout";

export function useSignOut() {
  const router = useRouter();

  return async function handleSignOut() {
    await signout();
    await router.replace("/auth");
  };
}
