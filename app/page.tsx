import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold">RoboHire</h1>
      <p className="text-lg text-neutral-600">
        Upload a video of your space and see which jobs a humanoid robot can take over.
      </p>
      <nav className="flex gap-6 underline">
        <Link href="/upload">Upload</Link>
        <Link href="/robot">Robot</Link>
      </nav>
    </main>
  );
}
