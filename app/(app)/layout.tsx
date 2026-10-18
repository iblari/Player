import TabBar from "@/components/TabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="shell">{children}</main>
      <TabBar />
    </>
  );
}
