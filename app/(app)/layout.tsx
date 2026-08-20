import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";
import SidebarNav from "./SidebarNav";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  if (!isAuthed(cookieStore.get(AUTH_COOKIE)?.value)) {
    redirect("/login");
  }

  return (
    <div className="app-layout">
      <SidebarNav />
      <main className="main">{children}</main>
    </div>
  );
}