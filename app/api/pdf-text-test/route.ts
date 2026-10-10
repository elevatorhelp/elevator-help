import { extractText, getDocumentProxy } from "unpdf";

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
    throw new Error(
      `Google token error: ${await tokenResponse.text()}`
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
  };

  return tokenData.access_token;
}

export async function GET() {
  try {
    const rawServiceAccount =
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

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

    const accessToken =
      await getGoogleAccessToken(serviceAccount);

    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${TEST_FILE_ID}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!driveResponse.ok) {
      throw new Error(
        `Drive download error: ${await driveResponse.text()}`
      );
    }

    const pdfBuffer = await driveResponse.arrayBuffer();

    const pdf = await getDocumentProxy(
      new Uint8Array(pdfBuffer)
    );

    const { totalPages, text } = await extractText(pdf, {
      mergePages: true,
    });

    const fullText =
  typeof text === "string"
    ? text
    : String(text ?? "");

    const lsuIndex = fullText
      .toLowerCase()
      .indexOf("lsu");

    const lsuPreview =
      lsuIndex >= 0
        ? fullText.slice(
            Math.max(0, lsuIndex - 500),
            lsuIndex + 1500
          )
        : null;

    return Response.json({
      ok: true,
      file: "mipa_FST-3_de.pdf",
      pdfBytes: pdfBuffer.byteLength,
      totalPages,
      extractedCharacters: fullText.length,
      containsLSU: lsuIndex >= 0,
      firstText: fullText.slice(0, 3000),
      lsuPreview,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown PDF extraction error.",
      },
      { status: 500 }
    );
  }
}