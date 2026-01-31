import { NextRequest, NextResponse } from "next/server";
import { GenerateWorkoutRequest, GenerateWorkoutResponse, Workout, Segment, generateId } from "@/types/workout";
import { calculateTSS, calculateIntensityFactor, calculateTotalDuration } from "@/lib/workout-utils";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const SYSTEM_PROMPT = `You are an expert cycling coach and workout designer for turbo trainers. Your job is to create structured cycling workouts based on user requests.

CRITICAL: GENERATE WORKOUTS, DON'T ASK QUESTIONS
- Your DEFAULT behavior should be to GENERATE a workout, not ask questions
- ONLY ask a follow-up question if the request is TRULY ambiguous (e.g., just "workout" with no other info)
- If the user mentions ANY duration (e.g., "20 min", "I have 30 minutes", "hour long"), DO NOT ask about time
- If the user mentions ANY workout type (sweetspot, threshold, VO2max, etc.), DO NOT ask what type
- Use smart defaults: if no duration specified, default to 45-60 minutes
- The user's FTP is always provided - never ask for it

EXAMPLES OF WHEN TO GENERATE (NOT ASK):
- "sweetspot workout" → Generate 45-60 min sweetspot workout
- "I have 20 minutes" → Generate 20 min general workout (mix of tempo/sweetspot)
- "threshold intervals" → Generate threshold interval workout
- "quick VO2max session" → Generate 30 min VO2max workout
- "easy recovery ride" → Generate recovery workout

ONLY ASK if request is like:
- "workout" (nothing else)
- "make me something" (completely vague)

WORKOUT STRUCTURE:
- Always include warm-up (5 min for short workouts, 10 min for longer)
- Main set with appropriate intervals
- Always include cool-down (3-5 min)
- Ensure total duration matches user's time constraint if specified

WORKOUT TYPES:
- Recovery: 50-65% FTP
- Endurance: 65-75% FTP
- Tempo: 76-90% FTP
- Sweetspot: 88-94% FTP
- Threshold: 95-105% FTP
- VO2max: 106-120% FTP (short intervals with recovery)
- Anaerobic: 121-150% FTP
- Sprint: >150% FTP

RESPONSE FORMAT - VALID JSON ONLY:

For workout (PREFERRED):
{
  "workout": {
    "name": "Workout Name",
    "description": "Brief description",
    "segments": [
      {
        "type": "warmup|interval|recovery|cooldown|steady",
        "duration": <seconds>,
        "targetPower": {"type": "percent_ftp", "value": <0-200>, "valueHigh": <optional>},
        "instructions": "Optional cue"
      }
    ]
  }
}

For follow-up (ONLY if truly needed):
{
  "followUpQuestion": {
    "question": "Your question?",
    "options": ["Option 1", "Option 2", "Option 3"]
  }
}

SEGMENT EXAMPLES:
- Warm-up: {"type": "warmup", "duration": 300, "targetPower": {"type": "percent_ftp", "value": 50, "valueHigh": 70}}
- Sweetspot: {"type": "interval", "duration": 480, "targetPower": {"type": "percent_ftp", "value": 90}}
- Recovery: {"type": "recovery", "duration": 120, "targetPower": {"type": "percent_ftp", "value": 50}}
- Cool-down: {"type": "cooldown", "duration": 300, "targetPower": {"type": "percent_ftp", "value": 60, "valueHigh": 40}}

OUTPUT VALID JSON ONLY. NO MARKDOWN. NO EXTRA TEXT.`;

export async function POST(request: NextRequest): Promise<NextResponse<GenerateWorkoutResponse>> {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    const body: GenerateWorkoutRequest = await request.json();
    const { prompt, ftp, conversationHistory = [] } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Build the conversation for Gemini
    const contents = [
      {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }]
      },
      {
        role: "model",
        parts: [{ text: "I understand. I'm ready to help create cycling workouts. I'll respond with valid JSON only." }]
      }
    ];

    // Add conversation history
    for (const msg of conversationHistory) {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      });
    }

    // Add current prompt with FTP context if available
    let currentPrompt = prompt;
    if (ftp) {
      currentPrompt = `User's FTP is ${ftp} watts. Request: ${prompt}`;
    }
    contents.push({
      role: "user",
      parts: [{ text: currentPrompt }]
    });

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate workout" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Parse the AI response
    let parsed;
    try {
      // Clean the response - remove any markdown code blocks if present
      let cleanedResponse = aiResponse.trim();
      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.slice(7);
      }
      if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.slice(3);
      }
      if (cleanedResponse.endsWith("```")) {
        cleanedResponse = cleanedResponse.slice(0, -3);
      }
      parsed = JSON.parse(cleanedResponse.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiResponse);
      return NextResponse.json(
        { error: "Failed to parse workout data" },
        { status: 500 }
      );
    }

    // Handle follow-up question
    if (parsed.followUpQuestion) {
      return NextResponse.json({
        followUpQuestion: parsed.followUpQuestion,
      });
    }

    // Handle workout generation
    if (parsed.workout) {
      const workoutData = parsed.workout;

      // Add IDs to segments and build the full workout
      const segments: Segment[] = workoutData.segments.map((seg: Segment, index: number) => ({
        ...seg,
        id: generateId(),
      }));

      const userFtp = ftp || 200;
      const workout: Workout = {
        id: generateId(),
        name: workoutData.name || "Custom Workout",
        description: workoutData.description || "",
        segments,
        totalDuration: calculateTotalDuration(segments),
        estimatedTSS: calculateTSS(segments, userFtp),
        intensityFactor: calculateIntensityFactor(segments, userFtp),
        createdAt: new Date().toISOString(),
        source: "ai",
      };

      return NextResponse.json({ workout });
    }

    return NextResponse.json(
      { error: "Invalid AI response format" },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error in generate-workout:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
