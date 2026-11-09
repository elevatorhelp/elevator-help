/**
 * Two-page original synthetic PDF, generated locally in memory.
 * No private files, external links, customer source material or Gemini.
 */
export function makeQaTwoPagePdf(){
  const escape=s=>s.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)");
  const pageText=[
    "QA-SPEC Synthetic Section 1.2.3 Page One",
    "QA-SPEC Synthetic Section 1.2.4 Page Two"
  ];
  const stream=s=>"BT /F1 14 Tf 50 700 Td ("+escape(s)+") Tj ET\n";
  const content=pageText.map(stream);
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length "+Buffer.byteLength(content[0])+" >>\nstream\n"+content[0]+"endstream",
    "<< /Length "+Buffer.byteLength(content[1])+" >>\nstream\n"+content[1]+"endstream",
  ];
  const parts=[Buffer.from("%PDF-1.4\n")],offsets=[0];
  let pos=parts[0].length;
  for(let i=0;i<objects.length;i++){
    offsets.push(pos);
    const item=Buffer.from((i+1)+" 0 obj\n"+objects[i]+"\nendobj\n");
    parts.push(item);pos+=item.length;
  }
  const xref=pos;
  parts.push(Buffer.from("xref\n0 "+offsets.length+"\n0000000000 65535 f \n"+
    offsets.slice(1).map(v=>String(v).padStart(10,"0")+" 00000 n \n").join("")+
    "trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n"));
  return new Uint8Array(Buffer.concat(parts));
}

export async function extractQaTwoPagePdf(){
  const {getDocumentProxy,extractText}=await import("unpdf");
  const doc=await getDocumentProxy(makeQaTwoPagePdf(),{maxImageSize:16_777_216});
  const result=await extractText(doc,{mergePages:false});
  if(result.totalPages!==2 || !Array.isArray(result.text) ||
     result.text.length!==2 ||
     !result.text[0].includes("1.2.3") ||
     !result.text[1].includes("1.2.4"))
    throw Error("QA_SYNTHETIC_PDF_EXTRACTION_INVALID");
  return result.text;
}
