import { Link } from "@/i18n/navigation";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-seedrix-green">404</h1>
      <p className="mt-3">This page does not exist.</p>
      <Link href="/" className="mt-6 inline-block font-bold text-seedrix-green">
        Seedrix Training
      </Link>
    </div>
  );
}
