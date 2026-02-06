import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block"
        >
          &larr; Back to app
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight mb-8">Privacy Policy</h1>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p className="text-foreground">
            Last updated: February 2026
          </p>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">What we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your email address (when you create an account)</li>
              <li>Workout data you create within the app</li>
              <li>FTP setting</li>
              <li>Strava connection tokens (if you connect Strava)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">How we use it</h2>
            <p>
              Your data is used solely to provide the BrowserTurbo service — syncing your
              workouts across devices and enabling Strava uploads. We do not sell, share, or
              use your data for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Where it&apos;s stored</h2>
            <p>
              Data is stored securely in Supabase (hosted on AWS). Passwords are hashed and
              never stored in plain text. If you use the app without an account, data stays
              in your browser&apos;s local storage only.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Third parties</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Supabase — authentication and database hosting</li>
              <li>Google — if you sign in with Google</li>
              <li>Strava — only if you choose to connect your account</li>
              <li>Google Gemini — workout generation (your prompts are sent to the API, not stored)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Your rights</h2>
            <p>
              You can delete your account and all associated data at any time. To request
              deletion, sign out and contact us. We will remove all your data from our systems.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Contact</h2>
            <p>
              Questions? Reach out to the BrowserTurbo team directly.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
