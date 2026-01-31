import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    // User denied access or other error
    return NextResponse.redirect(
      new URL(`/?strava_error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?strava_error=no_code", request.url)
    );
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/?strava_error=server_config", request.url)
    );
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Strava token exchange failed:", errorData);
      return NextResponse.redirect(
        new URL("/?strava_error=token_exchange", request.url)
      );
    }

    const tokenData = await tokenResponse.json();

    // Redirect back to app with tokens in URL fragment (client-side only, not logged server-side)
    // Using URL fragment (#) so tokens stay client-side and aren't logged by servers/proxies
    const tokenPayload = encodeURIComponent(
      JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        athlete: {
          id: tokenData.athlete?.id,
          firstname: tokenData.athlete?.firstname,
          lastname: tokenData.athlete?.lastname,
        },
      })
    );

    // Use fragment (#) not query param (?) to keep tokens out of server logs
    return NextResponse.redirect(
      new URL(`/#strava_auth=${tokenPayload}`, request.url)
    );
  } catch (err) {
    console.error("Strava OAuth error:", err);
    return NextResponse.redirect(
      new URL("/?strava_error=server_error", request.url)
    );
  }
}
