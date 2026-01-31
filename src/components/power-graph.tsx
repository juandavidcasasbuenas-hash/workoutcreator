"use client";

import { useRef, useEffect, useState } from "react";
import { Segment, getZoneColor } from "@/types/workout";
import { RecordedDataPoint } from "@/types/trainer";
import { getPowerAsPercentFTP, formatDuration, getSegmentTypeName } from "@/lib/workout-utils";

interface PowerGraphProps {
  segments: Segment[];
  ftp: number;
  height?: number;
  onSegmentClick?: (index: number) => void;
  highlightedIndex?: number | null;
  // Player mode props
  playerMode?: boolean;
  currentTime?: number;
  realTimePower?: number | null;
  // Review mode props
  recordedData?: RecordedDataPoint[];
}

export function PowerGraph({
  segments,
  ftp,
  height = 200,
  onSegmentClick,
  highlightedIndex,
  playerMode = false,
  currentTime = 0,
  realTimePower = null,
  recordedData,
}: PowerGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredSegment, setHoveredSegment] = useState<{
    segment: Segment;
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

  // Calculate max power from segments, with minimum of 150%
  const segmentMaxPower = Math.max(
    ...segments.map(seg => Math.max(seg.targetPower.value, seg.targetPower.valueHigh ?? 0))
  );
  const maxPower = Math.max(150, Math.ceil(segmentMaxPower / 10) * 10 + 10); // Round up to nearest 10 + padding

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width } = dimensions;
    const graphHeight = height - 30; // Leave space for time labels

    // Helper to convert power % to Y coordinate
    const powerToY = (power: number) => graphHeight - (power / maxPower) * graphHeight;
    const baselineY = graphHeight; // 0% power line

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid lines - minimal, subtle
    ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
    ctx.lineWidth = 1;

    // Generate power lines dynamically based on maxPower
    const powerLines = [];
    for (let p = 50; p < maxPower; p += 25) {
      powerLines.push(p);
    }
    powerLines.forEach((power) => {
      const y = powerToY(power);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(`${power}%`, 4, y - 3);
    });

    // Draw segments
    let currentX = 0;

    segments.forEach((segment, index) => {
      const segmentWidth = (segment.duration / totalDuration) * width;
      const powerStart = segment.targetPower.value;
      const powerEnd = segment.targetPower.valueHigh ?? powerStart;

      // Determine if this is a ramp (warmup/cooldown with different start/end powers)
      const isRamp = powerStart !== powerEnd;

      // Get average power for color
      const avgPower = (powerStart + powerEnd) / 2;
      const color = getZoneColor(avgPower);

      // Check if this segment is highlighted or hovered
      const isHighlighted = highlightedIndex === index;
      const isHovered = hoveredSegment?.index === index;

      ctx.fillStyle = color;
      ctx.beginPath();

      if (isRamp) {
        // Draw trapezoid for ramps
        const yStart = powerToY(powerStart);
        const yEnd = powerToY(powerEnd);

        ctx.moveTo(currentX, baselineY);
        ctx.lineTo(currentX, yStart);
        ctx.lineTo(currentX + segmentWidth, yEnd);
        ctx.lineTo(currentX + segmentWidth, baselineY);
        ctx.closePath();
      } else {
        // Draw rectangle for steady power
        const y = powerToY(powerStart);
        ctx.rect(currentX, y, segmentWidth, baselineY - y);
      }

      ctx.fill();

      // Segment border - crisp edges, no heavy strokes
      if (isHighlighted || isHovered) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      currentX += segmentWidth;
    });

    // Draw FTP line - subtle but visible
    const ftpY = powerToY(100);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, ftpY);
    ctx.lineTo(width, ftpY);
    ctx.stroke();
    ctx.setLineDash([]);

    // FTP label
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillText("FTP", width - 28, ftpY - 5);

    // Draw recorded power data overlay
    if (recordedData && recordedData.length > 0) {
      // Filter to points with valid power data
      const powerPoints = recordedData.filter(p => p.actualPower !== null && p.actualPower > 0);

      if (powerPoints.length > 1) {
        // Draw filled area under the power line (subtle cyan)
        ctx.fillStyle = "rgba(6, 182, 212, 0.15)";
        ctx.beginPath();
        const firstPoint = powerPoints[0];
        const firstX = (firstPoint.elapsedTime / totalDuration) * width;
        ctx.moveTo(firstX, graphHeight);

        powerPoints.forEach((point) => {
          const x = (point.elapsedTime / totalDuration) * width;
          const powerPercent = ((point.actualPower as number) / ftp) * 100;
          const y = powerToY(powerPercent);
          ctx.lineTo(x, y);
        });

        const lastPoint = powerPoints[powerPoints.length - 1];
        const lastX = (lastPoint.elapsedTime / totalDuration) * width;
        ctx.lineTo(lastX, graphHeight);
        ctx.closePath();
        ctx.fill();

        // Draw the actual power line (cyan for visibility against all zones)
        ctx.strokeStyle = "#0891b2";
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        powerPoints.forEach((point, i) => {
          const x = (point.elapsedTime / totalDuration) * width;
          const powerPercent = ((point.actualPower as number) / ftp) * 100;
          const y = powerToY(powerPercent);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();
      }
    }

    // Draw time axis
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.font = "11px system-ui, sans-serif";

    const timeMarkers = 5;
    for (let i = 0; i <= timeMarkers; i++) {
      const x = (i / timeMarkers) * width;
      const time = Math.round((i / timeMarkers) * totalDuration);
      const label = formatDuration(time);
      const labelWidth = ctx.measureText(label).width;
      ctx.fillText(label, Math.max(0, Math.min(x - labelWidth / 2, width - labelWidth)), height - 5);
    }

    // Player mode: Draw progress indicator and real-time power
    if (playerMode && currentTime >= 0) {
      const progressX = (currentTime / totalDuration) * width;

      // Draw progress line (vertical indicator) - clean, no glow
      ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, graphHeight);
      ctx.stroke();

      // Draw real-time power dot
      if (realTimePower !== null && realTimePower > 0) {
        const powerPercent = (realTimePower / ftp) * 100;
        const powerY = powerToY(powerPercent);

        // Draw power dot - solid cyan for visibility
        ctx.fillStyle = "#0891b2";
        ctx.beginPath();
        ctx.arc(progressX, powerY, 5, 0, Math.PI * 2);
        ctx.fill();

        // White border for visibility
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw power value near the dot
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.font = "bold 12px system-ui, sans-serif";
        const powerLabel = `${realTimePower}W`;
        const powerLabelWidth = ctx.measureText(powerLabel).width;
        const labelX = Math.min(progressX + 12, width - powerLabelWidth - 5);
        const labelY = Math.max(powerY - 12, 15);
        ctx.fillText(powerLabel, labelX, labelY);
      }
    }
  }, [segments, ftp, dimensions, totalDuration, height, highlightedIndex, hoveredSegment, maxPower, playerMode, currentTime, realTimePower, recordedData]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtPosition = (x / dimensions.width) * totalDuration;

    let accumulatedTime = 0;
    for (let i = 0; i < segments.length; i++) {
      accumulatedTime += segments[i].duration;
      if (timeAtPosition <= accumulatedTime) {
        setHoveredSegment({
          segment: segments[i],
          index: i,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        return;
      }
    }
    setHoveredSegment(null);
  };

  const handleMouseLeave = () => {
    setHoveredSegment(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSegmentClick) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtPosition = (x / dimensions.width) * totalDuration;

    let accumulatedTime = 0;
    for (let i = 0; i < segments.length; i++) {
      accumulatedTime += segments[i].duration;
      if (timeAtPosition <= accumulatedTime) {
        onSegmentClick(i);
        return;
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className={`w-full ${onSegmentClick ? 'cursor-pointer' : 'cursor-crosshair'}`}
      />

      {/* Tooltip */}
      {hoveredSegment && (
        <div
          className="absolute z-10 bg-popover border border-border rounded-lg shadow-lg p-3 pointer-events-none"
          style={{
            left: Math.min(hoveredSegment.x, dimensions.width - 180),
            top: Math.max(hoveredSegment.y - 80, 0),
          }}
        >
          <div className="font-medium">
            {getSegmentTypeName(hoveredSegment.segment.type)}
          </div>
          <div className="text-sm text-muted-foreground space-y-1 mt-1">
            <div>
              Power:{" "}
              {hoveredSegment.segment.targetPower.valueHigh
                ? `${hoveredSegment.segment.targetPower.value}-${hoveredSegment.segment.targetPower.valueHigh}% (${Math.round(hoveredSegment.segment.targetPower.value * ftp / 100)}-${Math.round(hoveredSegment.segment.targetPower.valueHigh * ftp / 100)}W)`
                : `${Math.round(getPowerAsPercentFTP(hoveredSegment.segment, ftp))}% (${Math.round(getPowerAsPercentFTP(hoveredSegment.segment, ftp) * ftp / 100)}W)`}
            </div>
            <div>Duration: {formatDuration(hoveredSegment.segment.duration)}</div>
            {hoveredSegment.segment.instructions && (
              <div className="italic">{hoveredSegment.segment.instructions}</div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-6 h-px bg-foreground/50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, currentColor 0px, currentColor 4px, transparent 4px, transparent 8px)' }} />
          <span>FTP (100%)</span>
        </div>
        {recordedData && recordedData.some(p => p.actualPower !== null) && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-cyan-600 rounded" />
            <span>Power</span>
          </div>
        )}
      </div>
    </div>
  );
}
