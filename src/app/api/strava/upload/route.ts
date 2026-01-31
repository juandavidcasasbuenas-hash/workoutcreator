import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { access_token, tcx_data, name, description } = await request.json();

    if (!access_token) {
      return NextResponse.json(
        { error: "access_token is required" },
        { status: 400 }
      );
    }

    if (!tcx_data) {
      return NextResponse.json(
        { error: "tcx_data is required" },
        { status: 400 }
      );
    }

    // Create form data for multipart upload
    const formData = new FormData();

    // Convert TCX string to a Blob
    const tcxBlob = new Blob([tcx_data], { type: "application/vnd.garmin.tcx+xml" });
    formData.append("file", tcxBlob, "workout.tcx");
    formData.append("data_type", "tcx");
    formData.append("activity_type", "virtualride");

    if (name) {
      formData.append("name", name);
    }
    if (description) {
      formData.append("description", description);
    }

    // Upload to Strava
    const uploadResponse = await fetch("https://www.strava.com/api/v3/uploads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.text();
      console.error("Strava upload failed:", errorData);

      if (uploadResponse.status === 401) {
        return NextResponse.json(
          { error: "Unauthorized - token may be expired" },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: "Failed to upload to Strava", details: errorData },
        { status: uploadResponse.status }
      );
    }

    const uploadData = await uploadResponse.json();

    // The upload is asynchronous, so we get an upload_id
    // We need to poll for the status
    return NextResponse.json({
      upload_id: uploadData.id,
      status: uploadData.status,
      activity_id: uploadData.activity_id,
      error: uploadData.error,
    });
  } catch (err) {
    console.error("Strava upload error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}

// Endpoint to check upload status
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const uploadId = searchParams.get("upload_id");

  // Get access token from Authorization header (not URL for security)
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  if (!uploadId || !accessToken) {
    return NextResponse.json(
      { error: "upload_id is required and Authorization header must contain Bearer token" },
      { status: 400 }
    );
  }

  try {
    const statusResponse = await fetch(
      `https://www.strava.com/api/v3/uploads/${uploadId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!statusResponse.ok) {
      const errorData = await statusResponse.text();
      console.error("Strava status check failed:", errorData);
      return NextResponse.json(
        { error: "Failed to check upload status" },
        { status: statusResponse.status }
      );
    }

    const statusData = await statusResponse.json();

    return NextResponse.json({
      upload_id: statusData.id,
      status: statusData.status,
      activity_id: statusData.activity_id,
      error: statusData.error,
    });
  } catch (err) {
    console.error("Strava status check error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
