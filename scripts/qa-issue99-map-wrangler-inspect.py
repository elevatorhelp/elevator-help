"""Read-only metadata-shape summary of original synthetic QA Map vectors.

The full Wrangler output (which can include embeddings and source text) is
captured solely in process memory, never printed, uploaded or saved.
"""
import hashlib, json, os, pathlib, re, subprocess, sys
TARGET="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz"
INDICES={
    "legacy":"elevator-help-staging-test",
    "multilingual":"elevator-help-staging-test-v2",
}
assert os.environ.get("GITHUB_ACTIONS")=="true"
assert os.environ.get("GITHUB_REF")=="refs/heads/qa/issue99-map-dual-index-readback-forensics-20261115"
ROOT=pathlib.Path(os.environ["RUNNER_TEMP"])
def docs_from_output(output):
    output=re.sub(r"\x1b\[[0-9;]*m","",output)
    try:
        value=json.loads(output)
        if isinstance(value,list):return value
        if isinstance(value,dict) and isinstance(value.get("result"),list):
            return value["result"]
    except (ValueError,TypeError):
        pass
    decoder=json.JSONDecoder()
    for i,c in enumerate(output):
        if c not in "[{":continue
        try:value,end=decoder.raw_decode(output[i:])
        except ValueError:continue
        if isinstance(value,list) and (not value or isinstance(value[0],dict)):
            return value
        if isinstance(value,dict) and isinstance(value.get("result"),list):
            return value["result"]
    raise RuntimeError("QA_WRANGLER_JSON_VECTOR_SHAPE_UNSUPPORTED")
def field_invalid(meta):
    if not isinstance(meta,dict):return {"metadata_not_object"}
    tests={
        "sourceFileId":meta.get("sourceFileId")==TARGET,
        "sourceFingerprint":isinstance(meta.get("sourceFingerprint"),str) and bool(meta["sourceFingerprint"]),
        "stagedGeneration":type(meta.get("stagedGeneration")) is int and meta["stagedGeneration"]>=1,
        "stagedLayer":meta.get("stagedLayer")=="map",
        "status":meta.get("status")=="active",
        "text":isinstance(meta.get("text"),str) and 0<len(meta["text"].strip())<=60000,
        "fileName":isinstance(meta.get("fileName"),str) and 0<len(meta["fileName"].strip())<=512,
        "sourcePath":isinstance(meta.get("sourcePath"),str) and 0<len(meta["sourcePath"].strip())<=1024,
        "page":type(meta.get("page")) is int and meta["page"]>=1,
        "pageEnd":type(meta.get("pageEnd")) is int and type(meta.get("page")) is int and meta["pageEnd"]>=meta["page"],
        "contentType":meta.get("contentType")=="document-map",
    }
    return {k for k,v in tests.items() if not v}
def main():
    rows={}
    for kind,name in INDICES.items():
        listing=json.loads((ROOT/("qa-index-"+kind+".json")).read_text())
        if isinstance(listing,dict) and isinstance(listing.get("result"),dict):listing=listing["result"]
        assert not listing.get("isTruncated"),"QA_VECTOR_LIST_INCOMPLETE"
        ids=[x["id"] for x in listing.get("vectors",[]) if isinstance(x,dict) and
          re.fullmatch(r"v2m-[0-9a-z]+-[0-9a-f]{40}",x.get("id",""))]
        assert len(ids)<=20,"QA_TOO_MANY_TEST_MAP_VECTORS"
        result=subprocess.run(["npx","wrangler","vectorize","get-vectors",name,"--ids",*ids],
            cwd=os.environ["GITHUB_WORKSPACE"],capture_output=True,text=True,
            timeout=90,check=False) if ids else None
        assert result is None or result.returncode==0,"QA_WRANGLER_GET_VECTORS_NOT_AVAILABLE"
        docs=docs_from_output(result.stdout) if result else []
        target=[d for d in docs if isinstance(d,dict) and d.get("metadata",{}).get("sourceFileId")==TARGET]
        failures={}
        valid=0
        recovered=0
        for d in target:
            m=d.get("metadata")
            missing=field_invalid(m)
            if not missing:
                valid+=1
                # Recover exact map logical ID from the persisted node metadata.
                # This uses the same U+001F separator and SHA-256 map stableId
                # recipe as app/api/document-map-ingest/route.ts.
                summary=m["text"].split("Summary: ",1)[-1]
                parts=[TARGET,str(m["mapVersion"]),m.get("modifiedTime") or "",
                    str(m["page"]),str(m["pageEnd"]),m["mapNodeType"],
                    m.get("sectionId") or "",m.get("sectionTitle") or "",summary]
                digest=hashlib.sha256("\u001f".join(parts).encode()).hexdigest()
                logical="map-"+digest[:40]
                epoch=m["stagedGeneration"]
                chars="0123456789abcdefghijklmnopqrstuvwxyz"
                number=epoch; base36=""
                while number:
                    number,rem=divmod(number,36)
                    base36=chars[rem]+base36
                packed=json.dumps(["drive:1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC",epoch,TARGET,"map",logical,m["sourceFingerprint"]],
                    separators=(",",":"),ensure_ascii=False)
                expected="v2m-"+base36+"-"+hashlib.sha256(packed.encode()).hexdigest()[:40]
                if d["id"]==expected:recovered+=1
            for field in missing:failures[field]=failures.get(field,0)+1
        rows[kind]={d["id"] for d in target}
        print(f"QA_ONLY_{kind}_synthetic_map_ids_visible={len(target)} valid_metadata={valid} reproducible_physical_id={recovered} field_failures={json.dumps(failures,sort_keys=True)}")
    print("QA_ONLY_SYNTHETIC_MAP_IDS_IN_BOTH_INDICES="+str(len(rows["legacy"]&rows["multilingual"])))
    print("QA_ONLY_NO_GEMINI_NO_WRITES")
try:main()
except Exception as exc:
    code=str(exc)
    if not re.fullmatch(r"QA_[A-Z0-9_]+",code):code="QA_VECTOR_METADATA_INSPECTION_FAILED"
    print("::error::"+code,file=sys.stderr)
    sys.exit(1)
