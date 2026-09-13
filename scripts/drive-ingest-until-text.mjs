import { spawn } from "node:child_process";

const TARGET_TEXT_FILES = Number(process.env.TARGET_TEXT_FILES || "2");
const MAX_SCAN_FILES = Number(process.env.MAX_SCAN_FILES || "20");

function runOne() {
  return new Promise((resolve, reject) => {
    let output = "";

    const child = spawn(
      process.execPath,
      ["scripts/drive-ingest.mjs"],
      {
        env: {
          ...process.env,
          MAX_FILES: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`drive-ingest.mjs exited with code ${code}`));
        return;
      }

      const processedMatch = output.match(
        /Done\. Processed (\d+) file\(s\); (\d+) changed file\(s\) remain\./
      );

      const chunkMatches = [
        ...output.matchAll(/Extracted (\d+) chunks from (\d+) pages/g),
      ];

      const chunks = chunkMatches.reduce(
        (sum, match) => sum + Number(match[1] || 0),
        0
      );

      resolve({
        processed: Number(processedMatch?.[1] || 0),
        remaining: Number(processedMatch?.[2] || 0),
        chunks,
      });
    });
  });
}

async function main() {
  let scanned = 0;
  let textFiles = 0;

  console.log(
    `Smart scan: looking for ${TARGET_TEXT_FILES} text-bearing PDF(s), scanning at most ${MAX_SCAN_FILES} file(s).`
  );

  while (scanned < MAX_SCAN_FILES && textFiles < TARGET_TEXT_FILES) {
    const result = await runOne();

    if (result.processed === 0) {
      console.log("No changed PDFs remain. Stopping scan.");
      break;
    }

    scanned += result.processed;

    if (result.chunks > 0) {
      textFiles += 1;
      console.log(
        `Text-bearing PDF found: ${result.chunks} chunk(s). Progress ${textFiles}/${TARGET_TEXT_FILES}.`
      );
    } else {
      console.log("No extractable text in this PDF; marked processed and continuing.");
    }

    if (result.remaining === 0) break;
  }

  console.log(
    `Smart scan complete. Scanned ${scanned} file(s); found ${textFiles} text-bearing PDF(s).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
