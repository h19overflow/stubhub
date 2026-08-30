import type { GetServerSideProps } from "next";
import Head from "next/head";
import { ReportedUsers } from "../../../features/moderation/ReportedUsers";
import { refreshAuthenticationOnServer } from "../../../lib/api/auth/refresh-server";

type AdminPageProps = Record<string, never>;

export default function ReportedUsersPage() {
  return (
    <>
      <Head>
        <title>Reported users | StubHub lab</title>
      </Head>
      <ReportedUsers />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req, res }) => {
  const { authentication, setCookie } = await refreshAuthenticationOnServer(req.headers.cookie);

  if (setCookie) res.setHeader("Set-Cookie", setCookie);
  if (!authentication) {
    return { redirect: { destination: "/auth", permanent: false } };
  }
  if (authentication.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }

  return { props: {} };
};
