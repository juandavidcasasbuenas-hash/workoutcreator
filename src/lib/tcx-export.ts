import { RecordedDataPoint } from "@/types/trainer";
import { Segment } from "@/types/workout";

interface TCXExportOptions {
  workoutName: string;
  startTime: Date;
  recordedData: RecordedDataPoint[];
  segments: Segment[];
  ftp: number;
}

function formatTCXDateTime(date: Date): string {
  return date.toISOString();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateTCX({
  workoutName,
  startTime,
  recordedData,
  segments,
  ftp,
}: TCXExportOptions): string {
  if (recordedData.length === 0) {
    throw new Error("No recorded data to export");
  }

  // Group data points by segment to create laps
  const lapData: Map<number, RecordedDataPoint[]> = new Map();

  for (const point of recordedData) {
    const segmentIndex = point.segmentIndex;
    if (!lapData.has(segmentIndex)) {
      lapData.set(segmentIndex, []);
    }
    lapData.get(segmentIndex)!.push(point);
  }

  // Calculate totals
  const totalTimeSeconds = recordedData[recordedData.length - 1].elapsedTime;
  const avgPower = recordedData.reduce((sum, p) => sum + (p.actualPower ?? 0), 0) / recordedData.length;
  const maxPower = Math.max(...recordedData.map(p => p.actualPower ?? 0));
  const avgCadence = recordedData.filter(p => p.cadence !== null).length > 0
    ? recordedData.reduce((sum, p) => sum + (p.cadence ?? 0), 0) / recordedData.filter(p => p.cadence !== null).length
    : 0;
  const avgHeartRate = recordedData.filter(p => p.heartRate !== null).length > 0
    ? recordedData.reduce((sum, p) => sum + (p.heartRate ?? 0), 0) / recordedData.filter(p => p.heartRate !== null).length
    : 0;
  const maxHeartRate = Math.max(...recordedData.map(p => p.heartRate ?? 0));

  // Build laps XML
  let lapsXml = "";
  let lapStartTime = new Date(startTime);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const points = lapData.get(i) || [];

    if (points.length === 0) continue;

    const lapDuration = segment.duration;
    const lapAvgPower = points.reduce((sum, p) => sum + (p.actualPower ?? 0), 0) / points.length;
    const lapMaxPower = Math.max(...points.map(p => p.actualPower ?? 0));
    const lapAvgCadence = points.filter(p => p.cadence !== null).length > 0
      ? points.reduce((sum, p) => sum + (p.cadence ?? 0), 0) / points.filter(p => p.cadence !== null).length
      : 0;
    const lapAvgHr = points.filter(p => p.heartRate !== null).length > 0
      ? points.reduce((sum, p) => sum + (p.heartRate ?? 0), 0) / points.filter(p => p.heartRate !== null).length
      : 0;
    const lapMaxHr = Math.max(...points.map(p => p.heartRate ?? 0));

    // Build trackpoints
    let trackpointsXml = "";
    for (const point of points) {
      const pointTime = new Date(startTime.getTime() + point.elapsedTime * 1000);

      trackpointsXml += `
          <Trackpoint>
            <Time>${formatTCXDateTime(pointTime)}</Time>${
              point.heartRate !== null ? `
            <HeartRateBpm>
              <Value>${Math.round(point.heartRate)}</Value>
            </HeartRateBpm>` : ""
            }${
              point.cadence !== null ? `
            <Cadence>${Math.round(point.cadence)}</Cadence>` : ""
            }
            <Extensions>
              <ns3:TPX>${
                point.actualPower !== null ? `
                <ns3:Watts>${Math.round(point.actualPower)}</ns3:Watts>` : ""
              }
              </ns3:TPX>
            </Extensions>
          </Trackpoint>`;
    }

    lapsXml += `
      <Lap StartTime="${formatTCXDateTime(lapStartTime)}">
        <TotalTimeSeconds>${lapDuration}</TotalTimeSeconds>
        <DistanceMeters>0</DistanceMeters>
        <MaximumSpeed>0</MaximumSpeed>
        <Calories>0</Calories>${
          lapAvgHr > 0 ? `
        <AverageHeartRateBpm>
          <Value>${Math.round(lapAvgHr)}</Value>
        </AverageHeartRateBpm>
        <MaximumHeartRateBpm>
          <Value>${Math.round(lapMaxHr)}</Value>
        </MaximumHeartRateBpm>` : ""
        }
        <Intensity>Active</Intensity>
        <Cadence>${Math.round(lapAvgCadence)}</Cadence>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>${trackpointsXml}
        </Track>
        <Extensions>
          <ns3:LX>
            <ns3:AvgWatts>${Math.round(lapAvgPower)}</ns3:AvgWatts>
            <ns3:MaxWatts>${Math.round(lapMaxPower)}</ns3:MaxWatts>
          </ns3:LX>
        </Extensions>
        <Notes>${escapeXml(segment.type)} - Target: ${segment.targetPower.value}% FTP</Notes>
      </Lap>`;

    // Update lap start time for next lap
    lapStartTime = new Date(lapStartTime.getTime() + lapDuration * 1000);
  }

  // Build full TCX
  const tcx = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
    <Activity Sport="Biking">
      <Id>${formatTCXDateTime(startTime)}</Id>
      <Notes>${escapeXml(workoutName)} - FTP: ${ftp}W - Created with BrowserTurbo</Notes>${lapsXml}
      <Training VirtualPartner="false">
        <Plan Type="Workout" IntervalWorkout="false">
          <Name>${escapeXml(workoutName)}</Name>
        </Plan>
      </Training>
      <Creator xsi:type="Device_t">
        <Name>BrowserTurbo</Name>
        <UnitId>0</UnitId>
        <ProductID>0</ProductID>
      </Creator>
    </Activity>
  </Activities>
  <Author xsi:type="Application_t">
    <Name>BrowserTurbo</Name>
    <Build>
      <Version>
        <VersionMajor>1</VersionMajor>
        <VersionMinor>0</VersionMinor>
        <BuildMajor>0</BuildMajor>
        <BuildMinor>0</BuildMinor>
      </Version>
    </Build>
    <LangID>en</LangID>
    <PartNumber>000-00000-00</PartNumber>
  </Author>
</TrainingCenterDatabase>`;

  return tcx;
}

export function downloadTCX(tcxContent: string, filename: string): void {
  const blob = new Blob([tcxContent], { type: "application/vnd.garmin.tcx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".tcx") ? filename : `${filename}.tcx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
