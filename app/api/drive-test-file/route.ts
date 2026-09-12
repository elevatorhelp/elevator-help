type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

const TEST_FOLDER_ID = "1GAuMp6D99K9kqLkUMJZM-iHoIS319Loo";

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
    throw new Error(await tokenResponse.text());
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

    const params = new URLSearchParams({
      q: `'${TEST_FOLDER_ID}' in parents and trashed = false`,
      fields:
        "files(id,name,mimeType,size,modifiedTime,webViewLink)",
      pageSize: "100",
      orderBy: "name",
    });

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();

    const files = data.files ?? [];

    const pdfFiles = files.filter(
      (file: { mimeType?: string }) =>
        file.mimeType === "application/pdf"
    );

    return Response.json({
      ok: true,
      folder: "99_Test",
      totalFiles: files.length,
      pdfFiles,
      allFiles: files,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error.",
      },
      { status: 500 }
    );
  }
}