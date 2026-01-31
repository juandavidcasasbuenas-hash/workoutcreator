import { Workout, Segment, generateId } from "@/types/workout";
import { calculateTSS, calculateIntensityFactor, calculateTotalDuration } from "@/lib/workout-utils";

interface ZwoSegment {
  type: string;
  duration?: number;
  power?: number;
  powerLow?: number;
  powerHigh?: number;
  cadence?: number;
  cadenceLow?: number;
  cadenceHigh?: number;
  repeat?: number;
  onDuration?: number;
  offDuration?: number;
  onPower?: number;
  offPower?: number;
  segments?: ZwoSegment[];
}

export function parseZwoFile(content: string, ftp: number): Workout {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/xml");

  // Get workout name and description
  const workoutFile = doc.querySelector("workout_file");
  const name = workoutFile?.querySelector("name")?.textContent || "Imported Workout";
  const description = workoutFile?.querySelector("description")?.textContent || "";

  // Parse workout segments
  const workoutEl = doc.querySelector("workout");
  if (!workoutEl) {
    throw new Error("No workout element found in ZWO file");
  }

  const segments: Segment[] = [];

  for (const child of Array.from(workoutEl.children)) {
    const parsed = parseZwoElement(child);
    segments.push(...parsed);
  }

  const workout: Workout = {
    id: generateId(),
    name,
    description,
    segments,
    totalDuration: calculateTotalDuration(segments),
    estimatedTSS: calculateTSS(segments, ftp),
    intensityFactor: calculateIntensityFactor(segments, ftp),
    createdAt: new Date().toISOString(),
    source: "file",
  };

  return workout;
}

function parseZwoElement(element: Element): Segment[] {
  const tag = element.tagName.toLowerCase();
  const segments: Segment[] = [];

  switch (tag) {
    case "warmup": {
      const duration = parseInt(element.getAttribute("Duration") || "0");
      const powerLow = parseFloat(element.getAttribute("PowerLow") || "0.5") * 100;
      const powerHigh = parseFloat(element.getAttribute("PowerHigh") || "0.75") * 100;

      segments.push({
        id: generateId(),
        type: "warmup",
        duration,
        targetPower: {
          type: "percent_ftp",
          value: Math.round(powerLow),
          valueHigh: Math.round(powerHigh),
        },
      });
      break;
    }

    case "cooldown": {
      const duration = parseInt(element.getAttribute("Duration") || "0");
      const powerLow = parseFloat(element.getAttribute("PowerLow") || "0.5") * 100;
      const powerHigh = parseFloat(element.getAttribute("PowerHigh") || "0.75") * 100;

      segments.push({
        id: generateId(),
        type: "cooldown",
        duration,
        targetPower: {
          type: "percent_ftp",
          value: Math.round(powerHigh),
          valueHigh: Math.round(powerLow),
        },
      });
      break;
    }

    case "steadystate": {
      const duration = parseInt(element.getAttribute("Duration") || "0");
      const power = parseFloat(element.getAttribute("Power") || "0.7") * 100;

      segments.push({
        id: generateId(),
        type: "steady",
        duration,
        targetPower: {
          type: "percent_ftp",
          value: Math.round(power),
        },
      });
      break;
    }

    case "freeride": {
      const duration = parseInt(element.getAttribute("Duration") || "0");

      segments.push({
        id: generateId(),
        type: "recovery",
        duration,
        targetPower: {
          type: "percent_ftp",
          value: 50,
        },
        instructions: "Free ride - choose your own intensity",
      });
      break;
    }

    case "intervalst": {
      const repeat = parseInt(element.getAttribute("Repeat") || "1");
      const onDuration = parseInt(element.getAttribute("OnDuration") || "0");
      const offDuration = parseInt(element.getAttribute("OffDuration") || "0");
      const onPower = parseFloat(element.getAttribute("OnPower") || "1") * 100;
      const offPower = parseFloat(element.getAttribute("OffPower") || "0.5") * 100;
      const cadence = element.getAttribute("Cadence");
      const cadenceResting = element.getAttribute("CadenceResting");

      for (let i = 0; i < repeat; i++) {
        // On interval
        segments.push({
          id: generateId(),
          type: "interval",
          duration: onDuration,
          targetPower: {
            type: "percent_ftp",
            value: Math.round(onPower),
          },
          cadenceTarget: cadence
            ? { min: parseInt(cadence), max: parseInt(cadence) + 10 }
            : undefined,
        });

        // Off interval (recovery)
        segments.push({
          id: generateId(),
          type: "recovery",
          duration: offDuration,
          targetPower: {
            type: "percent_ftp",
            value: Math.round(offPower),
          },
          cadenceTarget: cadenceResting
            ? { min: parseInt(cadenceResting), max: parseInt(cadenceResting) + 10 }
            : undefined,
        });
      }
      break;
    }

    case "ramp": {
      const duration = parseInt(element.getAttribute("Duration") || "0");
      const powerLow = parseFloat(element.getAttribute("PowerLow") || "0.5") * 100;
      const powerHigh = parseFloat(element.getAttribute("PowerHigh") || "1") * 100;

      segments.push({
        id: generateId(),
        type: powerHigh > powerLow ? "warmup" : "cooldown",
        duration,
        targetPower: {
          type: "percent_ftp",
          value: Math.round(powerLow),
          valueHigh: Math.round(powerHigh),
        },
      });
      break;
    }

    case "intfreeride": {
      // IntFreeRide is similar to FreeRide but used within interval blocks
      const duration = parseInt(element.getAttribute("Duration") || "0");

      segments.push({
        id: generateId(),
        type: "recovery",
        duration,
        targetPower: {
          type: "percent_ftp",
          value: 50,
        },
      });
      break;
    }

    default:
      // Try to handle unknown elements gracefully
      console.warn(`Unknown ZWO element: ${tag}`);
      break;
  }

  return segments;
}
