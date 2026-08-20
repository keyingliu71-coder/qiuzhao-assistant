import SidebarNav from "./SidebarNav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-layout">
      <SidebarNav />
      <main className="main">{children}</main>
    </div>
  );
}
