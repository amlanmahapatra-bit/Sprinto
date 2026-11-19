import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav />
      <main className="min-w-0 flex-1 md:py-2 md:pr-2">
        <div className="min-h-full border-border bg-surface glass sheet-glow md:min-h-[calc(100vh-1rem)] md:rounded-sheet md:border">
          <div className="mx-auto max-w-[1280px] px-5 py-6 md:px-8 md:py-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
