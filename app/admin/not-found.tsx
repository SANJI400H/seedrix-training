import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-bold text-seedrix-darkest">Not found</h1>
      <p className="text-sm text-seedrix-black/60">That record doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/admin" className="text-sm font-bold text-seedrix-green underline">
        Back to the dashboard
      </Link>
    </main>
  );
}
