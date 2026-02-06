import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-10">
          <img src="/logo.svg" alt="BrowserTurbo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight mb-2">BrowserTurbo</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to sync your workouts across devices
          </p>
        </div>

        <AuthForm />

        <p className="text-xs text-center text-muted-foreground mt-6">
          <Link href="/" className="hover:text-foreground transition-colors underline underline-offset-2">
            Continue without an account
          </Link>
        </p>
        <p className="text-xs text-center text-muted-foreground mt-3">
          By signing in you agree to our{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
