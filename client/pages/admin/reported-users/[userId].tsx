import type { GetServerSideProps } from "next";
import Head from "next/head";
import { ReportedUserDetail } from "../../../features/moderation/ReportedUserDetail";
import { refreshAuthenticationOnServer } from "../../../lib/api/auth/refresh-server";

type AdminPageProps = {
  userId: string;
};

export default function ReportedUserDetailPage({ userId }: AdminPageProps) {
  return (
    <>
      <Head>
        <title>Reported user evidence | StubHub lab</title>
      </Head>
      <ReportedUserDetail userId={userId} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req, res, params }) => {
  const value = params?.userId;
  if (typeof value !== "string") return { notFound: true };

  const { authentication, setCookie } = await refreshAuthenticationOnServer(req.headers.cookie);

  if (setCookie) res.setHeader("Set-Cookie", setCookie);
  if (!authentication) {
    return { redirect: { destination: "/auth", permanent: false } };
  }
  if (authentication.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }

  return { props: { userId: value } };
};

