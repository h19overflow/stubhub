import type { GetServerSideProps } from "next";
import Head from "next/head";
import { SignedInLanding } from "../features/landing/SignedInLanding";
import { refreshAuthenticationOnServer } from "../lib/api/auth/refresh-server";

type HomePageProps = {
  email: string;
};
// In the Pages Router, `pages/index.tsx` automatically owns the `/` URL.
export default function HomePage({ email }: HomePageProps) {
  return (
    <>
      <Head>
        <title>StubHub Marketplace</title>
        <meta name="description" content="Demo home for the StubHub marketplace client" />
      </Head>
      {/* The route stays thin: the feature component owns the actual landing-page UI. */}
      <SignedInLanding email={email} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<HomePageProps> = async ({ req, res }) => {
  const { authentication, setCookie } = await refreshAuthenticationOnServer(req.headers.cookie);

  if (setCookie) res.setHeader("Set-Cookie", setCookie);
  if (!authentication) {
    return { redirect: { destination: "/auth", permanent: false } };
  }

  return { props: { email: authentication.user.email } };
};
