import { Workout, Segment } from "@/types/workout";

export function exportToZwo(workout: Workout, ftp: number): string {
  const segments = workout.segments;

  const workoutSteps = segments.map((segment) => segmentToZwo(segment)).join("\n        ");

  const zwoContent = `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
    <author>Workout Creator</author>
    <name>${escapeXml(workout.name)}</name>
    <description>${escapeXml(workout.description)}</description>
    <sportType>bike</sportType>
    <tags>
        <tag name="INTERVALS"/>
    </tags>
    <workout>
        ${workoutSteps}
    </workout>
</workout_file>`;

  return zwoContent;
}

function segmentToZwo(segment: Segment): string {
  const power = segment.targetPower.value / 100;
  const powerHigh = segment.targetPower.valueHigh
    ? segment.targetPower.valueHigh / 100
    : power;

  switch (segment.type) {
    case "warmup":
      return `<Warmup Duration="${segment.duration}" PowerLow="${power.toFixed(2)}" PowerHigh="${powerHigh.toFixed(2)}"/>`;

    case "cooldown":
      // For cooldown, power goes from high to low
      return `<Cooldown Duration="${segment.duration}" PowerLow="${powerHigh.toFixed(2)}" PowerHigh="${power.toFixed(2)}"/>`;

    case "interval":
      return `<SteadyState Duration="${segment.duration}" Power="${power.toFixed(2)}"${segment.cadenceTarget ? ` Cadence="${segment.cadenceTarget.min}"` : ""}/>`;

    case "recovery":
      return `<SteadyState Duration="${segment.duration}" Power="${power.toFixed(2)}"/>`;

    case "steady":
    default:
      return `<SteadyState Duration="${segment.duration}" Power="${power.toFixed(2)}"${segment.cadenceTarget ? ` Cadence="${segment.cadenceTarget.min}"` : ""}/>`;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Export intervals as a repeating block
export function exportIntervalsToZwo(
  onDuration: number,
  offDuration: number,
  onPower: number,
  offPower: number,
  repeat: number
): string {
  return `<IntervalsT Repeat="${repeat}" OnDuration="${onDuration}" OffDuration="${offDuration}" OnPower="${(onPower / 100).toFixed(2)}" OffPower="${(offPower / 100).toFixed(2)}"/>`;
}
