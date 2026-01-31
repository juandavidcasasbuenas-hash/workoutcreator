import { NextRequest, NextResponse } from "next/server";
import { Workout, Segment, generateId } from "@/types/workout";
import { calculateTSS, calculateIntensityFactor, calculateTotalDuration } from "@/lib/workout-utils";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const getImageSystemPrompt = (userFtp: number) => `You are an expert at analyzing cycling workout images and extracting structured workout data.

The user's FTP (Functional Threshold Power) is ${userFtp}W. Use this for any wattage-to-percentage conversions.

Analyze the provided image and extract the workout structure. The image might be:
- A screenshot from Zwift, TrainerRoad, Wahoo, Garmin, or other training apps
- A photo of a workout written on paper or whiteboard
- A power/time graph showing intervals
- A workout description with intervals listed
- A training plan or coaching prescription

WHAT TO LOOK FOR:

1. **Power/Intensity indicators** (in order of preference):
   - Percentage of FTP labels (e.g., "75%", "120% FTP", "0.75 IF")
   - Zone labels (Z1-Z7, Zone 1-7, Endurance, Tempo, Threshold, VO2max, etc.)
   - Color coding (typically: blue/gray=easy, green=endurance, yellow=tempo, orange=threshold, red=VO2max+)
   - Absolute wattage (convert using user's FTP of ${userFtp}W: percentage = watts / ${userFtp} * 100)
   - RPE or descriptive terms (easy, moderate, hard, all-out)

2. **Duration indicators**:
   - Time labels (5:00, 5min, 5', 300s)
   - Visual width/proportion of segments on a graph
   - Repetition notation (6x30s, 4x4min, etc.)

3. **Segment structure**:
   - Warm-up sections (usually at start, ramping up)
   - Main set / intervals (the core workout)
   - Recovery periods between intervals
   - Cool-down sections (usually at end, ramping down)

ZONE TO PERCENTAGE MAPPING (use if zones are shown):
- Z1 / Active Recovery: 50-55%
- Z2 / Endurance: 56-75%
- Z3 / Tempo: 76-90%
- Z4 / Threshold / Sweet Spot: 91-105%
- Z5 / VO2max: 106-120%
- Z6 / Anaerobic: 121-150%
- Z7 / Neuromuscular / Sprint: 150%+

RESPONSE FORMAT:
You MUST respond with valid JSON only. No markdown, no explanation text outside the JSON.

{
  "workout": {
    "name": "Workout Name (infer from image or use 'Imported Workout')",
    "description": "Brief description of the workout structure and purpose",
    "segments": [
      {
        "type": "warmup|interval|recovery|cooldown|steady",
        "duration": <seconds as integer>,
        "targetPower": {
          "type": "percent_ftp",
          "value": <number 0-200, representing % of FTP>,
          "valueHigh": <optional number for ramps, e.g., warmup from 50 to 75%>
        },
        "instructions": "Any visible coaching cues, interval names, or cadence targets"
      }
    ]
  },
  "confidence": <0-100 number indicating extraction confidence>,
  "rawDescription": "Plain text summary of what you identified in the image"
}

EXTRACTION RULES:
1. All power values MUST be expressed as percentage of FTP (0-200 range)
2. If image shows watts, divide by ${userFtp} and multiply by 100 to get percentage
3. Convert all times to seconds (5:00 = 300, 5min = 300, 30s = 30)
4. Use "repeat" field for interval blocks (e.g., 6x30s becomes one segment with repeat: 6)
5. For ramps/progressive intervals, use "value" for start power and "valueHigh" for end power
6. If values are unclear, estimate conservatively based on visual cues and typical workout patterns
7. Always include warmup and cooldown if visible, even if brief

REMEMBER: Only output valid JSON. No other text.`;

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("image") as File;
    const ftp = parseInt(formData.get("ftp") as string) || 200;

    if (!file) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    // Determine MIME type
    const mimeType = file.type || "image/jpeg";

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: getImageSystemPrompt(ftp) },
              {
                inlineData: {
                  mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return NextResponse.json(
        { error: "Failed to analyze image" },
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
        { error: "Failed to parse workout data from image" },
        { status: 500 }
      );
    }

    if (!parsed.workout) {
      return NextResponse.json(
        { error: "Could not extract workout from image" },
        { status: 400 }
      );
    }

    const workoutData = parsed.workout;

    // Add IDs to segments
    const segments: Segment[] = workoutData.segments.map((seg: Segment) => ({
      ...seg,
      id: generateId(),
    }));

    const workout: Workout = {
      id: generateId(),
      name: workoutData.name || "Imported Workout",
      description: workoutData.description || "",
      segments,
      totalDuration: calculateTotalDuration(segments),
      estimatedTSS: calculateTSS(segments, ftp),
      intensityFactor: calculateIntensityFactor(segments, ftp),
      createdAt: new Date().toISOString(),
      source: "image",
    };

    return NextResponse.json({
      workout,
      confidence: parsed.confidence || 50,
      rawDescription: parsed.rawDescription || "",
    });
  } catch (error) {
    console.error("Error in parse-image:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
