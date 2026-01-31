"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Workout, ConversationMessage, GenerateWorkoutResponse } from "@/types/workout";
import { useFTP } from "@/hooks/use-ftp";
import { Upload, Image, FileText, Loader2, Send } from "lucide-react";
import { parseZwoFile } from "@/lib/parsers/zwo-parser";
import { parseFitFile } from "@/lib/parsers/fit-parser";

interface WorkoutCreatorProps {
  onWorkoutCreated: (workout: Workout) => void;
}

export function WorkoutCreator({ onWorkoutCreated }: WorkoutCreatorProps) {
  const [ftp] = useFTP();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [followUpQuestion, setFollowUpQuestion] = useState<{
    question: string;
    options?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    const newHistory: ConversationMessage[] = [
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    try {
      const response = await fetch("/api/generate-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage,
          ftp,
          conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
        }),
      });

      const data: GenerateWorkoutResponse = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.followUpQuestion) {
        setFollowUpQuestion(data.followUpQuestion);
        setConversationHistory([
          ...newHistory,
          { role: "assistant", content: data.followUpQuestion.question },
        ]);
        setPrompt("");
      } else if (data.workout) {
        onWorkoutCreated(data.workout);
        setConversationHistory([]);
        setFollowUpQuestion(null);
        setPrompt("");
      }
    } catch (err) {
      setError("Failed to generate workout. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationHistory, ftp, isLoading, onWorkoutCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(prompt);
    }
  };

  const handleOptionClick = (option: string) => {
    handleSubmit(option);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      let workout: Workout | null = null;

      if (extension === "zwo") {
        const text = await file.text();
        workout = parseZwoFile(text, ftp);
      } else if (extension === "fit") {
        const buffer = await file.arrayBuffer();
        workout = await parseFitFile(buffer, ftp);
      } else {
        setError("Unsupported file format. Please upload a .zwo or .fit file.");
        return;
      }

      if (workout) {
        onWorkoutCreated(workout);
      }
    } catch (err) {
      setError("Failed to parse workout file. Please check the file format.");
      console.error(err);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("ftp", ftp.toString());

      const response = await fetch("/api/parse-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.workout) {
        onWorkoutCreated(data.workout);
      }
    } catch (err) {
      setError("Failed to analyze image. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const resetConversation = () => {
    setConversationHistory([]);
    setFollowUpQuestion(null);
    setPrompt("");
    setError(null);
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Conversation display */}
      {conversationHistory.length > 0 && (
        <div className="mb-6 space-y-3">
          {conversationHistory.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "py-3 px-4 rounded-2xl text-sm",
                msg.role === "user"
                  ? "bg-primary/10 ml-12"
                  : "bg-card mr-12 shadow-sm"
              )}
            >
              <p>{msg.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Follow-up options */}
      {followUpQuestion && followUpQuestion.options && (
        <div className="mb-6 space-y-2">
          {followUpQuestion.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleOptionClick(option)}
              disabled={isLoading}
              className="w-full py-3 px-4 text-left text-sm bg-card rounded-xl hover:bg-accent transition-colors disabled:opacity-50 shadow-sm"
            >
              {option}
            </button>
          ))}
          <button
            onClick={resetConversation}
            className="text-xs text-muted-foreground hover:text-foreground mt-2"
          >
            Start over
          </button>
        </div>
      )}

      {/* Main input */}
      <div className="space-y-5">
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              followUpQuestion
                ? "Type your answer..."
                : "e.g. I have 20 minutes and want to wake up the legs before a race"
            }
            className="w-full min-h-[120px] p-5 pr-14 bg-card rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm placeholder:text-muted-foreground/50"
            disabled={isLoading}
          />
          {!followUpQuestion && !prompt && (
            <p className="absolute bottom-4 left-5 right-14 text-xs text-muted-foreground/60">
              Include duration and goals for best results
            </p>
          )}
          <button
            onClick={() => handleSubmit(prompt)}
            disabled={!prompt.trim() || isLoading}
            className="absolute bottom-4 right-4 p-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="p-4 bg-destructive/10 rounded-xl text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Alternative upload options */}
        <div className="flex items-center justify-center">
          <span className="text-xs text-muted-foreground">or upload a file</span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground bg-card rounded-xl hover:bg-accent transition-colors disabled:opacity-40 shadow-sm"
          >
            <FileText className="w-4 h-4" />
            <span>.zwo / .fit</span>
          </button>
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground bg-card rounded-xl hover:bg-accent transition-colors disabled:opacity-40 shadow-sm"
          >
            <Image className="w-4 h-4" />
            <span>Screenshot</span>
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zwo,.fit"
          onChange={handleFileUpload}
          className="hidden"
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}
