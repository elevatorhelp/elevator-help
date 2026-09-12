type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

const TEST_FILE_ID = "145ksVHp7Xy_NvdW0Hm5dOK50RJQG3ZeM";

function base64UrlEncode(input: string | ArrayBuffer) {
  let bytes: Uint8Array;

  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function getGoogleAccessToken(serviceAccount: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: serviceAccount.token_uri,
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken =
    `${base64UrlEncode(JSON.stringify(header))}.` +
    `${base64UrlEncode(JSON.stringify(payload))}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google token error: ${await tokenResponse.text()}`);
  }

  const tokenData = await tokenResponse.json();

  return tokenData.access_token as string;
}

export async function GET() {
  try {
    const rawServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!rawServiceAccount) {
      return Response.json(
        {
          ok: false,
          error: "GOOGLE_SERVICE_ACCOUNT_JSON secret is missing.",
        },
        { status: 500 }
      );
    }

    const serviceAccount = JSON.parse(
      rawServiceAccount
    ) as ServiceAccount;

    const accessToken = await getGoogleAccessToken(serviceAccount);

    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${TEST_FILE_ID}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Range: "bytes=0-1023",
        },
      }
    );

    if (!driveResponse.ok && driveResponse.status !== 206) {
      throw new Error(
        `Google Drive download error: ${await driveResponse.text()}`
      );
    }

    const buffer = await driveResponse.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const firstBytesHex = Array.from(bytes.slice(0, 32))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");

    const firstBytesText = Array.from(bytes.slice(0, 16))
      .map((byte) =>
        byte >= 32 && byte <= 126
          ? String.fromCharCode(byte)
          : "."
      )
      .join("");

    return Response.json({
      ok: true,
      message: "PDF binary download successful.",
      fileId: TEST_FILE_ID,
      status: driveResponse.status,
      contentType: driveResponse.headers.get("content-type"),
      contentLength: driveResponse.headers.get("content-length"),
      contentRange: driveResponse.headers.get("content-range"),
      downloadedBytes: bytes.length,
      firstBytesHex,
      firstBytesText,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown download error.",
      },
      { status: 500 }
    );
  }
}