"use client";

import { useState } from "react";

interface FTPSetupProps {
  onComplete: (ftp: number) => void;
}

export function FTPSetup({ onComplete }: FTPSetupProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseInt(inputValue);
    if (isNaN(value) || value < 50 || value > 500) {
      setError("Please enter a valid FTP between 50 and 500 watts");
      return;
    }
    onComplete(value);
  };

  const presets = [
    { label: "Beginner", ftp: 150 },
    { label: "Intermediate", ftp: 200 },
    { label: "Advanced", ftp: 250 },
    { label: "Elite", ftp: 300 },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-10">
          <img src="/logo.svg" alt="BrowserTurbo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight mb-2">BrowserTurbo</h1>
          <p className="text-sm text-muted-foreground">
            Set your FTP to get started
          </p>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Your FTP (watts)
              </label>
              <input
                type="number"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setError(null);
                }}
                placeholder="200"
                min={50}
                max={500}
                className="w-full px-4 py-4 bg-background rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-2xl tabular-nums text-center font-medium"
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive mt-2 text-center">{error}</p>
              )}
            </div>

            <div className="mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setInputValue(preset.ftp.toString())}
                    className={`py-2 rounded-lg text-xs transition-colors ${
                      inputValue === preset.ftp.toString()
                        ? "bg-primary text-primary-foreground font-medium"
                        : "bg-accent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {preset.ftp}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!inputValue}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </form>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-6">
          Not sure? Start with 200W and adjust later.
        </p>
      </div>
    </div>
  );
}
