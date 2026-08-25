import Head from "next/head";
import { SignedInLanding } from "../features/landing/SignedInLanding";

// In the Pages Router, `pages/index.tsx` automatically owns the `/` URL.
export default function HomePage() {
  return (
    <>
      <Head>
        <title>StubHub Marketplace</title>
        <meta name="description" content="Demo home for the StubHub marketplace client" />
      </Head>
      {/* The route stays thin: the feature component owns the actual landing-page UI. */}
      <SignedInLanding />
    </>
  );
}
